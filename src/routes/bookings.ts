import { Router } from 'express';
import { pool } from '../db/pool.js';
import { parseSlotRange, parseTimeStringToMinutes, doTimeRangesOverlap } from '../utils/timeSlots.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// Residents book their own facility slots; admins manage all bookings.
router.use('/api/bookings', requireAuth);

// --- Facility Bookings ---
router.get('/api/bookings', async (req, res) => {
  try {
    const { societyId } = req.query;
    let query = 'SELECT * FROM society_bookings';
    const params: any[] = [];
    if (societyId) {
      query += ' WHERE society_id = $1';
      params.push(societyId);
    }
    query += ' ORDER BY date DESC';
    const result = await pool.query(query, params);
    res.json(result.rows.map(row => ({
      id: row.id,
      facilityId: row.facility_id,
      facilityName: row.facility_name || 'Amenity',
      residentName: row.resident_name,
      residentId: row.resident_id,
      wing: row.wing || '',
      apartmentNo: row.apartment_no || '',
      date: row.date,
      timeSlot: row.time_slot,
      status: row.status,
      qrCode: row.qr_code,
      isPaid: Boolean(row.is_paid),
      amountPaid: row.amount_paid || 0,
      paymentRef: row.payment_ref || '',
      societyId: row.society_id
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/bookings', async (req, res) => {
  const { id, facilityId, facilityName, residentName, residentId, wing, apartmentNo, date, timeSlot, status, qrCode, isPaid, amountPaid, paymentRef, societyId } = req.body;
  try {
    const socId = societyId || 'soc-mtb32pfk';

    let userWing = wing || null;
    let userApt = apartmentNo || null;

    // Fallback: look up resident's wing and apartment number if not explicitly passed
    if ((!userWing || !userApt) && residentId) {
      try {
        const uRes = await pool.query('SELECT wing, apartment_no FROM society_users WHERE uid = $1', [residentId]);
        if (uRes.rows.length > 0) {
          if (!userWing) userWing = uRes.rows[0].wing || null;
          if (!userApt) userApt = uRes.rows[0].apartment_no || null;
        }
      } catch (uErr) {
        // user lookup optional
      }
    }

    // 1. One booking per day rule for resident
    if (residentId || residentName) {
      const userBookingsQuery = await pool.query(
        `SELECT * FROM society_bookings 
         WHERE date = $1 
           AND (status IS NULL OR status != 'Cancelled')
           AND (resident_id = $2 OR resident_name = $3)
           AND society_id = $4`,
        [date, residentId || '', residentName || '', socId]
      );
      if (userBookingsQuery.rows.length > 0) {
        return res.status(400).json({ 
          error: `You already have an active booking on ${date} (${userBookingsQuery.rows[0].facility_name || 'Amenity'} at ${userBookingsQuery.rows[0].time_slot}). Only one booking per day is allowed.` 
        });
      }
    }

    const { start: newStart, end: newEnd } = parseSlotRange(timeSlot);

    // 2. Check for maintenance / facility blocks for this facility and date
    const blocksQuery = await pool.query(
      `SELECT * FROM society_facility_blocks 
       WHERE facility_id = $1 AND date = $2 AND society_id = $3`,
      [facilityId, date, socId]
    );
    for (const blk of blocksQuery.rows) {
      const bStart = parseTimeStringToMinutes(blk.start_time);
      const bEnd = parseTimeStringToMinutes(blk.end_time);
      if (doTimeRangesOverlap(newStart, newEnd, bStart, bEnd)) {
        return res.status(400).json({
          error: `This facility is blocked for maintenance on ${date} (${blk.start_time} - ${blk.end_time}): ${blk.reason}. This slot cannot be booked.`
        });
      }
    }

    // 3. Check for overlapping bookings for this facility and date
    const existingBookings = await pool.query(
      `SELECT * FROM society_bookings 
       WHERE facility_id = $1 AND date = $2 AND (status IS NULL OR status != 'Cancelled') AND society_id = $3`,
      [facilityId, date, socId]
    );

    for (const eb of existingBookings.rows) {
      const { start: existStart, end: existEnd } = parseSlotRange(eb.time_slot);
      if (doTimeRangesOverlap(newStart, newEnd, existStart, existEnd)) {
        return res.status(400).json({
          error: `This slot is already booked for ${timeSlot} on ${date} (overlapping with ${eb.time_slot}). Please select another available time slot.`
        });
      }
    }

    await pool.query(
      `INSERT INTO society_bookings (id, facility_id, facility_name, resident_name, resident_id, wing, apartment_no, date, time_slot, status, qr_code, is_paid, amount_paid, payment_ref, society_id) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        id,
        facilityId,
        facilityName || '',
        residentName,
        residentId || null,
        userWing,
        userApt,
        date,
        timeSlot,
        status || 'Confirmed',
        qrCode,
        Boolean(isPaid),
        amountPaid || 0,
        paymentRef || null,
        socId
      ]
    );

    // If booking was paid, also automatically record into society_transactions as Income
    if (isPaid && amountPaid && amountPaid > 0) {
      const txId = 'tx-book-' + Date.now();
      await pool.query(
        `INSERT INTO society_transactions (id, title, amount, type, category, date, society_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          txId,
          `Amenity Booking: ${facilityName || 'Facility'} (${residentName})`,
          amountPaid,
          'Income',
          'Facility',
          date || new Date().toISOString().split('T')[0],
          socId
        ]
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('Error creating booking:', err);
    res.status(500).json({ error: err.message });
  }
});

// Admin/facility-manager action: verify that a resident's self-declared,
// off-app payment (QR/UPI/bank transfer) actually came through, then confirm
// the booking. Mirrors the "Pending Resident Approval" -> approve pattern.
router.put('/api/bookings/:id/confirm-payment', requireAuth, requireRole('SuperAdmin', 'WingAdmin'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE society_bookings
       SET status = 'Confirmed', is_paid = TRUE, payment_ref = COALESCE(payment_ref, $2)
       WHERE id = $1
       RETURNING *`,
      [id, `TXN-CONF-${Date.now().toString().slice(-6)}`]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const row = result.rows[0];

    // Record the verified payment as society income, same as a booking that
    // was already paid at creation time (see POST /api/bookings above).
    if (row.amount_paid && row.amount_paid > 0) {
      const txId = 'tx-book-' + Date.now();
      await pool.query(
        `INSERT INTO society_transactions (id, title, amount, type, category, date, society_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          txId,
          `Amenity Booking: ${row.facility_name || 'Facility'} (${row.resident_name})`,
          row.amount_paid,
          'Income',
          'Facility',
          row.date || new Date().toISOString().split('T')[0],
          row.society_id
        ]
      );
    }

    res.json({
      success: true,
      booking: {
        id: row.id,
        facilityId: row.facility_id,
        facilityName: row.facility_name || 'Amenity',
        residentName: row.resident_name,
        residentId: row.resident_id,
        wing: row.wing || '',
        apartmentNo: row.apartment_no || '',
        date: row.date,
        timeSlot: row.time_slot,
        status: row.status,
        qrCode: row.qr_code,
        isPaid: Boolean(row.is_paid),
        amountPaid: row.amount_paid || 0,
        paymentRef: row.payment_ref || '',
        societyId: row.society_id
      }
    });
  } catch (err: any) {
    console.error('Error confirming booking payment:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/bookings/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM society_bookings WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting booking:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
