import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool.js';
import { verifySupabaseToken } from '../services/supabaseAdmin.js';

// Augment Express's Request type so `req.user` is known downstream.
declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        authUid: string;
        email: string;
        name: string;
        phone: string | null;
        avatarUrl: string | null;
        role: string;
        societyId: string | null;
        societyName: string | null;
        wing: string | null;
        apartmentNo: string | null;
        adminApproved: boolean;
        emailVerified: boolean;
      };
    }
  }
}

/**
 * Verifies the Supabase Auth JWT sent by the frontend as
 * `Authorization: Bearer <token>`, then loads the matching profile row from
 * society_users (via auth_uid) and attaches it to req.user for downstream
 * handlers. Rejects with 401 if the token is missing/invalid/expired, or 403
 * if the token is valid but no linked profile exists yet.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header. Expected: Bearer <token>' });
  }

  const authUser = await verifySupabaseToken(token);
  if (!authUser) {
    return res.status(401).json({ error: 'Invalid or expired auth token' });
  }

  try {
    const result = await pool.query(
      `SELECT uid, name, email, phone, avatar_url, role, wing, apartment_no, society_id, society_name, admin_approved, email_verified
       FROM society_users WHERE auth_uid = $1`,
      [authUser.id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'No profile found for this account. Contact your society administrator.' });
    }

    const row = result.rows[0];
    req.user = {
      uid: row.uid,
      authUid: authUser.id,
      email: row.email,
      name: row.name,
      phone: row.phone,
      avatarUrl: row.avatar_url,
      role: row.role,
      societyId: row.society_id,
      societyName: row.society_name,
      wing: row.wing,
      apartmentNo: row.apartment_no,
      adminApproved: row.admin_approved !== false,
      emailVerified: row.email_verified !== false
    };
    next();
  } catch (err: any) {
    console.error('[Auth] Failed to load user profile:', err);
    return res.status(500).json({ error: 'Failed to verify user profile' });
  }
}

/**
 * Use after requireAuth to restrict a route to specific roles, e.g.:
 *   router.get('/api/amc', requireAuth, requireRole('SuperAdmin', 'WingAdmin'), handler)
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action' });
    }
    next();
  };
}
