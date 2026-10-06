import { supabase, isSupabaseConfigured, STORAGE_BUCKET } from './supabase';

/**
 * Sanitizes a file name for storage path
 */
export function sanitizeFileName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '-')
    .replace(/-+/g, '-');
}

/**
 * Upload an image file to Supabase Storage under `ps-perfumes` bucket
 * @param {File} file - File object to upload
 * @param {string} folder - 'products', 'categories', 'reels', 'banners', etc.
 * @param {string} customSlug - optional subfolder / slug
 * @returns {Promise<{ url: string, path: string, error: any }>}
 */
export async function uploadImage(file, folder = 'products', customSlug = '') {
  if (!file) return { url: '', path: '', error: 'No file provided' };

  const timestamp = Date.now();
  const cleanName = sanitizeFileName(file.name);
  const subPath = customSlug ? `${customSlug}/` : '';
  const filePath = `${folder}/${subPath}${timestamp}-${cleanName}`;

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        console.warn('Supabase storage upload error:', error);
        // Fallback to local Data URL
        const localUrl = await readFileAsDataUrl(file);
        return { url: localUrl, path: filePath, error: null };
      }

      const { data: publicUrlData } = supabase.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(data.path);

      return {
        url: publicUrlData.publicUrl,
        path: data.path,
        error: null,
      };
    } catch (err) {
      console.warn('Storage upload exception:', err);
      const localUrl = await readFileAsDataUrl(file);
      return { url: localUrl, path: filePath, error: null };
    }
  }

  // Local offline fallback: Convert to Data URL
  const localUrl = await readFileAsDataUrl(file);
  return { url: localUrl, path: filePath, error: null };
}

/**
 * Helper to convert file to Base64 data URL
 */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}
