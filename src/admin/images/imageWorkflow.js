/**
 * Product image workflow: decides which products need which images, builds a manifest with
 * stable file names and concept prompts, matches supplied image files to manifest entries,
 * and plans uploads/assignments.
 *
 * Safety model
 *  - LIVE_IMAGE_WRITES_ENABLED is false: the page runs in dry-run mode only (no uploads, no
 *    database writes). Turning it on is a code change that needs explicit approval.
 *  - Products that already have any stored image are skipped entirely; images are never replaced.
 *  - Concept (AI/unverified) images go to products/concepts/ and may only be assigned to
 *    inactive products. Real product photographs go to products/.
 *  - Nothing here changes product status, prices, stock, SKUs, descriptions or variants.
 */
import { getStoragePublicUrl, getStorageObjectInfo, uploadStorageFileToPath } from '../../lib/storage';
import { assignProductImages } from '../../services/products';
import { STORAGE_BUCKET } from '../../lib/supabase';

export const LIVE_IMAGE_WRITES_ENABLED = false;

export const PILOT_SLUGS = ['khamrah-attar', 'khamrah-perfume-spray'];
export const MIN_IMAGE_SIDE = 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME_EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/pjpeg': 'jpg' };
const EXT_MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };

// Records flagged while reviewing the source price list (unclear names, marks of unknown meaning,
// suspicious prices). Matched on the start of the product slug. They need identity confirmation here.
export const REVIEW_FLAGS = [
  { base: 'a-damas-al-dajl', reason: 'Handwritten name spelling unclear in the source.' },
  { base: 'a-khaymain-sultan', reason: 'Handwritten name spelling unclear in the source.' },
  { base: 'montle-tonka', reason: 'Printed spelling "Montle Tonka" may be a misspelling.' },
  { base: 'ajmal-1001-night', reason: 'X mark in the source photo; meaning not specified.' },
  { base: 'al-fareed', reason: 'X mark in the source photo; meaning not specified.' },
  { base: 'al-wisam', reason: 'Handwritten mark beside the name; meaning not specified.' },
  { base: 'arabian-oud-kaleemat', reason: 'X mark in the source photo; meaning not specified.' },
  { base: 'blue-oud-ibrahim-al-qureshi', reason: 'X mark in the source photo; meaning not specified.' },
  { base: 'summer-oud', reason: 'X mark in the source photo; meaning not specified.' },
  { base: 'sabaya', reason: 'Only some prices were visible in the source.' },
  { base: 'blue-musk', reason: 'Source price Rs 58 for 6 ml needs confirmation.' },
];
// Records that must never receive images or invented identities
const EXCLUDED = [
  { test: (slug) => /unidentified|photo-fragment|unknown-item/.test(slug), reason: 'Unidentified source record; no product identity to illustrate.' },
  { test: (slug) => slug === 'zara' || slug.startsWith('zara-'), reason: 'Blocked source record (Zara, no prices).' },
];

export const ROLE_LABEL = { main: 'Primary (glass)', 'glass-main': 'Glass bottle (primary)', 'pvc-main': 'PVC bottle' };

const STYLE_PROMPT =
  'Premium e-commerce studio product photograph, square 1:1, 2048 x 2048 px. Warm cream-ivory seamless background, ' +
  'soft diffused studio key light with a subtle warm gold rim light, gentle realistic contact shadow. Minimal ' +
  'black-and-gold accents (a small polished black stone plinth and a thin gold line) kept softly out of focus. ' +
  'Single bottle centred, occupying about 60% of the frame height, three-quarter front view, identical camera ' +
  'height, framing and lighting for every image in the series.';
const NO_BRAND_PROMPT =
  'The bottle has a plain blank black-and-gold label panel with no text, letters, numbers, logos or brand marks, ' +
  'and no packaging box. Generic concept visual; it does not depict any specific branded product.';
const BOTTLE_PROMPT = {
  attar:
    'A small glass attar flacon (6 to 12 ml) with a faceted clear glass body, golden-amber perfume oil visible ' +
    'inside, and a short polished gold cap.',
  glass:
    'A clear heavy glass perfume spray bottle with thick glass walls, a polished gold spray cap and collar, and ' +
    'golden perfume visible inside.',
  pvc:
    'A lightweight clear PVC plastic perfume spray bottle with smooth rounded shoulders, thin walls and a glossy ' +
    'gold cap, golden perfume visible inside. The material must read clearly as plastic, not glass.',
};
export const NEGATIVE_PROMPT =
  'text, letters, numbers, typography, watermark, logo, brand name, readable label, packaging box, hands, ' +
  'people, duplicate bottles, distorted glass, warped cap, cluttered props, dark background';

const sizeValue = (s) => parseFloat(s) || Number.MAX_SAFE_INTEGER;
const bottleOf = (v) => (String(v.bottle_type || '').toLowerCase().includes('pvc') ? 'PVC Bottle' : 'Glass Bottle');

/** attar | spray | other, from the category and the bottle types actually stored */
export function productKind(p) {
  const cat = `${p.category_slug || ''} ${p.category || ''}`.toLowerCase();
  if (cat.includes('attar')) return 'attar';
  const hasPvc = (p.variants || []).some((v) => bottleOf(v) === 'PVC Bottle');
  if (hasPvc || cat.includes('perfume')) return 'spray';
  return 'other';
}

/**
 * One manifest entry per image needed. Products with both Glass and PVC variants need two
 * images (the bottles look different); products with one bottle type need one.
 * @param {object[]} products - formatted products from getProducts({ allStatuses: true })
 */
export function buildManifest(products) {
  const entries = [];
  for (const p of products) {
    const slug = String(p.slug || '');
    const kind = productKind(p);
    const variants = p.variants || [];
    const sizesFor = (bottle) =>
      [...new Set(variants.filter((v) => bottleOf(v) === bottle).map((v) => String(v.size_ml || '').trim()))]
        .sort((a, b) => sizeValue(a) - sizeValue(b));
    const glassSizes = sizesFor('Glass Bottle');
    const pvcSizes = sizesFor('PVC Bottle');
    const stored = p.stored_images || {};
    const hasStoredImage = Boolean(stored.main || stored.main_path || stored.glass || stored.glass_path || stored.pvc || stored.pvc_path);

    const excluded = EXCLUDED.find((x) => x.test(slug));
    const flag = REVIEW_FLAGS.find((f) => slug === f.base || slug.startsWith(`${f.base}-`));
    let skipReason = '';
    if (excluded) skipReason = excluded.reason;
    else if (hasStoredImage) skipReason = 'Already has an image; existing images are never replaced by this workflow.';
    else if (variants.length === 0) skipReason = 'No variants; bottle type unknown.';

    const base = {
      productId: p.id,
      productName: p.name,
      slug,
      category: p.category || '',
      kind,
      productStatus: p.is_active === false ? 'draft' : 'active',
      pilot: PILOT_SLUGS.includes(slug),
      flag: flag ? flag.reason : '',
      skipReason,
    };

    const both = glassSizes.length > 0 && pvcSizes.length > 0;
    if (both) {
      entries.push({ ...base, role: 'glass-main', bottle: 'Glass Bottle', sizes: glassSizes, fields: ['main', 'glass'], stem: `${slug}-glass-main`, bottlePrompt: BOTTLE_PROMPT.glass });
      entries.push({ ...base, role: 'pvc-main', bottle: 'PVC Bottle', sizes: pvcSizes, fields: ['pvc'], stem: `${slug}-pvc-main`, bottlePrompt: BOTTLE_PROMPT.pvc });
    } else if (pvcSizes.length > 0) {
      entries.push({ ...base, role: 'pvc-main', bottle: 'PVC Bottle', sizes: pvcSizes, fields: ['main', 'pvc'], stem: `${slug}-pvc-main`, bottlePrompt: BOTTLE_PROMPT.pvc });
    } else {
      entries.push({ ...base, role: 'main', bottle: 'Glass Bottle', sizes: glassSizes, fields: ['main'], stem: `${slug}-main`, bottlePrompt: kind === 'attar' ? BOTTLE_PROMPT.attar : BOTTLE_PROMPT.glass });
    }
  }

  // Two entries producing the same file name (e.g. slug "x" with "-glass-main" and slug "x-glass" with "-main")
  const byStem = new Map();
  for (const e of entries) {
    e.id = `${e.productId}|${e.role}`;
    e.prompt = `${STYLE_PROMPT} ${e.bottlePrompt} ${NO_BRAND_PROMPT}`;
    if (!byStem.has(e.stem)) byStem.set(e.stem, []);
    byStem.get(e.stem).push(e);
  }
  for (const list of byStem.values()) {
    if (list.length < 2) continue;
    for (const e of list) {
      e.collision = `File name "${e.stem}" is also produced by ${list.filter((o) => o !== e).map((o) => `"${o.productName}"`).join(', ')}.`;
    }
  }
  return entries;
}

/** Why an entry cannot take part right now ('' when it can). */
export function entryBlocker(e, verified) {
  if (e.skipReason) return e.skipReason;
  if (e.collision) return e.collision;
  if (e.flag && !verified[e.productId]) return `Flagged for review: ${e.flag}`;
  return '';
}

// ---------------------------------------------------------------------------
// Image files
// ---------------------------------------------------------------------------

/** Reads type, size and pixel dimensions of a local image file. */
export async function describeImage(file, id) {
  const name = file.name || '';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const stem = (dot > 0 ? name.slice(0, dot) : name).toLowerCase().trim();
  const mime = (file.type || EXT_MIME[ext] || '').toLowerCase();
  const info = { id, file, name, stem, mime, ext: IMAGE_MIME_EXT[mime] || '', size: file.size, width: 0, height: 0, problems: [] };

  if (!IMAGE_MIME_EXT[mime]) info.problems.push('Not a WebP, PNG or JPEG image.');
  if (file.size > MAX_IMAGE_BYTES) info.problems.push(`Larger than 10 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`);
  if (IMAGE_MIME_EXT[mime]) {
    try {
      const bmp = await createImageBitmap(file);
      info.width = bmp.width;
      info.height = bmp.height;
      bmp.close?.();
    } catch {
      info.problems.push('The image could not be decoded.');
    }
  }
  if (info.width && info.height) {
    if (Math.abs(info.width - info.height) > Math.max(info.width, info.height) * 0.01) {
      info.problems.push(`Not square (${info.width} × ${info.height}).`);
    }
    if (Math.min(info.width, info.height) < MIN_IMAGE_SIDE) {
      info.problems.push(`Smaller than ${MIN_IMAGE_SIDE} × ${MIN_IMAGE_SIDE} (${info.width} × ${info.height}).`);
    }
  }
  return info;
}

/**
 * Matches files to manifest entries by exact file name (any of .webp/.png/.jpg). A file whose
 * name is shared by several entries, or several files for one entry, is never assigned
 * automatically. Manual choices ({ entryId } or { ignore: true }) override.
 */
export function matchFiles(files, entries, manual = {}) {
  const byStem = new Map();
  for (const e of entries) {
    if (!byStem.has(e.stem)) byStem.set(e.stem, []);
    byStem.get(e.stem).push(e);
  }
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const results = files.map((f) => {
    const m = manual[f.id];
    if (m?.ignore) return { ...f, status: 'ignored', reason: 'Ignored by admin.' };
    if (m?.entryId) {
      return entryById.has(m.entryId)
        ? { ...f, status: 'manual', entryId: m.entryId, reason: 'Assigned by admin.' }
        : { ...f, status: 'unmatched', reason: 'The chosen product image slot is not in the manifest.' };
    }
    const hits = byStem.get(f.stem) || [];
    if (hits.length === 1) return { ...f, status: 'matched', entryId: hits[0].id, reason: 'File name matches the manifest.' };
    if (hits.length > 1) return { ...f, status: 'ambiguous', reason: `File name matches ${hits.length} manifest entries.` };
    return { ...f, status: 'unmatched', reason: 'No manifest entry has this file name.' };
  });

  // One file per entry; manual choices win, otherwise competing files are all held back
  const byEntry = new Map();
  for (const r of results) {
    if (r.status !== 'matched' && r.status !== 'manual') continue;
    if (!byEntry.has(r.entryId)) byEntry.set(r.entryId, []);
    byEntry.get(r.entryId).push(r);
  }
  const fileForEntry = {};
  for (const [entryId, list] of byEntry) {
    const manualOnes = list.filter((r) => r.status === 'manual');
    const pool = manualOnes.length > 0 ? manualOnes : list;
    if (pool.length === 1) {
      fileForEntry[entryId] = pool[0].id;
      for (const r of list) {
        if (r === pool[0]) continue;
        r.status = 'conflict';
        r.reason = `Replaced by "${pool[0].name}", chosen manually.`;
      }
    } else {
      for (const r of list) {
        r.status = 'conflict';
        r.reason = `${pool.length} files compete for this image slot. Keep one and ignore the others.`;
      }
    }
  }
  return { files: results, fileForEntry };
}

/** Storage path for an approved image: concepts are kept apart from real photographs. */
export function storagePathFor(entry, file, source) {
  const folder = source === 'photo' ? 'products' : 'products/concepts';
  return `${folder}/${entry.stem}.${file.ext}`;
}

/**
 * Upload + assignment plan for every entry that has an approved file.
 * @returns {object[]} rows with entry, file, source, path, url and blockers
 */
export function buildPlan({ entries, files, fileForEntry, review, source, verified }) {
  const fileById = new Map(files.map((f) => [f.id, f]));
  const rows = [];
  for (const e of entries) {
    const fileId = fileForEntry[e.id];
    if (!fileId) continue;
    const f = fileById.get(fileId);
    if (!f || review[fileId] !== 'approved') continue;
    const src = source[fileId] === 'photo' ? 'photo' : 'concept';
    const blockers = [];
    const entryBlock = entryBlocker(e, verified);
    if (entryBlock) blockers.push(entryBlock);
    if (f.problems.length > 0) blockers.push(...f.problems);
    if (src === 'concept' && e.productStatus === 'active') {
      blockers.push('Product is active; concept images may only be assigned to drafts.');
    }
    const path = f.ext ? storagePathFor(e, f, src) : '';
    rows.push({
      entry: e,
      file: f,
      source: src,
      bucket: STORAGE_BUCKET,
      path,
      url: path ? getStoragePublicUrl(path) : '',
      blockers,
    });
  }
  return rows;
}

/** Read-only: whether an object already exists at each planned path. */
export async function checkExistingObjects(rows) {
  const out = {};
  for (const r of rows) {
    if (!r.path) continue;
    try {
      const info = await getStorageObjectInfo(r.path);
      out[r.path] = info ? { exists: true, size: info.size } : { exists: false };
    } catch (err) {
      out[r.path] = { error: err.message };
    }
  }
  return out;
}

/**
 * LIVE: upload one planned image and assign it to its product's empty image fields.
 * Only callable when LIVE_IMAGE_WRITES_ENABLED is true. Retry-safe: an object already at the
 * path with the same byte size is treated as this file's earlier upload; a different object
 * there is a conflict and nothing is overwritten.
 */
export async function executePlanRow(row) {
  if (!LIVE_IMAGE_WRITES_ENABLED) throw new Error('Live image writes are disabled in this build (dry-run only).');
  if (row.blockers.length > 0) throw new Error(row.blockers.join(' '));

  let uploaded = false;
  const existing = await getStorageObjectInfo(row.path);
  if (existing) {
    if (existing.size !== row.file.size) {
      throw new Error(`A different object already exists at "${row.path}"; nothing was overwritten.`);
    }
  } else {
    const res = await uploadStorageFileToPath(row.file.file, row.path);
    if (res.error) throw new Error(res.error);
    const check = await getStorageObjectInfo(row.path);
    if (!check) throw new Error(`Storage reported success but "${row.path}" could not be found afterwards.`);
    uploaded = true;
  }

  const head = await fetch(row.url, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
  if (!head || !head.ok) throw new Error(`The public URL did not respond (${head ? head.status : 'network error'}); not assigned.`);

  const target = { url: row.url, path: row.path };
  const images = {};
  for (const field of row.entry.fields) images[field] = target;
  await assignProductImages(row.entry.productId, images, { concept: row.source === 'concept' });
  return { uploaded, fields: row.entry.fields };
}

// ---------------------------------------------------------------------------
// Manifest export
// ---------------------------------------------------------------------------

const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Manifest rows for every entry, with the current state of generation, review, upload and assignment.
 */
export function manifestRows({ entries, files, fileForEntry, review, source, verified, results = {} }) {
  const fileById = new Map(files.map((f) => [f.id, f]));
  return entries.map((e) => {
    const f = fileById.get(fileForEntry[e.id]);
    const src = f && source[f.id] === 'photo' ? 'photo' : 'concept';
    const blocker = entryBlocker(e, verified);
    const r = results[e.id];
    return {
      product_id: e.productId,
      product_name: e.productName,
      slug: e.slug,
      category: e.category,
      product_status: e.productStatus,
      bottle_type: e.bottle,
      sizes: e.sizes.join(' / '),
      image_role: ROLE_LABEL[e.role],
      fields_filled: e.fields.join(' + '),
      file_name: `${e.stem}.webp`,
      local_file: f ? f.name : '',
      storage_path: f && f.ext ? `${STORAGE_BUCKET}/${storagePathFor(e, f, src)}` : `${STORAGE_BUCKET}/products/concepts/${e.stem}.webp`,
      generation_status: f ? 'File supplied' : 'Not generated (no image-generation service configured)',
      review_status: f ? review[f.id] || 'pending' : 'no image',
      upload_status: r?.upload || (LIVE_IMAGE_WRITES_ENABLED ? 'not uploaded' : 'dry run: not uploaded'),
      assignment_status: r?.assignment || (blocker ? `blocked: ${blocker}` : 'not assigned'),
      image_source: f ? (src === 'photo' ? 'Actual product photograph (admin-declared)' : 'Concept (unverified)') : '',
      pilot: e.pilot ? 'yes' : '',
      review_flag: e.flag,
      prompt: e.prompt,
      negative_prompt: NEGATIVE_PROMPT,
    };
  });
}

export function rowsToCsv(rows) {
  if (rows.length === 0) return '';
  const header = Object.keys(rows[0]);
  return [header.map(csvCell).join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\r\n');
}

export function downloadText(fileName, text, type) {
  const blob = new Blob([type.startsWith('text/csv') ? `﻿${text}` : text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
