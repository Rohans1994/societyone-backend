import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl } from './storage.js';

// Server-side Supabase client using the SERVICE ROLE key. Never expose this
// client or its key to the frontend — it bypasses Row Level Security and can
// perform admin actions (creating/deleting auth users, etc).
//
// Used for:
// 1. Verifying the Supabase Auth JWT that the frontend attaches to API
//    requests (see middleware/auth.ts).
// 2. Admin API calls during signup/migration (creating Supabase Auth users
//    on behalf of residents/admins).
let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Set it in your .env file — required for auth token verification and admin user management.'
    );
  }

  cachedClient = createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return cachedClient;
}

/**
 * Verifies a Supabase Auth JWT (as sent by the frontend in the
 * `Authorization: Bearer <token>` header) and returns the authenticated
 * Supabase user (id, email, etc), or null if the token is missing/invalid/expired.
 */
export async function verifySupabaseToken(token: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return null;
  }
  return data.user;
}

/**
 * Computes the dedicated Storage bucket name for a society: its stable id
 * (which is already a safe identifier used everywhere else in the app),
 * plus a slugified version of its display name for human readability, e.g.
 * "soc-mtb32pfk" + "Arkade Earth" -> "soc-mtb32pfk-arkade-earth". Using the
 * id as the primary component means the bucket name stays valid and stable
 * even if the society is later renamed.
 */
export function computeSocietyBucketName(societyId: string, societyName: string): string {
  const slug = (societyName || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const bucketName = slug ? `${societyId}-${slug}` : societyId;
  // Supabase bucket ids must be reasonably short; truncate defensively.
  return bucketName.slice(0, 63).replace(/-+$/g, '');
}

/**
 * Creates the given society's dedicated Storage bucket if it doesn't already
 * exist (idempotent — safe to call every time a society is created/backfilled).
 * Contains tendor/, amc/, and assets/ folders (folders are just path prefixes
 * within the bucket, created implicitly the first time a file is uploaded
 * under that prefix — no separate folder-creation step is needed).
 */
export async function ensureSocietyBucket(societyId: string, societyName: string): Promise<string> {
  const bucketName = computeSocietyBucketName(societyId, societyName);
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage.createBucket(bucketName, { public: false });
  if (error && !/already exists/i.test(error.message)) {
    throw error;
  }
  return bucketName;
}
