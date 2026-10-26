/**
 * Browser-side image optimization for admin uploads.
 *
 * The Supabase project does not have Storage image transformations enabled (render/image
 * returns "FeatureNotEnabled"), so images are resized and re-encoded before they are uploaded:
 *   - "full": longest side capped (product page, zoom, hero poster), WebP
 *   - "card": longest side 800 px (product cards, thumbnails, admin tables), WebP
 * Transparency is preserved (WebP keeps the alpha channel). If the browser cannot encode WebP
 * (older Safari) or anything fails, null is returned and the original file is uploaded unchanged.
 */

export const CARD_MAX_SIDE = 800;
const DEFAULT_MAX_SIDE = 1600;
// Full-width banners and the hero poster are shown edge to edge on large screens
const WIDE_FOLDERS = new Set(['hero', 'banners', 'homepage']);
const FULL_QUALITY = 0.85;
const CARD_QUALITY = 0.8;

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // fall through to <img> decoding
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sourceSize(source) {
  return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Draws the source at the target size, halving step by step for large reductions (less aliasing). */
function resizeTo(source, width, height) {
  let current = source;
  let { width: cw, height: ch } = sourceSize(source);
  while (cw / 2 >= width && ch / 2 >= height) {
    cw = Math.round(cw / 2);
    ch = Math.round(ch / 2);
    const step = makeCanvas(cw, ch);
    const ctx = step.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, cw, ch);
    current = step;
  }
  const out = makeCanvas(width, height);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(current, 0, 0, width, height);
  return out;
}

function fit({ width, height }, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function toWebp(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob && blob.type === 'image/webp' ? blob : null), 'image/webp', quality);
  });
}

/**
 * @param {File|Blob} file - a JPEG, PNG or WebP image
 * @param {string} folder - Storage folder (wide folders keep a larger full-size image)
 * @returns {Promise<{ full: Blob, card: Blob } | null>} null = upload the original unchanged
 */
export async function optimizeImageForUpload(file, folder = '') {
  if (typeof document === 'undefined') return null;
  try {
    const source = await decode(file);
    const original = sourceSize(source);
    if (!original.width || !original.height) return null;

    const maxSide = WIDE_FOLDERS.has(folder) ? 2400 : DEFAULT_MAX_SIDE;
    const fullSize = fit(original, maxSide);
    const full = await toWebp(resizeTo(source, fullSize.width, fullSize.height), FULL_QUALITY);
    if (!full) return null; // WebP encoding not supported by this browser

    // Keep the original when re-encoding would not make it meaningfully smaller
    const resized = fullSize.width < original.width;
    if (!resized && full.size >= file.size * 0.95) return null;

    const cardSize = fit(original, CARD_MAX_SIDE);
    const card =
      cardSize.width < fullSize.width ? await toWebp(resizeTo(source, cardSize.width, cardSize.height), CARD_QUALITY) : full;
    if (!card) return null;

    if (typeof source.close === 'function') source.close();
    return { full, card };
  } catch (err) {
    console.warn('Image optimization skipped; uploading the original file.', err?.message || err);
    return null;
  }
}
