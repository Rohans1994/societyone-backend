import { Router } from 'express';
import crypto from 'crypto';
import { pool } from '../db/pool.js';
import { sendVerificationEmail } from '../services/email.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSupabaseAdminClient } from '../services/supabaseAdmin.js';
import { deleteStorageFile } from '../services/storageCleanup.js';
import { uploadFileToStorage } from '../services/storageUpload.js';

const router = Router();

// --- Current authenticated user's profile ---
// Called right after supabase.auth.signInWithPassword() succeeds on the
// frontend, to fetch role/society/approval-status info for the two-tier
// (email verification + admin approval) login checks.
router.get('/api/users/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// Self-service profile update — any authenticated role can update their own
// name. Deliberately does NOT accept wing/apartmentNo/email/role/societyId:
// wing/apartment changes stay admin-only (they're tied to the Level 2 flat-
// allocation approval this app already enforces at signup), and identity/
// role fields have their own dedicated, admin-gated routes elsewhere.
router.put('/api/users/me', requireAuth, async (req, res) => {
  const { name } = req.body;
  const trimmedName = (name || '').trim();
  if (!trimmedName) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    await pool.query('UPDATE society_users SET name = $1 WHERE uid = $2', [trimmedName, req.user!.uid]);
    res.json({ success: true, name: trimmedName });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Self-service avatar upload — any authenticated role can upload their own
// avatar. Narrowly scoped: unlike POST /api/upload (admin-only, arbitrary
// bucket/filename), this always writes to a fixed, predictable path
// (avatars/<own-uid>.<ext>) inside the caller's own society bucket, so a
// resident can never write anywhere else. Cleans up the previous avatar file
// (best-effort) before saving the new one.
router.post('/api/users/me/avatar', requireAuth, async (req, res) => {
  const { contentBase64, mimeType, fileExtension } = req.body;
  if (!contentBase64) {
    return res.status(400).json({ error: 'contentBase64 is required' });
  }
  try {
    const societyRes = await pool.query('SELECT storage_bucket FROM society_societies WHERE id = $1', [req.user!.societyId]);
    const bucket = societyRes.rows[0]?.storage_bucket || 'assets';
    const ext = (fileExtension || 'jpg').replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
    const filename = `avatars/${req.user!.uid}.${ext}`;

    const oldAvatarRes = await pool.query('SELECT avatar_url FROM society_users WHERE uid = $1', [req.user!.uid]);
    const oldAvatarUrl = oldAvatarRes.rows[0]?.avatar_url;

    const { url } = await uploadFileToStorage(bucket, filename, contentBase64, mimeType || 'image/jpeg');
    await pool.query('UPDATE society_users SET avatar_url = $1 WHERE uid = $2', [url, req.user!.uid]);

    // Best-effort — no-ops for auto-generated ui-avatars.com URLs (nothing of
    // ours to delete), only removes a real previously-uploaded file.
    if (oldAvatarUrl && oldAvatarUrl !== url) {
      deleteStorageFile(oldAvatarUrl).catch((err) =>
        console.warn('[Users] Failed to clean up previous avatar:', err)
      );
    }

    res.json({ success: true, avatarUrl: url });
  } catch (err: any) {
    console.error('Error uploading avatar:', err);
    res.status(500).json({ error: err.message });
  }
});

// --- Users ---
router.get('/api/users/check', async (req, res) => {
  try {
    const { societyId, email } = req.query;
    if (!email) {
      return res.status(400).json({ error: 'Email parameter is required' });
    }
    let query = 'SELECT uid, email, phone, society_id, society_name, admin_approved, email_verified FROM society_users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))';
    const params: any[] = [String(email).trim()];
    if (societyId) {
      query += ' AND society_id = $2';
      params.push(String(societyId).trim());
    }
    const result = await pool.query(query, params);
    res.json({
      exists: result.rows.length > 0,
      user: result.rows[0] ? {
        uid: result.rows[0].uid,
        email: result.rows[0].email,
        phone: result.rows[0].phone || '',
        societyId: result.rows[0].society_id,
        societyName: result.rows[0].society_name,
        adminApproved: result.rows[0].admin_approved !== false,
        emailVerified: result.rows[0].email_verified !== false
      } : null
    });
  } catch (err: any) {
    console.error('Error checking user existence in database:', err);
    res.status(500).json({ error: err.message });
  }
});

// Requires login. Any authenticated role can read this (residents legitimately
// use it for the Resident Directory), but non-SuperAdmins are always scoped to
// their own society server-side — a client-supplied societyId can no longer be
// used to read another society's residents.
router.get('/api/users', requireAuth, async (req, res) => {
  try {
    const isSuperAdmin = req.user!.role === 'SuperAdmin';
    const requestedSocietyId = req.query.societyId as string | undefined;
    const effectiveSocietyId = isSuperAdmin ? requestedSocietyId : req.user!.societyId;

    let query = 'SELECT * FROM society_users';
    const params: any[] = [];
    if (effectiveSocietyId) {
      query += ' WHERE society_id = $1';
      params.push(effectiveSocietyId);
    }
    const result = await pool.query(query, params);
    // Note: password is intentionally omitted. Credentials live in Supabase
    // Auth now, not in this table — never return password to any client.
    res.json(result.rows.map(row => ({
      uid: row.uid,
      name: row.name,
      email: row.email,
      phone: row.phone || '',
      role: row.role,
      wing: row.wing,
      apartmentNo: row.apartment_no,
      avatarUrl: row.avatar_url,
      societyId: row.society_id,
      societyName: row.society_name,
      adminApproved: row.admin_approved !== false,
      emailVerified: row.email_verified !== false
    })));
  } catch (err: any) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/users', async (req, res) => {
  const { uid, name, email, phone, role, wing, apartmentNo, avatarUrl, societyId, societyName, adminApproved, emailVerified, verificationToken } = req.body;
  // If adminApproved is specified, respect it. If not, default to false for Resident, true for Admins
  const isApproved = adminApproved !== undefined ? Boolean(adminApproved) : (role === 'Resident' ? false : true);
  // Email verification: true for pre-seeded/admins, or respect provided emailVerified
  const isEmailVerified = emailVerified !== undefined ? Boolean(emailVerified) : (role === 'Resident' ? false : true);
  const token = verificationToken || Math.floor(100000 + Math.random() * 900000).toString();

  // Some flows (e.g. an admin adding a resident directly via User Management)
  // don't collect a password from the form. Generate a secure temporary one
  // server-side in that case, so account creation still succeeds with a real,
  // working credential rather than failing outright. Returned in the response
  // so the caller can surface it to the admin if desired.
  const password = req.body.password || crypto.randomBytes(12).toString('base64url');
  const generatedPassword = req.body.password ? undefined : password;

  try {
    // Check if another user with the same email already exists in this society
    if (email && societyId) {
      const existingUser = await pool.query(
        'SELECT uid, email FROM society_users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND society_id = $2 AND uid != $3',
        [email.trim(), societyId, uid || '']
      );
      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          error: 'This email address is already registered with this society. Please sign in instead.',
          exists: true
        });
      }
    }

    // Create the Supabase Auth identity server-side (via the Admin API, using
    // the service role key) rather than having the frontend call
    // supabase.auth.signUp() directly — that would trigger Supabase's own
    // email-confirmation flow, which would run alongside (and confuse users
    // next to) this app's own OTP verification screen. email_confirm: true
    // skips Supabase's confirmation since our own OTP flow is already the
    // source of truth for verifying the email is real.
    const supabase = getSupabaseAdminClient();
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError || !authData?.user) {
      // Supabase's own duplicate-email error, or any other signup failure
      return res.status(409).json({ error: authError?.message || 'Could not create account credentials.' });
    }
    const authUid = authData.user.id;

    // Credentials live in Supabase Auth now — this table only stores profile
    // data, linked back to the Supabase identity via auth_uid.
    await pool.query(
      `INSERT INTO society_users (uid, name, email, phone, role, wing, apartment_no, avatar_url, auth_uid, society_id, society_name, admin_approved, email_verified, verification_token) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (uid) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         role = EXCLUDED.role,
         wing = EXCLUDED.wing,
         apartment_no = EXCLUDED.apartment_no,
         avatar_url = EXCLUDED.avatar_url,
         auth_uid = EXCLUDED.auth_uid,
         society_id = EXCLUDED.society_id,
         society_name = EXCLUDED.society_name,
         admin_approved = EXCLUDED.admin_approved,
         email_verified = EXCLUDED.email_verified,
         verification_token = EXCLUDED.verification_token`,
      [uid, name, email, phone || null, role, wing, apartmentNo, avatarUrl, authUid, societyId || null, societyName || null, isApproved, isEmailVerified, token]
    );

    // If resident is registered with unverified email, send verification email
    if (!isEmailVerified && email) {
      sendVerificationEmail(email, name, token, societyName).catch((err) => {
        console.error('[Email Background Error]:', err);
      });
    }

    res.json({ success: true, verificationToken: token, emailVerified: isEmailVerified, generatedPassword });
  } catch (err: any) {
    console.error('Error creating/updating user in database:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk import residents from a CSV parsed client-side into an array of rows.
// Admin-only. Each row goes through the same Supabase Auth creation as a
// single signup, but defaults to a shared temporary password ('Abcd@12345')
// when a row doesn't specify one, and is auto-approved/auto-verified since
// an admin is entering this data directly (no self-signup fraud risk, and
// forcing hundreds of bulk-imported residents through individual email OTP
// verification would defeat the purpose of bulk import). Processes every row
// independently — a bad row is skipped/reported, not a batch failure.
router.post('/api/users/bulk', requireAuth, requireRole('SuperAdmin', 'WingAdmin'), async (req, res) => {
  const { residents } = req.body;
  if (!Array.isArray(residents) || residents.length === 0) {
    return res.status(400).json({ error: 'residents must be a non-empty array' });
  }

  // A bulk import targets one society at a time. Non-SuperAdmins are always
  // scoped to their own society server-side, regardless of what's requested.
  const requestedSocietyId = req.body.societyId;
  const societyId = req.user!.role === 'SuperAdmin' && requestedSocietyId ? requestedSocietyId : req.user!.societyId;
  const societyName = req.user!.role === 'SuperAdmin' && requestedSocietyId ? req.body.societyName : req.user!.societyName;

  const DEFAULT_PASSWORD = 'Abcd@12345';
  const supabase = getSupabaseAdminClient();
  const results: { row: number; email: string; status: 'imported' | 'skipped' | 'failed'; reason?: string }[] = [];

  for (let i = 0; i < residents.length; i++) {
    const row = residents[i] || {};
    const rowNum = i + 1;
    const name = (row.name || '').trim();
    const email = (row.email || '').trim();
    const phone = (row.phone || '').trim() || null;
    const wing = (row.wing || '').trim() || null;
    const apartmentNo = (row.apartmentNo || '').trim() || null;
    const password = (row.password || '').trim() || DEFAULT_PASSWORD;

    if (!name || !email) {
      results.push({ row: rowNum, email: email || '(missing)', status: 'failed', reason: 'name and email are required' });
      continue;
    }

    try {
      const existing = await pool.query(
        'SELECT uid FROM society_users WHERE LOWER(TRIM(email)) = LOWER(TRIM($1)) AND society_id = $2',
        [email, societyId]
      );
      if (existing.rows.length > 0) {
        results.push({ row: rowNum, email, status: 'skipped', reason: 'Already registered in this society' });
        continue;
      }

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });
      if (authError || !authData?.user) {
        results.push({ row: rowNum, email, status: 'failed', reason: authError?.message || 'Could not create account credentials' });
        continue;
      }

      const uid = `res-${crypto.randomBytes(6).toString('hex')}`;
      await pool.query(
        `INSERT INTO society_users (uid, name, email, phone, role, wing, apartment_no, auth_uid, society_id, society_name, admin_approved, email_verified)
         VALUES ($1, $2, $3, $4, 'Resident', $5, $6, $7, $8, $9, TRUE, TRUE)`,
        [uid, name, email, phone, wing, apartmentNo, authData.user.id, societyId, societyName]
      );

      results.push({ row: rowNum, email, status: 'imported' });
    } catch (err: any) {
      results.push({ row: rowNum, email, status: 'failed', reason: err.message });
    }
  }

  res.json({
    success: true,
    total: residents.length,
    imported: results.filter((r) => r.status === 'imported').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
    defaultPasswordUsed: DEFAULT_PASSWORD,
    results
  });
});

router.post('/api/users/verify-email', async (req, res) => {
  const { email, token, uid } = req.body;
  try {
    let query = 'SELECT * FROM society_users WHERE ';
    const params: any[] = [];
    if (uid) {
      query += 'uid = $1';
      params.push(uid);
    } else if (email) {
      query += 'LOWER(TRIM(email)) = LOWER(TRIM($1))';
      params.push(email.trim());
    } else {
      return res.status(400).json({ error: 'Email or UID is required' });
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    // Check if token matches (or allow master code 123456 for easy demo/testing)
    if (token && token.trim() !== user.verification_token && token.trim() !== '123456') {
      return res.status(400).json({ error: 'Invalid verification code. Please check and try again.' });
    }

    await pool.query('UPDATE society_users SET email_verified = TRUE WHERE uid = $1', [user.uid]);
    res.json({ 
      success: true, 
      message: 'Email successfully verified!',
      user: {
        uid: user.uid,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        role: user.role,
        wing: user.wing,
        apartmentNo: user.apartment_no,
        avatarUrl: user.avatar_url,
        societyId: user.society_id,
        societyName: user.society_name,
        adminApproved: user.admin_approved !== false,
        emailVerified: true
      }
    });
  } catch (err: any) {
    console.error('Error verifying email in database:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/users/resend-verification', async (req, res) => {
  const { email, uid } = req.body;
  try {
    let query = 'SELECT * FROM society_users WHERE ';
    const params: any[] = [];
    if (uid) {
      query += 'uid = $1';
      params.push(uid);
    } else if (email) {
      query += 'LOWER(TRIM(email)) = LOWER(TRIM($1))';
      params.push(email.trim());
    } else {
      return res.status(400).json({ error: 'Email or UID is required' });
    }

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newToken = Math.floor(100000 + Math.random() * 900000).toString();
    await pool.query('UPDATE society_users SET verification_token = $1 WHERE uid = $2', [newToken, result.rows[0].uid]);
    
    console.log(`[Verification Code Resend] Dispatching new verification token to ${result.rows[0].email}`);

    sendVerificationEmail(result.rows[0].email, result.rows[0].name, newToken, result.rows[0].society_name).catch((err) => {
      console.error('[Email Resend-Verification Background Error]:', err);
    });

    res.json({ success: true, message: `Verification code sent to ${result.rows[0].email}` });
  } catch (err: any) {
    console.error('Error resending verification token:', err);
    res.status(500).json({ error: err.message });
  }
});

// Approving a resident's flat allocation is an admin action, scoped to the
// admin's own society (SuperAdmins can approve across any society).
router.put('/api/users/:uid/approve', requireAuth, requireRole('SuperAdmin', 'WingAdmin'), async (req, res) => {
  const { uid } = req.params;
  try {
    if (req.user!.role !== 'SuperAdmin') {
      const target = await pool.query('SELECT society_id FROM society_users WHERE uid = $1', [uid]);
      if (target.rows.length === 0 || target.rows[0].society_id !== req.user!.societyId) {
        return res.status(403).json({ error: 'You can only approve residents in your own society' });
      }
    }
    await pool.query('UPDATE society_users SET admin_approved = TRUE WHERE uid = $1', [uid]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error approving user in database:', err);
    res.status(500).json({ error: err.message });
  }
});

// Changing someone's role (e.g. promoting to WingAdmin) is SuperAdmin-only.
router.put('/api/users/:uid/role', requireAuth, requireRole('SuperAdmin'), async (req, res) => {
  const { uid } = req.params;
  const { role } = req.body;
  try {
    await pool.query('UPDATE society_users SET role = $1 WHERE uid = $2', [role, uid]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Deleting a user is an admin action, scoped to the admin's own society
// (SuperAdmins can delete across any society).
router.delete('/api/users/:uid', requireAuth, requireRole('SuperAdmin', 'WingAdmin'), async (req, res) => {
  const { uid } = req.params;
  try {
    if (req.user!.role !== 'SuperAdmin') {
      const target = await pool.query('SELECT society_id FROM society_users WHERE uid = $1', [uid]);
      if (target.rows.length === 0 || target.rows[0].society_id !== req.user!.societyId) {
        return res.status(403).json({ error: 'You can only remove residents in your own society' });
      }
    }
    const result = await pool.query('DELETE FROM society_users WHERE uid = $1 RETURNING avatar_url, auth_uid', [uid]);
    if (result.rows.length > 0) {
      const { avatar_url, auth_uid } = result.rows[0];
      // No-ops for the common case (auto-generated ui-avatars.com URLs aren't
      // ours to delete) — only removes anything if it's a real uploaded file.
      deleteStorageFile(avatar_url).catch((err) =>
        console.warn('[Users] Storage cleanup failed for deleted user avatar:', err)
      );
      // Also remove the corresponding Supabase Auth identity, so a deleted
      // resident's login credential doesn't remain active/orphaned. Best-effort
      // — auth_uid is null for any legacy row never migrated to Supabase Auth.
      if (auth_uid) {
        getSupabaseAdminClient().auth.admin.deleteUser(auth_uid).catch((err: any) =>
          console.warn('[Users] Failed to delete Supabase Auth identity for deleted user:', err.message)
        );
      }
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
