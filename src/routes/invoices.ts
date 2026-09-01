import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// --- Invoices ---
router.get('/api/invoices', async (req, res) => {
  try {
    const { societyId, residentId, residentName, status, defaulters, pending, frequency } = req.query;
    let query = 'SELECT * FROM society_invoices WHERE 1=1';
    const params: any[] = [];
    if (societyId) {
      params.push(societyId);
      query += ` AND society_id = $${params.length}`;
    }
    if (residentId) {
      params.push(residentId);
      query += ` AND (resident_id = $${params.length} OR resident_name ILIKE $${params.length})`;
    }
    if (defaulters === 'true') {
      const todayStr = new Date().toISOString().split('T')[0];
      params.push(todayStr);
      query += ` AND (status = 'Overdue' OR (status != 'Paid' AND due_date < $${params.length}))`;
    } else if (pending === 'true') {
      query += ` AND status != 'Paid'`;
    } else if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    if (frequency && frequency !== 'ALL') {
      params.push(frequency);
      query += ` AND frequency = $${params.length}`;
    }
    query += ' ORDER BY due_date DESC, id DESC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      id: row.id,
      residentName: row.resident_name,
      residentId: row.resident_id,
      wing: row.wing,
      apartmentNo: row.apartment_no,
      amount: parseFloat(row.amount),
      dueDate: row.due_date,
      status: row.status,
      type: row.type,
      frequency: row.frequency,
      period: row.period,
      breakdown: typeof row.breakdown === 'string' ? JSON.parse(row.breakdown) : (row.breakdown || null),
      paidAt: row.paid_at,
      receiptId: row.receipt_id,
      paymentMethod: row.payment_method,
      description: row.description,
      societyId: row.society_id
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/invoices', async (req, res) => {
  const { id, residentName, residentId, wing, apartmentNo, amount, dueDate, status, type, frequency, period, breakdown, description, societyId } = req.body;
  try {
    const invId = id || `INV-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    await pool.query(
      `INSERT INTO society_invoices (id, resident_name, resident_id, wing, apartment_no, amount, due_date, status, type, frequency, period, breakdown, description, society_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         resident_name = EXCLUDED.resident_name,
         resident_id = EXCLUDED.resident_id,
         wing = EXCLUDED.wing,
         apartment_no = EXCLUDED.apartment_no,
         amount = EXCLUDED.amount,
         due_date = EXCLUDED.due_date,
         status = EXCLUDED.status,
         type = EXCLUDED.type,
         frequency = EXCLUDED.frequency,
         period = EXCLUDED.period,
         breakdown = EXCLUDED.breakdown,
         description = EXCLUDED.description,
         society_id = EXCLUDED.society_id`,
      [
        invId,
        residentName,
        residentId || null,
        wing || null,
        apartmentNo || null,
        amount,
        dueDate,
        status || 'Unpaid',
        type || 'Maintenance',
        frequency || null,
        period || null,
        breakdown ? JSON.stringify(breakdown) : null,
        description || null,
        societyId || 'soc-mtb32pfk'
      ]
    );
    res.json({ success: true, id: invId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/invoices/:id', async (req, res) => {
  const { id } = req.params;
  const { residentName, residentId, wing, apartmentNo, amount, dueDate, status, type, frequency, period, breakdown, paidAt, receiptId, paymentMethod, description, societyId } = req.body;
  try {
    await pool.query(
      `UPDATE society_invoices 
       SET resident_name = COALESCE($1, resident_name),
           resident_id = COALESCE($2, resident_id),
           wing = COALESCE($3, wing),
           apartment_no = COALESCE($4, apartment_no),
           amount = COALESCE($5, amount),
           due_date = COALESCE($6, due_date),
           status = COALESCE($7, status),
           type = COALESCE($8, type),
           frequency = COALESCE($9, frequency),
           period = COALESCE($10, period),
           breakdown = COALESCE($11, breakdown),
           paid_at = COALESCE($12, paid_at),
           receipt_id = COALESCE($13, receipt_id),
           payment_method = COALESCE($14, payment_method),
           description = COALESCE($15, description),
           society_id = COALESCE($16, society_id) 
       WHERE id = $17`,
      [
        residentName || null,
        residentId || null,
        wing || null,
        apartmentNo || null,
        amount || null,
        dueDate || null,
        status || null,
        type || null,
        frequency || null,
        period || null,
        breakdown ? JSON.stringify(breakdown) : null,
        paidAt || null,
        receiptId || null,
        paymentMethod || null,
        description || null,
        societyId || null,
        id
      ]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/invoices/:id/pay', async (req, res) => {
  const { id } = req.params;
  const { paymentMethod, transactionRef, amountPaid, paidByResidentId, paidByResidentName, notes } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // 1. Get invoice details
    const invRes = await client.query('SELECT * FROM society_invoices WHERE id = $1', [id]);
    if (invRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }
    const inv = invRes.rows[0];
    const amount = amountPaid ? parseFloat(amountPaid) : parseFloat(inv.amount);
    const payDate = new Date().toISOString().split('T')[0];
    const payTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const receiptId = `REC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const txRef = transactionRef || `TXREF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    const payMethod = paymentMethod || 'UPI';

    // 2. Insert into society_receipts
    await client.query(
      `INSERT INTO society_receipts 
       (id, invoice_id, resident_id, resident_name, wing, apartment_no, amount, payment_date, payment_time, payment_method, transaction_ref, period, frequency, society_id, society_name, status, breakdown, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
      [
        receiptId,
        id,
        paidByResidentId || inv.resident_id || null,
        paidByResidentName || inv.resident_name,
        inv.wing || null,
        inv.apartment_no || null,
        amount,
        payDate,
        payTime,
        payMethod,
        txRef,
        inv.period || 'General Maintenance',
        inv.frequency || 'Monthly',
        inv.society_id || 'soc-mtb32pfk',
        'Arkade Earth',
        'Success',
        inv.breakdown ? JSON.stringify(inv.breakdown) : null,
        new Date().toISOString()
      ]
    );

    // 3. Update invoice status
    await client.query(
      `UPDATE society_invoices 
       SET status = 'Paid', paid_at = $1, receipt_id = $2, payment_method = $3
       WHERE id = $4`,
      [payDate, receiptId, payMethod, id]
    );

    // 4. Add transaction to accounting ledger
    const txId = `TX-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const txTitle = `Maintenance Payment: ${inv.resident_name} (${inv.wing ? inv.wing + '-' : ''}${inv.apartment_no || ''}) [${inv.period || inv.type}]`;
    await client.query(
      `INSERT INTO society_transactions (id, title, amount, type, category, date, society_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        txId,
        txTitle,
        amount,
        'Income',
        'Maintenance',
        payDate,
        inv.society_id || 'soc-mtb32pfk'
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      receiptId,
      transactionRef: txRef,
      paymentDate: payDate,
      paymentTime: payTime,
      amount
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error processing maintenance payment:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;
