import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadFileToStorage } from '../services/storageUpload.js';

const router = Router();

// --- File Upload & Storage ---
// Uploads (warranty PDFs, AMC contracts, tendor quotations) are admin-only actions.
router.post('/api/upload', requireAuth, requireRole('SuperAdmin', 'WingAdmin'), async (req, res) => {
  const { bucket, filename, contentBase64, mimeType } = req.body;
  if (!bucket || !filename || !contentBase64) {
    return res.status(400).json({ error: 'Missing bucket, filename or contentBase64' });
  }
  try {
    const { url } = await uploadFileToStorage(bucket, filename, contentBase64, mimeType || 'application/pdf');
    res.json({ success: true, url });
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
