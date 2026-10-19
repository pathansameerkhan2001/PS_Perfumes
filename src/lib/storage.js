import { supabase, STORAGE_BUCKET } from './supabase';

/**
 * Supabase Storage Folders within the 'ps-perfumes' bucket
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

// Allowed MIME types strictly supported by the 'ps-perfumes' bucket
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
]);

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

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
 * Normalizes file extension and MIME type for Supabase Storage
 * Avoids HTTP 400 caused by 'image/jpg' or missing content-types
 * @param {File|Blob} file 
 * @param {string} rawExt 
 * @returns {{ mime: string, ext: string }}
 */
function normalizeMimeAndExtension(file, rawExt) {
  let ext = (rawExt || '').toLowerCase().replace(/^\./, '');
  let mime = (file.type || '').toLowerCase();

  // Normalize JPEG variations
  if (mime === 'image/jpg' || mime === 'image/pjpeg' || ext === 'jpg' || ext === 'jpeg') {
    return { mime: 'image/jpeg', ext: ext || 'jpg' };
  }
  // Normalize PNG
  if (mime === 'image/png' || ext === 'png') {
    return { mime: 'image/png', ext: 'png' };
  }
  // Normalize WebP
  if (mime === 'image/webp' || ext === 'webp') {
    return { mime: 'image/webp', ext: 'webp' };
  }
  // Normalize MP4 video
  if (mime === 'video/mp4' || ext === 'mp4') {
    return { mime: 'video/mp4', ext: 'mp4' };
  }

  // Fallback defaults if valid extension exists
  if (ext === 'png') return { mime: 'image/png', ext: 'png' };
  if (ext === 'webp') return { mime: 'image/webp', ext: 'webp' };
  if (ext === 'mp4') return { mime: 'video/mp4', ext: 'mp4' };

  return { mime: 'image/jpeg', ext: 'jpg' };
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
 * Upload a file to a designated folder in the 'ps-perfumes' bucket
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

  // 1. Validate file size
  const isVideo = file.type?.startsWith('video/') || (file.name && file.name.endsWith('.mp4'));
  const maxSize = isVideo ? MAX_VIDEO_SIZE_BYTES : MAX_IMAGE_SIZE_BYTES;
  const maxLabel = isVideo ? '50MB' : '10MB';

  if (file.size && file.size > maxSize) {
    return {
      url: '',
      path: '',
      error: `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the maximum allowed limit of ${maxLabel}.`,
    };
  }

  // 2. Extract and sanitize file name
  const originalName = file.name || 'asset';
  const cleanOriginal = sanitizeFileName(originalName);
  const rawParts = cleanOriginal.split('.');
  const detectedExt = rawParts.length > 1 ? rawParts.pop() : '';
  const baseName = rawParts.join('.') || 'file';

  // 3. Normalize MIME and extension
  const { mime: contentType, ext: normalizedExt } = normalizeMimeAndExtension(file, detectedExt);

  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return {
      url: '',
      path: '',
      error: `Unsupported file format (${contentType || detectedExt}). Please use WebP, PNG, JPEG, or MP4.`,
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
  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      });

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
        userFriendlyMsg = `Storage rejected the upload (${statusCode || '403'}: ${rawMsg}). ${cause} Fix: apply supabase/migrations/20261019_admin_media_and_product_delete.sql (or the narrow supabase/repairs/20261021_storage_upload_repair.sql) in the Supabase SQL Editor.`;
      } else if (rawMsg.includes('Invalid key')) {
        userFriendlyMsg = `Invalid storage object key "${filePath}" (${rawMsg}).`;
      } else if (rawMsg.includes('mime type') || rawMsg.includes('not allowed')) {
        userFriendlyMsg = `MIME type "${contentType}" is rejected by bucket "${STORAGE_BUCKET}" (${rawMsg}). Allowed formats: WebP, JPEG, PNG, MP4.`;
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
 * Remove an existing file from the 'ps-perfumes' bucket
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

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([cleanPath]);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err?.message || 'Storage deletion failed' };
  }
}

/**
 * Remove several objects from the 'ps-perfumes' bucket and report what was actually removed.
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
