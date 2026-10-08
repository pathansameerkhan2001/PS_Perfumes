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
 * Returns the public CDN URL for a file in Supabase Storage
 * @param {string} path - Full storage path (e.g. 'products/perfume-oud.webp')
 * @returns {string} Public URL
 */
export function getStoragePublicUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (!supabase) return path;

  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

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
    return { url: '', path: '', error: 'No file provided for upload' };
  }
  if (!supabase) {
    return { url: '', path: '', error: 'Supabase client not initialized' };
  }

  const timestamp = Date.now();
  const cleanName = sanitizeFileName(file.name || 'file');
  const subFolder = customSlug ? `${customSlug}/` : '';
  const filePath = `${folder}/${subFolder}${timestamp}-${cleanName}`;

  try {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      return { url: '', path: '', error: error.message };
    }

    const publicUrl = getStoragePublicUrl(data.path);
    return {
      url: publicUrl,
      path: data.path,
      error: null,
    };
  } catch (err) {
    return {
      url: '',
      path: '',
      error: err?.message || 'Storage upload failed',
    };
  }
}

/**
 * Remove an existing file from the 'ps-perfumes' bucket
 * @param {string} path - Storage file path
 * @returns {Promise<{ success: boolean, error: string | null }>}
 */
export async function deleteStorageFile(path) {
  if (!path) return { success: false, error: 'File path required' };
  if (!supabase) return { success: false, error: 'Supabase client not initialized' };

  try {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([path]);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err?.message || 'Storage deletion failed' };
  }
}

// Exact named exports as requested by specifications
export const uploadImage = uploadStorageFile;
export const deleteImage = deleteStorageFile;
export const getPublicImageUrl = getStoragePublicUrl;
