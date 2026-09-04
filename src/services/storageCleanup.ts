import { pool } from '../db/pool.js';
import { getSupabaseAdminClient } from './supabaseAdmin.js';

/**
 * Best-effort deletion of a single previously-uploaded file, given the URL
 * returned by POST /api/upload (format: /api/storage/<bucket>/<encoded-filename>).
 * Removes it from both the real Supabase Storage bucket and the
 * society_storage_files fallback table.
 *
 * Silently no-ops for empty/legacy/external URLs it can't parse (e.g. an old
 * raw Supabase public URL, or an auto-generated ui-avatars.com avatar) —
 * deleting the owning entity's database row should never be blocked or
 * delayed by storage cleanup, and there's nothing of ours to clean up for
 * those cases anyway.
 */
export async function deleteStorageFile(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const match = url.match(/^\/api\/storage\/([^/]+)\/(.+)$/);
  if (!match) return;

  const bucket = decodeURIComponent(match[1]);
  const filename = decodeURIComponent(match[2]);

  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.storage.from(bucket).remove([filename]);
    if (error) {
      console.warn(`[Storage Cleanup] Could not remove ${bucket}/${filename} from Supabase Storage:`, error.message);
    }
  } catch (err: any) {
    console.warn(`[Storage Cleanup] Error removing ${bucket}/${filename} from Supabase Storage:`, err.message);
  }

  try {
    await pool.query('DELETE FROM society_storage_files WHERE bucket = $1 AND filename = $2', [bucket, filename]);
  } catch (err: any) {
    console.warn(`[Storage Cleanup] Could not remove ${bucket}/${filename} from society_storage_files:`, err.message);
  }
}

/**
 * Deletes multiple files (e.g. AMC's contractPdfUrls array, or a facility's
 * images array) concurrently — each independently best-effort. Duplicate/
 * empty URLs are ignored.
 */
export async function deleteStorageFiles(urls: (string | null | undefined)[]): Promise<void> {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  await Promise.all(unique.map((url) => deleteStorageFile(url)));
}
