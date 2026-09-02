import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getSupabaseUrl } from '../services/storage.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// --- File Upload & Storage ---
// Uploads (warranty PDFs, AMC contracts, tendor quotations) are admin-only actions.
router.post('/api/upload', requireAuth, requireRole('SuperAdmin', 'WingAdmin'), async (req, res) => {
  const { bucket, filename, contentBase64, mimeType } = req.body;
  if (!bucket || !filename || !contentBase64) {
    return res.status(400).json({ error: 'Missing bucket, filename or contentBase64' });
  }
  try {
    // 1. Insert into society_storage_files table (Virtual local fallback)
    await pool.query(
      `INSERT INTO society_storage_files (bucket, filename, mime_type, content_base64)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (bucket, filename)
       DO UPDATE SET mime_type = EXCLUDED.mime_type, content_base64 = EXCLUDED.content_base64`,
      [bucket, filename, mimeType || 'application/pdf', contentBase64]
    );

    // 2. Method B: Upload directly to Supabase Storage via REST API using the Admin Service Role Key
    // (This is the real sync to the physical bucket. Supabase's Storage API manages its own
    // storage.objects row internally when this succeeds, so we don't need to insert into
    // storage.objects manually here — a prior attempt to do so always failed because
    // "path_tokens" is a GENERATED column and can't be set explicitly.)
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

        console.log(`Method B Sync: Uploading to Supabase Storage REST API: ${uploadUrl}`);
        const uploadResponse = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceKey}`,
            'apikey': serviceKey,
            'Content-Type': mimeType || 'application/pdf',
            'x-upsert': 'true'
          },
          body: fileBuffer
        });

        if (!uploadResponse.ok) {
          const errText = await uploadResponse.text();
          console.error(`Method B Sync Failed: Supabase returned ${uploadResponse.status} ${uploadResponse.statusText} - ${errText}`);
        } else {
          console.log(`Method B Sync Succeeded: File successfully synced to Supabase bucket "${bucket}".`);
        }
      } catch (storageErr: any) {
        console.error('Method B Sync Error:', storageErr.message);
      }
    } else {
      console.warn('SUPABASE_SERVICE_ROLE_KEY is not configured. Direct physical bucket upload bypassed.');
    }

    res.json({
      success: true,
      url: `/api/storage/${bucket}/${encodeURIComponent(filename)}`
    });
  } catch (err: any) {
    console.error('Upload endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Viewing/downloading a previously uploaded file just requires being logged in
// (e.g. a resident viewing a notice attachment), not admin privileges.
router.get('/api/storage/:bucket/:filename', requireAuth, async (req, res) => {
  const { bucket, filename } = req.params;
  try {
    const result = await pool.query(
      'SELECT mime_type, content_base64 FROM society_storage_files WHERE bucket = $1 AND filename = $2',
      [bucket, filename]
    );
    if (result.rows.length === 0) {
      return res.status(404).send('File not found');
    }
    const file = result.rows[0];
    const mimeType = file.mime_type || 'application/octet-stream';
    let base64Data = file.content_base64;
    if (base64Data.includes(';base64,')) {
      base64Data = base64Data.split(';base64,')[1];
    }
    const buffer = Buffer.from(base64Data, 'base64');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

export default router;
