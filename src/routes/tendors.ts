import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { deleteStorageFiles } from '../services/storageCleanup.js';

const router = Router();

// Tendor Management is an admin-only feature (see Layout.tsx nav).
router.use('/api/tendors', requireAuth, requireRole('SuperAdmin', 'WingAdmin'));

// --- Tendors & Quotations ---
router.get('/api/tendors', async (req, res) => {
  try {
    const { societyId } = req.query;
    let tQuery = 'SELECT * FROM society_tendors';
    const tParams: any[] = [];
    if (societyId) {
      tQuery += ' WHERE society_id = $1';
      tParams.push(societyId);
    }
    const tendorsRes = await pool.query(tQuery, tParams);
    const quotationsRes = await pool.query('SELECT * FROM society_quotations');
    
    const result = tendorsRes.rows.map(t => {
      const qs = quotationsRes.rows
        .filter(q => q.tendor_id === t.id)
        .map(q => ({
          vendorId: q.vendor_id,
          vendorName: q.vendor_name,
          quotation: parseFloat(q.quotation),
          pdfUrl: q.pdf_url,
          pdfName: q.pdf_name,
          societyId: q.society_id
        }));
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        societyId: t.society_id,
        quotations: qs
      };
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/tendors', async (req, res) => {
  const { id, name, description, quotations, societyId } = req.body;
  if (!societyId) {
    return res.status(400).json({ error: 'societyId is required.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO society_tendors (id, name, description, society_id) VALUES ($1, $2, $3, $4)', [id, name, description, societyId]);
    if (quotations && Array.isArray(quotations)) {
      for (const q of quotations) {
        await client.query(
          'INSERT INTO society_quotations (tendor_id, vendor_id, vendor_name, quotation, pdf_url, pdf_name, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [id, q.vendorId, q.vendorName, q.quotation, q.pdfUrl, q.pdfName, societyId]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.put('/api/tendors/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description, quotations, societyId } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      'UPDATE society_tendors SET name = $1, description = $2, society_id = COALESCE($3, society_id) WHERE id = $4 RETURNING society_id',
      [name, description, societyId || null, id]
    );
    // The tendor's own (possibly pre-existing) society_id is the source of
    // truth for its quotations — not a hardcoded default — since this
    // request doesn't always resend societyId for an update.
    const tendorSocietyId = updated.rows[0]?.society_id;
    if (!tendorSocietyId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'societyId is required.' });
    }

    // This always deletes and re-inserts every quotation row, even ones that
    // are otherwise unchanged (their pdf_url is simply carried over as-is by
    // the frontend when no new file was selected for that row). So we can't
    // just delete every OLD pdf_url — that would break quotations whose file
    // didn't change. Instead, diff old vs incoming urls and only clean up the
    // ones that are actually being replaced or removed.
    const oldQuotationsRes = await client.query('SELECT pdf_url FROM society_quotations WHERE tendor_id = $1', [id]);
    const incomingUrls = new Set(
      (Array.isArray(quotations) ? quotations : []).map((q: any) => q.pdfUrl).filter(Boolean)
    );
    const orphanedUrls = oldQuotationsRes.rows
      .map((r) => r.pdf_url)
      .filter((url) => url && !incomingUrls.has(url));

    await client.query('DELETE FROM society_quotations WHERE tendor_id = $1', [id]);
    if (quotations && Array.isArray(quotations)) {
      for (const q of quotations) {
        await client.query(
          'INSERT INTO society_quotations (tendor_id, vendor_id, vendor_name, quotation, pdf_url, pdf_name, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [id, q.vendorId, q.vendorName, q.quotation, q.pdfUrl, q.pdfName, q.societyId || tendorSocietyId]
        );
      }
    }
    await client.query('COMMIT');

    if (orphanedUrls.length > 0) {
      deleteStorageFiles(orphanedUrls).catch((err) =>
        console.warn('[Tendors] Storage cleanup failed for replaced/removed quotation documents:', err)
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.delete('/api/tendors/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Quotations cascade-delete at the DB level (ON DELETE CASCADE), so their
    // PDF urls must be read out BEFORE deleting the tendor — they're gone
    // from the table immediately afterward.
    const quotationsRes = await pool.query('SELECT pdf_url FROM society_quotations WHERE tendor_id = $1', [id]);
    await pool.query('DELETE FROM society_tendors WHERE id = $1', [id]);
    const urls = quotationsRes.rows.map((r) => r.pdf_url);
    deleteStorageFiles(urls).catch((err) =>
      console.warn('[Tendors] Storage cleanup failed for deleted tendor quotations:', err)
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
