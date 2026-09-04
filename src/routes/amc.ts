import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { deleteStorageFiles } from '../services/storageCleanup.js';

const router = Router();

// AMC & Assets management is an admin-only feature (see Layout.tsx nav).
// Scoped to this router's own path prefix — router.use() without a path
// would match every request reaching this point in the app-level chain
// (since these routers are mounted at "/"), incorrectly blocking unrelated
// routes registered later, like the admin migration endpoint.
router.use('/api/amc', requireAuth, requireRole('SuperAdmin', 'WingAdmin'));

// --- AMC (Annual Maintenance Contracts) ---
router.get('/api/amc', async (req, res) => {
  try {
    const { societyId } = req.query;
    let query = 'SELECT * FROM society_amc';
    const params: any[] = [];
    if (societyId) {
      query += ' WHERE society_id = $1';
      params.push(societyId);
    }
    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      id: row.id,
      assetId: row.asset_id,
      assetName: row.asset_name,
      vendorName: row.vendor_name,
      startDate: row.start_date,
      expiryDate: row.expiry_date,
      status: row.status,
      cost: parseFloat(row.cost),
      contractPdfUrl: row.contract_pdf_url,
      contractPdfUrls: row.contract_pdf_urls,
      paymentDuration: row.payment_duration,
      paymentMethod: row.payment_method,
      lastServiceDate: row.last_service_date,
      category: row.category,
      societyId: row.society_id
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/amc', async (req, res) => {
  const { id, assetId, assetName, vendorName, startDate, expiryDate, status, cost, contractPdfUrl, contractPdfUrls, paymentDuration, paymentMethod, lastServiceDate, category, societyId } = req.body;
  try {
    await pool.query(
      'INSERT INTO society_amc (id, asset_id, asset_name, vendor_name, start_date, expiry_date, status, cost, contract_pdf_url, contract_pdf_urls, payment_duration, payment_method, last_service_date, category, society_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)',
      [id, assetId, assetName, vendorName, startDate, expiryDate, status, cost, contractPdfUrl, contractPdfUrls ? JSON.stringify(contractPdfUrls) : null, paymentDuration, paymentMethod, lastServiceDate, category, societyId || 'soc-mtb32pfk']
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/amc/:id', async (req, res) => {
  const { id } = req.params;
  const { assetId, assetName, vendorName, startDate, expiryDate, status, cost, contractPdfUrl, contractPdfUrls, paymentDuration, paymentMethod, lastServiceDate, category, societyId } = req.body;
  try {
    await pool.query(
      'UPDATE society_amc SET asset_id = $1, asset_name = $2, vendor_name = $3, start_date = $4, expiry_date = $5, status = $6, cost = $7, contract_pdf_url = $8, contract_pdf_urls = $9, payment_duration = $10, payment_method = $11, last_service_date = $12, category = $13, society_id = COALESCE($14, society_id) WHERE id = $15',
      [assetId, assetName, vendorName, startDate, expiryDate, status, cost, contractPdfUrl, contractPdfUrls ? JSON.stringify(contractPdfUrls) : null, paymentDuration, paymentMethod, lastServiceDate, category, societyId || null, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/amc/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM society_amc WHERE id = $1 RETURNING contract_pdf_url, contract_pdf_urls',
      [id]
    );
    if (result.rows.length > 0) {
      const { contract_pdf_url, contract_pdf_urls } = result.rows[0];
      const urls: string[] = [contract_pdf_url, ...(Array.isArray(contract_pdf_urls) ? contract_pdf_urls : [])];
      deleteStorageFiles(urls).catch((err) =>
        console.warn('[AMC] Storage cleanup failed for deleted contract:', err)
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
