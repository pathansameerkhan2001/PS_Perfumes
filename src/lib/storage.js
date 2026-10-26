import { supabase, STORAGE_BUCKET } from './supabase';

/**
 * Supabase Storage folders within the configured bucket (STORAGE_BUCKET, "Ps-perfumes-media").
 * The bucket's Storage policies only allow uploads into these folders (plus "banners").
 */
export const STORAGE_FOLDERS = {
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  COMBOS: 'combos',
  HERO: 'hero',
  HOMEPAGE: 'homepage',
  REELS: 'reels',
  REVIEWS: 'reviews',
  LOGO: 'logo',
};

// The only file types the app uploads (the bucket must allow exactly these), with the
// extension each one is stored under
const SUPPORTED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
};
// Non-standard MIME names some browsers/OSes report for the same formats
const MIME_ALIASES = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg' };
// Used only when the browser reports no MIME type at all
const EXTENSION_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4' };
const SUPPORTED_LABEL = 'JPEG, PNG or WebP images, or MP4 videos';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

// Every upload gets a unique, timestamped object name, so a replaced image always has a new URL
// and browsers/CDN may keep each file for a year without ever showing a stale image
const UPLOAD_CACHE_CONTROL = '31536000';

// Optimized uploads are stored as "<name>.opt.webp" (full size) with a smaller "<name>.card.webp"
// next to it (see imageOptimize.js). Older uploads have no card version and are used as they are.
const OPT_SUFFIX = '.opt.webp';
const CARD_SUFFIX = '.card.webp';
const OPT_PATTERN = /\.opt\.webp(?=$|[?#])/i;

/**
 * Small (card/thumbnail) version of an uploaded image: the ".card.webp" sibling of an optimized
 * upload, otherwise the same URL. Use for product cards, thumbnails and admin tables.
 * @param {string} url
 * @returns {string}
 */
export function cardImageUrl(url) {
  return typeof url === 'string' ? url.replace(OPT_PATTERN, CARD_SUFFIX) : url;
}

/**
 * onError handler for an <img> showing cardImageUrl(fullUrl): if the card version is missing,
 * the full image is shown instead (once). Callers with their own fallback can chain after it.
 * @param {string} fullUrl
 * @returns {(e: Event) => boolean} true when it switched the image to the full version
 */
export function fullImageFallback(fullUrl) {
  return (e) => {
    const img = e.currentTarget;
    if (!fullUrl || img.dataset.fullFallback === '1' || cardImageUrl(fullUrl) === fullUrl) return false;
    img.dataset.fullFallback = '1';
    img.src = fullUrl;
    return true;
  };
}

/** Storage path of the card version of an optimized upload, or '' for any other path. */
function cardSiblingPath(path) {
  return OPT_PATTERN.test(path) ? path.replace(OPT_PATTERN, CARD_SUFFIX) : '';
}

/**
 * Sanitizes a file name for safe storage path
 * @param {string} name - Raw file name
 * @returns {string} Sanitized file name
 */
export function sanitizeFileName(name) {
  if (!name) return 'asset';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Determines the real type of a file and the extension to store it under.
 * The browser-reported MIME type decides; the file extension is only consulted when the
 * browser reports none. A file that is not JPEG, PNG, WebP or MP4 is never relabelled —
 * for example an SVG or HEIC named "logo.jpg" is rejected, not uploaded as image/jpeg.
 * @param {File|Blob} file
 * @param {string} rawExt - extension from the file name, without the dot
 * @returns {{ mime: string, ext: string } | { error: string }}
 */
function resolveFileType(file, rawExt) {
  const ext = (rawExt || '').toLowerCase().replace(/^\./, '');
  const reported = (file.type || '').toLowerCase().trim();
  const mime = reported ? MIME_ALIASES[reported] || reported : EXTENSION_TYPES[ext] || '';

  if (!SUPPORTED_TYPES[mime]) {
    const described = reported || (ext ? `.${ext} file` : 'unknown type');
    return { error: `This file type (${described}) is not supported. Please choose ${SUPPORTED_LABEL}.` };
  }
  return { mime, ext: SUPPORTED_TYPES[mime] };
}

/**
 * Returns the public CDN URL for a file in Supabase Storage
 * @param {string} path - Full storage path (e.g. 'products/perfume-oud.webp')
 * @returns {string} Public URL
 */
export function getStoragePublicUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!supabase) return path;

  // Strip leading slash or bucket prefix if present
  let cleanPath = path.replace(/^\/+/, '');
  if (cleanPath.startsWith(`${STORAGE_BUCKET}/`)) {
    cleanPath = cleanPath.slice(STORAGE_BUCKET.length + 1);
  }

  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(cleanPath);

  return data?.publicUrl || '';
}

/**
 * Upload a file to a designated folder in the configured bucket (STORAGE_BUCKET)
 * @param {File|Blob} file - File object to upload
 * @param {string} folder - Destination folder (from STORAGE_FOLDERS)
 * @param {string} [customSlug] - Optional subpath / slug prefix
 * @returns {Promise<{ url: string, path: string, error: string | null }>}
 */
export async function uploadStorageFile(file, folder = STORAGE_FOLDERS.PRODUCTS, customSlug = '') {
  if (!file) {
    return { url: '', path: '', error: 'No file provided for upload.' };
  }
  if (!supabase) {
    return { url: '', path: '', error: 'Supabase client is not initialized.' };
  }

  // 1. Extract and sanitize file name
  const originalName = file.name || 'asset';
  const cleanOriginal = sanitizeFileName(originalName);
  const rawParts = cleanOriginal.split('.');
  const detectedExt = rawParts.length > 1 ? rawParts.pop() : '';
  const baseName = rawParts.join('.') || 'file';

  // 2. Supported types only (checked before anything is sent)
  const fileType = resolveFileType(file, detectedExt);
  if (fileType.error) {
    return { url: '', path: '', error: fileType.error };
  }
  const { mime: contentType, ext: normalizedExt } = fileType;

  // 3. Validate file size for that type
  const isVideo = contentType === 'video/mp4';
  const maxSize = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
  const maxLabel = isVideo ? '50MB' : '10MB';

  if (file.size && file.size > maxSize) {
    return {
      url: '',
      path: '',
      error: `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed limit of ${maxLabel}.`,
    };
  }

  // 4. Construct unique, clean object path (NO leading slashes, NO double slashes, NO undefined)
  const cleanFolder = (folder || STORAGE_FOLDERS.PRODUCTS).replace(/^\/+|\/+$/g, '');
  const timestamp = Date.now();
  const safeSlug = customSlug ? sanitizeFileName(customSlug) : '';
  const finalFileName = safeSlug
    ? `${safeSlug}-${timestamp}.${normalizedExt}`
    : `${baseName}-${timestamp}.${normalizedExt}`;

  const filePath = `${cleanFolder}/${finalFileName}`;

  // 5. Pre-flight Session Verification
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  const session = sessionData?.session;

  if (sessionErr || !session || !session.user) {
    return {
      url: '',
      path: '',
      error: 'Storage authentication required: No active administrator session found in browser. Please sign in at /admin/login before uploading media.',
    };
  }

  // 6. Upload. File names are unique (timestamped), so no upsert: a plain INSERT
  //    only needs the admin INSERT policy, while upsert would also need SELECT + UPDATE.
  //    Images are first resized and re-encoded as WebP; the card version is uploaded before the
  //    full one, so an ".opt.webp" object always has its ".card.webp" sibling.
  let body = file;
  let uploadPath = filePath;
  let uploadType = contentType;
  let cardPath = '';
  try {
    if (!isVideo) {
      // Loaded on demand: only the admin uploads, so the storefront never downloads it. If it
      // cannot be loaded, the original file is uploaded as before.
      const optimized = await import('./imageOptimize')
        .then(({ optimizeImageForUpload }) => optimizeImageForUpload(file, cleanFolder))
        .catch(() => null);
      if (optimized) {
        const stem = filePath.replace(/\.[^./]+$/, '');
        const { error: cardErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(`${stem}${CARD_SUFFIX}`, optimized.card, {
            cacheControl: UPLOAD_CACHE_CONTROL,
            upsert: false,
            contentType: 'image/webp',
          });
        if (cardErr) {
          console.warn('Card-size image was not uploaded; the full image is used everywhere.', cardErr.message);
        } else {
          cardPath = `${stem}${CARD_SUFFIX}`;
        }
        body = optimized.full;
        uploadType = 'image/webp';
        uploadPath = cardPath ? `${stem}${OPT_SUFFIX}` : `${stem}.webp`;
      }
    }

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(uploadPath, body, {
        cacheControl: UPLOAD_CACHE_CONTROL,
        upsert: false,
        contentType: uploadType,
      });

    if (error && cardPath) {
      // Do not leave an orphaned card image behind
      await supabase.storage.from(STORAGE_BUCKET).remove([cardPath]).catch(() => {});
    }

    if (error) {
      console.error('Supabase Storage upload error:', error);
      const rawMsg = error.message || error.error || 'Storage upload rejected';
      const statusCode = error.statusCode || error.status || '';
      const userEmail = session.user.email || 'current user';
      let userFriendlyMsg = `Storage upload failed${statusCode ? ` (${statusCode})` : ''}: ${rawMsg}`;

      if (rawMsg.includes('row-level security') || rawMsg.includes('AccessDenied') || String(statusCode) === '403') {
        // Tell the admin which side is missing: the admin record or the Storage upload policy
        let adminCheck = 'unknown';
        try {
          const { data: isAdmin, error: rpcErr } = await supabase.rpc('is_admin');
          if (!rpcErr) adminCheck = isAdmin === true ? 'yes' : 'no';
        } catch {
          // keep 'unknown'
        }
        const cause =
          adminCheck === 'no'
            ? `The database's is_admin() check returns false for ${userEmail}, and no Storage policy accepts this upload.`
            : adminCheck === 'yes'
            ? `${userEmail} is an administrator, but no Storage policy allows uploads to "${STORAGE_BUCKET}/${cleanFolder}/".`
            : `The Storage policies for bucket "${STORAGE_BUCKET}" do not allow ${userEmail} to upload to "${cleanFolder}/".`;
        userFriendlyMsg = `Storage rejected the upload (${statusCode || '403'}: ${rawMsg}). ${cause} Fix: run supabase/new-project/03_storage.sql, and make sure this account has an active admin_users row (04_bootstrap_admin.sql) — see supabase/new-project/README.md.`;
      } else if (rawMsg.includes('Invalid key')) {
        userFriendlyMsg = `Invalid storage object key "${uploadPath}" (${rawMsg}).`;
      } else if (rawMsg.includes('mime type') || rawMsg.includes('not allowed')) {
        userFriendlyMsg = `MIME type "${uploadType}" is rejected by bucket "${STORAGE_BUCKET}" (${rawMsg}). Allowed formats: WebP, JPEG, PNG, MP4.`;
      } else if (rawMsg.toLowerCase().includes('exceeded') || String(statusCode) === '413') {
        userFriendlyMsg = `File is larger than the bucket limit (${rawMsg}).`;
      }

      return { url: '', path: '', error: userFriendlyMsg };
    }

    if (!data?.path) {
      return { url: '', path: '', error: 'Storage did not confirm the upload (no object path returned).' };
    }

    const publicUrl = getStoragePublicUrl(data.path);
    return {
      url: publicUrl,
      path: data.path,
      error: null,
    };
  } catch (err) {
    console.error('Unexpected Storage upload exception:', err);
    return {
      url: '',
      path: '',
      error: err?.message || 'Unexpected Storage upload failure.',
    };
  }
}

/**
 * Remove an existing file from the configured bucket (STORAGE_BUCKET)
 * @param {string} pathOrUrl - Storage file path or full public URL
 * @returns {Promise<{ success: boolean, error: string | null }>}
 */
export async function deleteStorageFile(pathOrUrl) {
  if (!pathOrUrl) return { success: false, error: 'File path required' };
  if (!supabase) return { success: false, error: 'Supabase client not initialized' };

  try {
    let cleanPath = pathOrUrl;
    // Extract relative path if a full URL was provided
    if (cleanPath.includes(`/storage/v1/object/public/${STORAGE_BUCKET}/`)) {
      cleanPath = cleanPath.split(`/storage/v1/object/public/${STORAGE_BUCKET}/`)[1];
    } else if (cleanPath.startsWith('http')) {
      // External or third-party URL: don't attempt to delete from Supabase bucket
      return { success: true, error: null };
    }

    cleanPath = cleanPath.replace(/^\/+/, '');

    const sibling = cardSiblingPath(cleanPath);
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(sibling ? [cleanPath, sibling] : [cleanPath]);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err?.message || 'Storage deletion failed' };
  }
}

/**
 * Remove several objects from the configured bucket and report what was actually removed.
 * Storage silently skips objects the caller may not delete, so the returned list is compared
 * with the request instead of trusting the absence of an error.
 * @param {string[]} paths - Object paths inside the bucket (e.g. 'products/x-123.webp')
 * @returns {Promise<{ removed: string[], failed: string[], error: string | null }>}
 */
export async function deleteStorageFiles(paths) {
  const clean = (paths || []).map((p) => String(p).replace(/^\/+/, '')).filter(Boolean);
  if (clean.length === 0) return { removed: [], failed: [], error: null };

  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).remove(clean);
  if (error) {
    return { removed: [], failed: clean, error: error.message || 'Storage removal failed' };
  }
  const removed = (data || []).map((o) => o.name);
  const failed = clean.filter((p) => !removed.includes(p));
  // Card versions of optimized images go with them (best effort; not part of the report)
  const siblings = clean.filter((p) => removed.includes(p)).map(cardSiblingPath).filter(Boolean);
  if (siblings.length > 0) {
    await supabase.storage.from(STORAGE_BUCKET).remove(siblings).catch(() => {});
  }
  return {
    removed,
    failed,
    error: failed.length > 0 ? 'Some files were not removed (missing or not permitted by Storage policies).' : null,
  };
}

// Exact named exports as requested by specifications
export const uploadImage = uploadStorageFile;
export const deleteImage = deleteStorageFile;
export const getPublicImageUrl = getStoragePublicUrl;
