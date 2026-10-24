/**
 * Bulk product import: column mapping, grouping, validation, duplicate detection,
 * image matching, reports, and the per-product import step.
 *
 * Rules (approved):
 *  - One product per fragrance name AND type: "X Attar" and "X <spray suffix>" are separate products.
 *  - Attars are Glass Bottle only. Sprays get Glass and PVC variants, each with the source price.
 *  - Sizes are kept exactly as in the source. Stock and SKU are only taken from mapped columns.
 *  - Existing products (same slug or name) are skipped, never updated.
 *  - Records with errors are blocked; records flagged for review are blocked until an admin
 *    confirms them. Products publish only when every standard size is priced and a verified
 *    primary image is assigned; otherwise they are created as inactive drafts.
 */
import { createProduct } from '../../services/products';
import { uploadStorageFile, deleteStorageFiles, STORAGE_FOLDERS } from '../../lib/storage';

export const IMPORT_FIELDS = [
  { key: 'name', label: 'Product name', required: true, synonyms: ['product name', 'product', 'name', 'fragrance', 'item', 'item name'] },
  { key: 'type', label: 'Type (Attar / Spray)', required: true, synonyms: ['type', 'product type', 'form', 'format'] },
  { key: 'size', label: 'Size (ml)', required: true, synonyms: ['size (ml)', 'size', 'size ml', 'ml', 'volume'] },
  { key: 'price', label: 'Price (Rs)', required: true, synonyms: ['price (rs)', 'price', 'price rs', 'mrp', 'rate', 'amount'] },
  { key: 'notes', label: 'Notes', synonyms: ['notes', 'note', 'remarks', 'remark', 'comments', 'comment'] },
  { key: 'category', label: 'Category', synonyms: ['category', 'family', 'collection'] },
  { key: 'bottle', label: 'Bottle (Glass / PVC)', synonyms: ['bottle', 'bottle type'] },
  { key: 'stock', label: 'Stock', synonyms: ['stock', 'stock quantity', 'qty', 'quantity', 'inventory'] },
  { key: 'sku', label: 'SKU', synonyms: ['sku', 'sku code'] },
];

export const TYPE_LABEL = { attar: 'Attar', spray: 'Spray' };
export const DEFAULT_SUFFIXES = { attar: 'Attar', spray: 'Perfume Spray' };
const BOTTLES = { attar: ['Glass Bottle'], spray: ['Glass Bottle', 'PVC Bottle'] };
const REQUIRED_SIZES = { attar: [3, 6, 12], spray: [30, 50, 100] };
const DEFAULT_CATEGORY_SLUG = { attar: 'attar', spray: 'perfume' };

// Source notes containing these words describe an uncertain record: blocked until confirmed
const REVIEW_NOTE = /unclear|verify|not specified|not visible|not shown|unlabel|unidentified|x mark|mark beside|spelling|fragment|unknown/i;
// Names that are placeholders rather than product names
const PLACEHOLDER_NAME = /unidentified|unknown item|photo fragment|unlabel/i;

export const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const cleanText = (v) => String(v ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

// Strips the bullet that some exports prefix to notes; a broken character (U+FFFD) elsewhere was a quote
const cleanNote = (v) =>
  cleanText(v)
    .replace(/^[\s�•·*\-–]+/, '')
    .replace(/�/g, '"')
    .trim();

const normalizeHeader = (h) => cleanText(h).toLowerCase();

// ---------------------------------------------------------------------------
// Header detection and column mapping
// ---------------------------------------------------------------------------

/** Index of the first row (within the first 30) that looks like a header with name and price columns. */
export function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 30);
  const nameField = IMPORT_FIELDS.find((f) => f.key === 'name');
  const priceField = IMPORT_FIELDS.find((f) => f.key === 'price');
  for (let i = 0; i < limit; i += 1) {
    const cells = (rows[i] || []).map(normalizeHeader);
    if (cells.some((c) => nameField.synonyms.includes(c)) && cells.some((c) => priceField.synonyms.includes(c))) {
      return i;
    }
  }
  const firstFilled = rows.findIndex((r) => (r || []).some((c) => cleanText(c)));
  return firstFilled >= 0 ? firstFilled : 0;
}

/** Maps each field to a column index (-1 = not mapped), exact header matches first. */
export function autoMapColumns(headerCells) {
  const headers = (headerCells || []).map(normalizeHeader);
  const used = new Set();
  const mapping = {};
  for (const field of IMPORT_FIELDS) {
    let idx = -1;
    for (const syn of field.synonyms) {
      idx = headers.findIndex((h, i) => h === syn && !used.has(i));
      if (idx >= 0) break;
    }
    if (idx >= 0) used.add(idx);
    mapping[field.key] = idx;
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Value parsing
// ---------------------------------------------------------------------------

function normalizeType(raw) {
  const s = raw.toLowerCase().trim();
  if (/^(attar|attars|ittar|itr|perfume oil|attar oil|oil)$/.test(s)) return 'attar';
  if (/^(spray|sprays|perfume spray|perfume|edp|eau de parfum|body spray)$/.test(s)) return 'spray';
  return null;
}

function parsePrice(raw) {
  const s = raw.replace(/rs\.?|inr|₹|\/-|,|\s/gi, '');
  if (!s) return { empty: true };
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return { invalid: true };
  const value = Number(s);
  return value > 0 ? { value } : { invalid: true };
}

function parseSize(raw) {
  const s = raw.toLowerCase().replace(/\s+/g, '');
  if (!s) return { empty: true };
  const m = s.match(/^(\d+(?:\.\d+)?)(ml)?$/);
  if (!m || !(Number(m[1]) > 0)) return { invalid: true };
  return { value: Number(m[1]) };
}

function parseBottle(raw) {
  const s = raw.toLowerCase();
  if (!s) return { empty: true };
  if (s.includes('pvc') || s.includes('plastic')) return { value: 'PVC Bottle' };
  if (s.includes('glass')) return { value: 'Glass Bottle' };
  return { invalid: true };
}

const formatRs = (n) => `Rs ${Number(n).toLocaleString('en-IN')}`;

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

function addIssue(target, level, message, row) {
  let issue = target.issues.find((i) => i.level === level && i.message === message);
  if (!issue) {
    issue = { level, message, rows: [] };
    target.issues.push(issue);
  }
  if (row && !issue.rows.includes(row)) issue.rows.push(row);
}

function autoName(baseName, type, suffixes) {
  const suffix = cleanText(type ? suffixes[type] : '');
  if (!suffix) return baseName;
  return baseName.toLowerCase().endsWith(suffix.toLowerCase()) ? baseName : `${baseName} ${suffix}`;
}

/**
 * Groups source rows into products and validates them.
 * @returns {{ products: object[], rowIssues: object[], dataRowCount: number }}
 */
export function buildImportPlan({ rows, headerRow, mapping, suffixes, categories, existingProducts, nameOverrides = {} }) {
  const groups = new Map();
  const rowIssues = [];
  let dataRowCount = 0;

  const dataRows = rows.slice(headerRow + 1);
  dataRows.forEach((cells, idx) => {
    const rowNumber = headerRow + 2 + idx; // 1-based row number as shown in Excel
    const get = (key) => (mapping[key] >= 0 ? cleanText((cells || [])[mapping[key]]) : '');
    const mappedValues = IMPORT_FIELDS.map((f) => get(f.key));
    if (!mappedValues.some(Boolean)) return;
    dataRowCount += 1;

    const name = get('name');
    if (!name) {
      rowIssues.push({ level: 'error', message: 'Row has values but no product name; not imported.', rows: [rowNumber] });
      return;
    }
    const typeRaw = get('type');
    const type = normalizeType(typeRaw);
    const key = `${slugify(name) || name.toLowerCase()}|${type || `unknown:${typeRaw.toLowerCase()}`}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        baseName: name,
        type,
        typeRaw,
        rows: [],
        variantMap: new Map(),
        issues: [],
        notes: [],
        categoryValues: new Set(),
      };
      groups.set(key, group);
    }
    group.rows.push(rowNumber);

    const note = cleanNote(get('notes'));
    if (note) {
      if (!group.notes.includes(note)) group.notes.push(note);
      if (REVIEW_NOTE.test(note)) addIssue(group, 'review', `Source note: ${note}`, rowNumber);
    }
    const category = get('category');
    if (category) group.categoryValues.add(category);

    if (!type) {
      addIssue(group, 'error', typeRaw ? `Type "${typeRaw}" is not Attar or Spray.` : 'Type is missing.', rowNumber);
    }

    const sizeRaw = get('size');
    const priceRaw = get('price');
    const size = parseSize(sizeRaw);
    const price = parsePrice(priceRaw);
    if (size.empty && price.empty) {
      addIssue(group, 'error', 'No size or price in the source.', rowNumber);
      return;
    }
    if (price.empty) {
      addIssue(group, 'error', `No price for size "${sizeRaw}".`, rowNumber);
      return;
    }
    if (price.invalid) {
      addIssue(group, 'error', `Price "${priceRaw}" is not a valid amount.`, rowNumber);
      return;
    }
    if (size.empty || size.invalid) {
      addIssue(group, 'error', `Size "${sizeRaw}" is not a size in ml.`, rowNumber);
      return;
    }
    if (!type) return;

    const bottle = parseBottle(get('bottle'));
    if (bottle.invalid) {
      addIssue(group, 'error', `Bottle "${get('bottle')}" is not Glass or PVC.`, rowNumber);
      return;
    }
    if (type === 'attar' && bottle.value === 'PVC Bottle') {
      addIssue(group, 'error', 'Attars are glass-only; a PVC row cannot be imported.', rowNumber);
      return;
    }
    const bottles = bottle.value ? [bottle.value] : BOTTLES[type];

    const stockRaw = get('stock');
    const sku = get('sku');
    if ((stockRaw || sku) && bottles.length > 1) {
      addIssue(
        group,
        'error',
        'Stock/SKU given on a row that covers both Glass and PVC. Add a Bottle column so each bottle has its own stock and SKU.',
        rowNumber
      );
      return;
    }
    let stock = null;
    if (stockRaw) {
      if (!/^\d+$/.test(stockRaw.replace(/,/g, ''))) {
        addIssue(group, 'error', `Stock "${stockRaw}" is not a whole number.`, rowNumber);
        return;
      }
      stock = Number(stockRaw.replace(/,/g, ''));
    }

    for (const b of bottles) {
      const vKey = `${b}|${size.value}`;
      const existing = group.variantMap.get(vKey);
      if (existing) {
        existing.rows.push(rowNumber);
        if (existing.price !== price.value) {
          addIssue(
            group,
            'error',
            `Conflicting prices for ${b} ${size.value} ml: ${formatRs(existing.price)} (row ${existing.rows[0]}) and ${formatRs(price.value)} (row ${rowNumber}).`,
            rowNumber
          );
        } else if ((stock !== null && existing.stock !== null && stock !== existing.stock) || (sku && existing.sku && sku !== existing.sku)) {
          addIssue(group, 'error', `Conflicting stock or SKU for ${b} ${size.value} ml.`, rowNumber);
        } else {
          addIssue(group, 'warning', `Duplicate row for ${b} ${size.value} ml with the same price was merged.`, rowNumber);
          if (existing.stock === null) existing.stock = stock;
          if (!existing.sku) existing.sku = sku || null;
        }
      } else {
        group.variantMap.set(vKey, {
          bottle_type: b,
          size: size.value,
          size_ml: `${size.value} ml`,
          price: price.value,
          stock,
          sku: sku || null,
          rows: [rowNumber],
        });
      }
    }
  });

  // Lookups for duplicates and categories
  const existingBySlug = new Map();
  const existingByName = new Map();
  for (const ep of existingProducts || []) {
    if (ep.slug) existingBySlug.set(String(ep.slug).toLowerCase(), ep);
    if (ep.name) existingByName.set(slugify(ep.name), ep);
  }
  const findCategory = (value) => {
    const v = cleanText(value).toLowerCase();
    return (categories || []).find((c) => c.slug?.toLowerCase() === v || c.name?.toLowerCase() === v) || null;
  };

  const products = [...groups.values()].map((g) => {
    const p = {
      key: g.key,
      baseName: g.baseName,
      type: g.type,
      typeRaw: g.typeRaw,
      rows: g.rows,
      notes: g.notes,
      issues: g.issues.map((i) => ({ ...i, rows: [...i.rows] })),
      draftReasons: [],
    };
    const override = cleanText(nameOverrides[g.key]);
    p.name = override || autoName(g.baseName, g.type, suffixes);
    p.slug = slugify(p.name);
    p.nameOverridden = Boolean(override);

    if (!p.slug) addIssue(p, 'error', 'The product name has no letters or numbers to build a URL slug from.');
    if (PLACEHOLDER_NAME.test(g.baseName) && !override) {
      addIssue(p, 'error', 'The source has no real product name. Type the correct name in the Name field to import it.');
    }

    // Category: mapped column if present, otherwise Attar → "attar", Spray → "perfume"
    const values = [...g.categoryValues];
    if (values.length > 1) {
      addIssue(p, 'error', `Rows disagree on the category (${values.join(', ')}).`);
    } else if (values.length === 1) {
      const cat = findCategory(values[0]);
      if (cat) p.category = cat;
      else addIssue(p, 'error', `Category "${values[0]}" does not exist. Create it under Admin → Categories first.`);
    } else if (g.type) {
      const cat = findCategory(DEFAULT_CATEGORY_SLUG[g.type]);
      if (cat) p.category = cat;
      else addIssue(p, 'error', `Category "${DEFAULT_CATEGORY_SLUG[g.type]}" does not exist. Create it under Admin → Categories first.`);
    }
    if (p.category && p.category.is_active === false) {
      addIssue(p, 'warning', `Category "${p.category.name}" is hidden on the storefront.`);
    }

    p.variants = [...g.variantMap.values()].sort(
      (a, b) => a.size - b.size || a.bottle_type.localeCompare(b.bottle_type)
    );

    if (g.type) {
      if (p.variants.length === 0 && !p.issues.some((i) => i.level === 'error')) {
        addIssue(p, 'error', 'No priced sizes in the source.');
      }
      for (const b of BOTTLES[g.type]) {
        const forBottle = p.variants.filter((v) => v.bottle_type === b);
        const missing = REQUIRED_SIZES[g.type].filter((s) => !forBottle.some((v) => v.size === s));
        if (missing.length > 0 && p.variants.length > 0) {
          p.draftReasons.push(`No ${b} price for ${missing.map((s) => `${s} ml`).join(', ')} in the source`);
        }
        // Prices that look wrong are blocked until an admin confirms them against the source
        let prev = null;
        for (const v of forBottle) {
          if (prev && v.price < prev.price) {
            addIssue(p, 'review', `${b} ${v.size_ml} (${formatRs(v.price)}) costs less than ${prev.size_ml} (${formatRs(prev.price)}).`, v.rows[0]);
          }
          prev = v;
        }
      }
      for (const v of p.variants) {
        if (v.price % 10 !== 0) {
          addIssue(p, 'review', `${formatRs(v.price)} for ${v.size_ml} is not a round amount; confirm it against the source.`, v.rows[0]);
        }
      }
      const standard = REQUIRED_SIZES[g.type];
      const extra = [...new Set(p.variants.map((v) => v.size))].filter((s) => !standard.includes(s));
      if (extra.length > 0) {
        addIssue(p, 'warning', `Non-standard size ${extra.map((s) => `${s} ml`).join(', ')} kept exactly as in the source.`);
      }
    }

    // Existing products are skipped; a same-fragrance product under another name needs confirmation
    const existing = existingBySlug.get(p.slug) || existingByName.get(p.slug);
    if (existing) {
      p.existing = existing;
    } else {
      const similar = existingBySlug.get(slugify(g.baseName)) || existingByName.get(slugify(g.baseName));
      if (similar) {
        addIssue(p, 'review', `An existing product "${similar.name}" may be the same fragrance. Confirm this is a separate product.`);
      }
    }
    return p;
  });

  // Two groups that would get the same slug
  const bySlug = new Map();
  for (const p of products) {
    if (!p.slug) continue;
    if (!bySlug.has(p.slug)) bySlug.set(p.slug, []);
    bySlug.get(p.slug).push(p);
  }
  for (const list of bySlug.values()) {
    if (list.length < 2) continue;
    for (const p of list) {
      const others = list.filter((o) => o !== p).map((o) => `rows ${o.rows.join(', ')}`).join('; ');
      addIssue(p, 'error', `Another record in this file has the same product name/URL (${others}).`);
    }
  }

  return { products, rowIssues, dataRowCount };
}

/**
 * Import status of one planned product.
 * @returns {{ status: 'exists'|'blocked'|'review'|'ready', publish: boolean, draftReasons: string[] }}
 */
export function productStatus(p, { verified, assignments, publishComplete }) {
  if (p.existing) return { status: 'exists', publish: false, draftReasons: [] };
  if (p.issues.some((i) => i.level === 'error')) return { status: 'blocked', publish: false, draftReasons: [] };
  if (p.issues.some((i) => i.level === 'review') && !verified[p.key]) {
    return { status: 'review', publish: false, draftReasons: [] };
  }
  const draftReasons = [...p.draftReasons];
  if (!assignments[p.key]?.main) draftReasons.push('No verified primary image');
  if (!publishComplete && draftReasons.length === 0) draftReasons.push('Publishing turned off for this import');
  return { status: 'ready', publish: draftReasons.length === 0, draftReasons };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const IMAGE_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const IMAGE_MIME = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_ROLE_LABEL = { main: 'Primary', glass: 'Glass bottle', pvc: 'PVC bottle', gallery: 'Gallery' };

/** File metadata used for matching; `error` when the file can never be uploaded. */
export function describeImageFile(file, id) {
  const path = file.webkitRelativePath || file.name;
  const parts = path.split('/');
  const fileName = parts.pop();
  const folder = parts.length > 0 ? parts[parts.length - 1] : '';
  const dot = fileName.lastIndexOf('.');
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  let error = '';
  const type = (file.type || '').toLowerCase();
  if (type ? !IMAGE_MIME.has(type) : !IMAGE_EXT[ext]) error = 'Not a JPEG, PNG or WebP image.';
  else if (file.size > MAX_IMAGE_BYTES) error = `Larger than 10 MB (${(file.size / (1024 * 1024)).toFixed(1)} MB).`;
  return { id, file, path, fileName, folder, stem, error };
}

// "<product>-glass", "<product>-pvc", "<product>-main", "<product>-gallery-2"; no role word = primary
function parseImageName(stemSlug) {
  let m = stemSlug.match(/^(.*?)-?(?:gallery|angle|alt|extra)(?:-?(\d+))?$/);
  if (m) return { key: m[1], role: 'gallery', index: m[2] ? Number(m[2]) : 0 };
  m = stemSlug.match(/^(.*?)-?glass(?:-bottle)?$/);
  if (m) return { key: m[1], role: 'glass' };
  m = stemSlug.match(/^(.*?)-?(?:pvc|plastic)(?:-bottle)?$/);
  if (m) return { key: m[1], role: 'pvc' };
  m = stemSlug.match(/^(.*?)-?(?:main|primary|front|cover)$/);
  if (m) return { key: m[1], role: 'main' };
  return null;
}

function productNameKeys(p) {
  const base = slugify(p.baseName);
  const keys = new Set([p.slug]);
  if (p.type === 'attar') keys.add(`${base}-attar`);
  if (p.type === 'spray') ['spray', 'perfume', 'perfume-spray', 'edp'].forEach((s) => keys.add(`${base}-${s}`));
  return { keys, base };
}

/**
 * Matches image files to products. Only exact, product-specific names are assigned automatically;
 * a name that fits more than one product (e.g. "khamrah.jpg" when both Khamrah Attar and
 * Khamrah Perfume Spray exist) is left for the admin to assign.
 * @param {object[]} images - from describeImageFile
 * @param {object[]} products - planned products (not existing ones)
 * @param {Record<string, { productKey?: string, role?: string, ignore?: boolean }>} manual
 */
export function matchImages(images, products, manual = {}) {
  const exactIndex = new Map();
  const baseIndex = new Map();
  const byKey = new Map(products.map((p) => [p.key, p]));
  for (const p of products) {
    const { keys, base } = productNameKeys(p);
    for (const k of keys) {
      if (!exactIndex.has(k)) exactIndex.set(k, []);
      if (!exactIndex.get(k).includes(p.key)) exactIndex.get(k).push(p.key);
    }
    if (!baseIndex.has(base)) baseIndex.set(base, []);
    baseIndex.get(base).push(p.key);
  }

  const files = images.map((img) => {
    if (img.error) return { ...img, status: 'invalid', reason: img.error };
    const m = manual[img.id];
    if (m?.ignore) return { ...img, status: 'ignored', reason: 'Ignored by admin.' };
    if (m?.productKey && m?.role) {
      const p = byKey.get(m.productKey);
      if (!p) return { ...img, status: 'unmatched', reason: 'The product chosen for this image is no longer in the import.' };
      if (p.type === 'attar' && m.role === 'pvc') {
        return { ...img, status: 'unmatched', reason: 'Attars are glass-only; a PVC image cannot be used.' };
      }
      return { ...img, status: 'manual', productKey: m.productKey, role: m.role, index: 0, reason: 'Assigned by admin.' };
    }

    const stem = slugify(img.stem);
    const parsed = parseImageName(stem);
    const candidates = [];
    if (parsed) candidates.push({ ...parsed, key: parsed.key || slugify(img.folder) });
    candidates.push({ key: stem, role: 'main' });
    if (/^\d+$/.test(stem) && img.folder) candidates.push({ key: slugify(img.folder), role: 'gallery', index: Number(stem) });

    for (const c of candidates) {
      const hits = exactIndex.get(c.key) || [];
      if (hits.length === 1) {
        const p = byKey.get(hits[0]);
        if (p.type === 'attar' && c.role === 'pvc') {
          return { ...img, status: 'unmatched', reason: `Attars are glass-only, so this PVC image is not used for "${p.name}".` };
        }
        return { ...img, status: 'matched', productKey: hits[0], role: c.role, index: c.index || 0, reason: 'File name matches the product.' };
      }
      if (hits.length > 1) {
        return { ...img, status: 'ambiguous', reason: `Matches several products: ${hits.map((k) => byKey.get(k).name).join(', ')}.`, suggestions: hits };
      }
    }
    for (const c of candidates) {
      const hits = baseIndex.get(c.key) || [];
      if (hits.length > 0) {
        return {
          ...img,
          status: 'ambiguous',
          reason: `The file name does not say which product type it shows (${hits.map((k) => byKey.get(k).name).join(' / ')}). Assign it manually.`,
          suggestions: hits,
          suggestedRole: c.role,
        };
      }
    }
    return { ...img, status: 'unmatched', reason: 'No product in this import matches the file name.' };
  });

  // Fill slots. Manual choices win; two candidates for one single slot are never decided automatically.
  const assignments = {};
  const slotFiles = new Map();
  for (const f of files) {
    if (f.status !== 'matched' && f.status !== 'manual') continue;
    if (!assignments[f.productKey]) assignments[f.productKey] = { main: null, glass: null, pvc: null, gallery: [] };
    if (f.role === 'gallery') continue;
    const slot = `${f.productKey}|${f.role}`;
    if (!slotFiles.has(slot)) slotFiles.set(slot, []);
    slotFiles.get(slot).push(f);
  }
  for (const [slot, list] of slotFiles) {
    const [productKey, role] = slot.split('|');
    const manualOnes = list.filter((f) => f.status === 'manual');
    const pool = manualOnes.length > 0 ? manualOnes : list;
    if (pool.length === 1) {
      assignments[productKey][role] = pool[0].id;
      for (const f of list) {
        if (f !== pool[0]) {
          f.status = 'conflict';
          f.reason = `Replaced by "${pool[0].fileName}", chosen manually for this slot.`;
        }
      }
    } else {
      for (const f of list) {
        f.status = 'conflict';
        f.reason = `${pool.length} files compete for the ${IMAGE_ROLE_LABEL[role]} image of this product. Keep one and ignore or reassign the others.`;
      }
    }
  }
  const galleryFiles = files
    .filter((f) => (f.status === 'matched' || f.status === 'manual') && f.role === 'gallery')
    .sort((a, b) => a.index - b.index || a.fileName.localeCompare(b.fileName));
  for (const f of galleryFiles) assignments[f.productKey].gallery.push(f.id);

  return { files, assignments };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Uploads the product's assigned images to products/ and creates the product with its variants
 * through the existing createProduct service. If anything fails, files uploaded for this product
 * are removed again and the error is rethrown.
 * @param {object} p - planned product
 * @param {{ main?: File, glass?: File, pvc?: File, gallery: File[] }} files
 * @param {boolean} publish
 */
export async function importOneProduct(p, files, publish) {
  const uploaded = [];
  const upload = async (file, label) => {
    const { url, path, error } = await uploadStorageFile(file, STORAGE_FOLDERS.PRODUCTS, `${p.slug}-${label}`);
    if (error) throw new Error(`${label} image "${file.name}" was not uploaded: ${error}`);
    uploaded.push(path);
    return { url, path };
  };

  try {
    const main = files.main ? await upload(files.main, 'main') : null;
    const glass = files.glass ? await upload(files.glass, 'glass') : null;
    const pvc = files.pvc ? await upload(files.pvc, 'pvc') : null;
    const gallery = [];
    for (let i = 0; i < files.gallery.length; i += 1) {
      gallery.push(await upload(files.gallery[i], `gallery-${i + 1}`));
    }

    const created = await createProduct({
      name: p.name,
      slug: p.slug,
      category_id: p.category.id,
      category: p.category.name,
      description: '',
      short_description: '',
      main_image: main?.url || '',
      main_image_path: main?.path || null,
      glass_image: glass?.url || null,
      glass_image_path: glass?.path || null,
      pvc_image: pvc?.url || null,
      pvc_image_path: pvc?.path || null,
      gallery_images: gallery.map((g) => g.url),
      is_active: publish,
      is_featured: false,
      is_bestseller: false,
      is_new_arrival: false,
      allowMissingImage: true,
      variants: p.variants.map((v) => ({
        bottle_type: v.bottle_type,
        size_ml: v.size_ml,
        price: v.price,
        sale_price: null,
        // Stock and SKU only when the source provides them; otherwise 0 / empty for the admin to set
        stock: v.stock ?? 0,
        sku: v.sku || null,
        is_active: true,
      })),
    });
    return { id: created?.id, images: uploaded.length };
  } catch (err) {
    let cleanup = '';
    if (uploaded.length > 0) {
      const res = await deleteStorageFiles(uploaded);
      if (res.failed.length > 0) cleanup = ` ${res.failed.length} uploaded file(s) could not be removed: ${res.failed.join(', ')}.`;
    }
    const e = new Error(`${err.message || 'Unknown error'}${cleanup}`);
    e.duplicate = /23505|duplicate key/i.test(err.message || '');
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const csvCell = (v) => {
  let s = String(v ?? '');
  // Never let a spreadsheet program evaluate a cell as a formula
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const STATUS_LABEL = {
  exists: 'Skipped: already exists',
  blocked: 'Blocked: fix the source',
  review: 'Blocked: needs review',
  ready: 'Ready',
};

/**
 * @param {object} plan
 * @param {Record<string, object>} statuses - productStatus by product key
 * @param {Record<string, object>} assignments - image slots by product key
 * @param {Map<string, object>} imageById
 * @param {Record<string, { outcome: string, error?: string }>} [results] - after an import run
 */
export function buildReportCsv(plan, statuses, assignments, imageById, results = {}) {
  const header = [
    'Source rows', 'Product', 'Source name', 'Type', 'Category', 'Slug', 'Status', 'Publish',
    'Variants', 'Draft reasons', 'Images', 'Issues', 'Source notes', 'Import result', 'Import error',
  ];
  const lines = [header.map(csvCell).join(',')];
  const fileName = (id) => imageById.get(id)?.fileName || '';

  for (const p of plan.products) {
    const st = statuses[p.key] || {};
    const a = assignments[p.key];
    const images = a
      ? [
          a.main && `Primary: ${fileName(a.main)}`,
          a.glass && `Glass: ${fileName(a.glass)}`,
          a.pvc && `PVC: ${fileName(a.pvc)}`,
          a.gallery.length > 0 && `Gallery: ${a.gallery.map(fileName).join(' | ')}`,
        ].filter(Boolean).join('; ')
      : '';
    const r = results[p.key];
    lines.push(
      [
        p.rows.join(' '),
        p.name,
        p.baseName,
        p.type ? TYPE_LABEL[p.type] : p.typeRaw || '',
        p.category?.name || '',
        p.slug,
        p.existing ? `${STATUS_LABEL.exists} ("${p.existing.name}")` : STATUS_LABEL[st.status] || '',
        st.status === 'ready' ? (st.publish ? 'Published' : 'Draft') : '',
        p.variants.map((v) => `${v.bottle_type} ${v.size_ml} ${formatRs(v.price)}`).join('; '),
        (st.draftReasons || []).join('; '),
        images,
        p.issues.map((i) => `[${i.level}] ${i.message}${i.rows.length ? ` (row ${i.rows.join(', ')})` : ''}`).join(' | '),
        p.notes.join(' | '),
        r?.outcome || '',
        r?.error || '',
      ].map(csvCell).join(',')
    );
  }
  for (const ri of plan.rowIssues) {
    lines.push(
      [ri.rows.join(' '), '', '', '', '', '', 'Row not imported', '', '', '', '', `[${ri.level}] ${ri.message}`, '', '', '']
        .map(csvCell)
        .join(',')
    );
  }
  return lines.join('\r\n');
}

export function downloadCsv(fileName, text) {
  const blob = new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
