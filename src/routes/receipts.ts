import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// --- Receipts ---
router.get('/api/receipts', async (req, res) => {
  try {
    const { societyId, residentId, residentName, startDate, endDate, invoiceId } = req.query;
    let query = 'SELECT * FROM society_receipts WHERE 1=1';
    const params: any[] = [];
    if (societyId) {
      params.push(societyId);
      query += ` AND society_id = $${params.length}`;
    }
    if (residentId) {
      params.push(residentId);
      query += ` AND (resident_id = $${params.length} OR resident_name ILIKE $${params.length})`;
    }
    if (invoiceId) {
      params.push(invoiceId);
      query += ` AND invoice_id = $${params.length}`;
    }
    if (startDate) {
      params.push(startDate);
      query += ` AND payment_date >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      query += ` AND payment_date <= $${params.length}`;
    }
    query += ' ORDER BY payment_date DESC, created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      id: row.id,
      invoiceId: row.invoice_id,
      residentId: row.resident_id,
      residentName: row.resident_name,
      wing: row.wing,
      apartmentNo: row.apartment_no,
      amount: parseFloat(row.amount),
      paymentDate: row.payment_date,
      paymentTime: row.payment_time,
      paymentMethod: row.payment_method,
      transactionRef: row.transaction_ref,
      period: row.period,
      frequency: row.frequency,
      societyId: row.society_id,
      societyName: row.society_name,
      status: row.status,
      breakdown: typeof row.breakdown === 'string' ? JSON.parse(row.breakdown) : (row.breakdown || null),
      pdfUrl: row.pdf_url,
      createdAt: row.created_at
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/receipts', async (req, res) => {
  const { id, invoiceId, residentId, residentName, wing, apartmentNo, amount, paymentDate, paymentTime, paymentMethod, transactionRef, period, frequency, societyId, societyName, status, breakdown, pdfUrl } = req.body;
  try {
    const receiptId = id || `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    await pool.query(
      `INSERT INTO society_receipts 
       (id, invoice_id, resident_id, resident_name, wing, apartment_no, amount, payment_date, payment_time, payment_method, transaction_ref, period, frequency, society_id, society_name, status, breakdown, pdf_url, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       ON CONFLICT (id) DO UPDATE SET
         resident_name = EXCLUDED.resident_name,
         amount = EXCLUDED.amount,
         payment_date = EXCLUDED.payment_date,
         payment_method = EXCLUDED.payment_method,
         transaction_ref = EXCLUDED.transaction_ref,
         status = EXCLUDED.status`,
      [
        receiptId,
        invoiceId || null,
        residentId || null,
        residentName,
        wing || null,
        apartmentNo || null,
        amount,
        paymentDate || new Date().toISOString().split('T')[0],
        paymentTime || new Date().toLocaleTimeString(),
        paymentMethod || 'UPI',
        transactionRef || `TXREF-${Date.now()}`,
        period || null,
        frequency || null,
        societyId || 'soc-mtb32pfk',
        societyName || 'Arkade Earth',
        status || 'Success',
        breakdown ? JSON.stringify(breakdown) : null,
        pdfUrl || null,
        new Date().toISOString()
      ]
    );
    res.json({ success: true, id: receiptId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
