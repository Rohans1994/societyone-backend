import { Router } from 'express';
import { pool } from '../db/pool.js';

const router = Router();

// --- Maintenance Plans & Auto-Billing ---
router.get('/api/maintenance-plans', async (req, res) => {
  try {
    const { societyId } = req.query;
    let query = 'SELECT * FROM society_maintenance_plans';
    const params: any[] = [];
    if (societyId) {
      query += ' WHERE society_id = $1';
      params.push(societyId);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      id: row.id,
      title: row.title,
      frequency: row.frequency,
      periodLabel: row.period_label,
      startDate: row.start_date,
      endDate: row.end_date,
      dueDate: row.due_date,
      rateAmount: parseFloat(row.rate_amount),
      breakdown: typeof row.breakdown === 'string' ? JSON.parse(row.breakdown) : (row.breakdown || null),
      wing: row.wing,
      notes: row.notes,
      societyId: row.society_id,
      createdAt: row.created_at
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/maintenance-plans', async (req, res) => {
  const { id, title, frequency, periodLabel, startDate, endDate, dueDate, rateAmount, breakdown, wing, notes, societyId } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const planId = id || `MNT-PLAN-${Date.now()}`;
    const socId = societyId || 'soc-mtb32pfk';

    // 1. Insert maintenance plan
    await client.query(
      `INSERT INTO society_maintenance_plans 
       (id, title, frequency, period_label, start_date, end_date, due_date, rate_amount, breakdown, wing, notes, society_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        planId,
        title,
        frequency || 'Monthly',
        periodLabel,
        startDate,
        endDate,
        dueDate,
        rateAmount,
        breakdown ? JSON.stringify(breakdown) : null,
        wing || 'ALL',
        notes || '',
        socId,
        new Date().toISOString()
      ]
    );

    // 2. Fetch residents for this society (and matching wing if specified)
    let userQuery = `SELECT * FROM society_users WHERE (society_id = $1 OR society_id IS NULL) AND (role = 'Resident' OR role = 'resident' OR role IS NULL OR apartment_no IS NOT NULL)`;
    const userParams: any[] = [socId];
    if (wing && wing !== 'ALL') {
      userParams.push(wing);
      userQuery += ` AND (wing = $${userParams.length} OR wing IS NULL)`;
    }
    const usersRes = await client.query(userQuery, userParams);
    let targetResidents = usersRes.rows;

    // Fallback: If no registered residents exist yet, query all users for this society
    if (targetResidents.length === 0) {
      const allUsers = await client.query(`SELECT * FROM society_users WHERE society_id = $1 OR society_id IS NULL`, [socId]);
      targetResidents = allUsers.rows;
    }
    if (targetResidents.length === 0) {
      const anyUsers = await client.query(`SELECT * FROM society_users LIMIT 50`);
      targetResidents = anyUsers.rows;
    }

    const generatedInvoices: any[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    // 3. Generate invoices for each resident
    for (const resident of targetResidents) {
      const invId = `INV-${frequency.substring(0, 3).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      const desc = `${title} - ${periodLabel} (${frequency})`;

      await client.query(
        `INSERT INTO society_invoices 
         (id, resident_name, resident_id, wing, apartment_no, amount, due_date, status, type, frequency, period, breakdown, description, society_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          invId,
          resident.name || 'Resident',
          resident.uid || null,
          resident.wing || 'Wing A',
          resident.apartment_no || '101',
          rateAmount,
          dueDate,
          'Unpaid',
          'Maintenance',
          frequency,
          periodLabel,
          breakdown ? JSON.stringify(breakdown) : null,
          desc,
          socId
        ]
      );

      generatedInvoices.push({
        id: invId,
        residentName: resident.name,
        amount: rateAmount,
        dueDate
      });
    }

    // 4. Create high-priority broadcast notice to every resident
    const noticeId = `notif-mnt-${Date.now()}`;
    const noticeTitle = `📢 Maintenance Bill Generated: ${periodLabel} (${frequency})`;
    const noticeDesc = `The Managing Committee has issued the ${frequency.toLowerCase()} maintenance billing of ₹${Number(rateAmount).toLocaleString('en-IN')} for period ${periodLabel}. Due date for payment is ${dueDate}. Please check the 'Maintenance' tab or 'Pay Bills' to view your invoice and make payment.`;
    
    await client.query(
      `INSERT INTO society_notices (id, title, description, category, date, priority, created_by, created_by_name, society_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        noticeId,
        noticeTitle,
        noticeDesc,
        'Maintenance',
        todayStr,
        'High',
        'admin',
        'Managing Committee (Admin)',
        socId
      ]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      planId,
      generatedCount: generatedInvoices.length,
      noticeId
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error setting maintenance plan:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;
