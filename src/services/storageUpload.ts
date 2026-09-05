import { pool } from '../db/pool.js';
import { getSupabaseUrl } from './storage.js';

/**
 * Uploads base64 file content to a bucket/path using the service role key
 * (bypasses Storage RLS entirely), and records it in the society_storage_files
 * fallback table so it can also be served back via GET /api/storage/:bucket/:filename.
 * Shared by POST /api/upload (admin-only, arbitrary bucket/filename) and
 * POST /api/users/me/avatar (any authenticated user, narrowly scoped to their
 * own avatar path) — both need the exact same underlying upload mechanism,
 * just with different permission scoping at the route level.
 */
export async function uploadFileToStorage(
  bucket: string,
  filename: string,
  contentBase64: string,
  mimeType?: string
): Promise<{ url: string }> {
  // 1. Insert into society_storage_files table (virtual local fallback)
  await pool.query(
    `INSERT INTO society_storage_files (bucket, filename, mime_type, content_base64)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (bucket, filename)
     DO UPDATE SET mime_type = EXCLUDED.mime_type, content_base64 = EXCLUDED.content_base64`,
    [bucket, filename, mimeType || 'application/octet-stream', contentBase64]
  );

  // 2. Sync to the real Supabase Storage bucket via REST API using the service role key
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    try {
      const supabaseUrl = getSupabaseUrl();
      let cleanBase64 = contentBase64;
      if (cleanBase64.includes(';base64,')) {
        cleanBase64 = cleanBase64.split(';base64,')[1];
      }
      const fileBuffer = Buffer.from(cleanBase64, 'base64');
      const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURIComponent(filename)}`;

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          apikey: serviceKey,
          'Content-Type': mimeType || 'application/octet-stream',
          'x-upsert': 'true'
        },
        body: fileBuffer
      });

      if (!uploadResponse.ok) {
        const errText = await uploadResponse.text();
        console.error(`Storage upload failed: ${uploadResponse.status} ${uploadResponse.statusText} - ${errText}`);
      }
    } catch (err: any) {
      console.error('Storage upload error:', err.message);
    }
  } else {
    console.warn('SUPABASE_SERVICE_ROLE_KEY is not configured. Direct physical bucket upload bypassed.');
  }

  return { url: `/api/storage/${bucket}/${encodeURIComponent(filename)}` };
}
