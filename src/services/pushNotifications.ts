import { initializeApp, cert, App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { pool } from '../db/pool.js';

// Sends push notifications (via Firebase Cloud Messaging) to residents'
// registered Android devices when an admin creates a notice or event.
//
// Deliberately a safe no-op until Firebase is actually configured: notices
// and events must always save successfully regardless of whether push is
// set up yet, so every function here just logs a warning and returns if
// FIREBASE_SERVICE_ACCOUNT_JSON isn't set, rather than throwing. Callers
// (routes/notices.ts, routes/events.ts) also call these fire-and-forget
// (never awaited into the response), matching the existing best-effort
// storage-cleanup pattern elsewhere in this backend.
let cachedApp: App | null = null;
let initAttempted = false;

function getFirebaseApp(): App | null {
  if (cachedApp) return cachedApp;
  if (initAttempted) return cachedApp; // already tried once this process; don't retry every call
  initAttempted = true;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    console.warn(
      '[Push] FIREBASE_SERVICE_ACCOUNT_JSON is not set — push notifications are disabled. ' +
      'Notices and events will still save normally, just without a push alert to Android devices.'
    );
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    cachedApp = initializeApp({
      credential: cert(serviceAccount)
    });
    console.log('[Push] Firebase Admin SDK initialized — push notifications enabled.');
    return cachedApp;
  } catch (err) {
    console.error('[Push] Failed to initialize Firebase Admin SDK (check FIREBASE_SERVICE_ACCOUNT_JSON is valid JSON):', err);
    return null;
  }
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  // Arbitrary extra data delivered alongside the notification (e.g. notice
  // id, so tapping the notification can deep-link straight to it).
  data?: Record<string, string>;
  // When true, omits the top-level FCM "notification" field so Android
  // does NOT auto-display a plain system-tray notification and skips
  // calling onMessageReceived while backgrounded/killed (see
  // https://firebase.google.com/docs/cloud-messaging/android/receive).
  // Used only for visitor-request alerts, whose custom Android service
  // (VisitorMessagingService) builds its own notification WITH native
  // Approve/Deny action buttons — title/body are carried in `data` instead
  // so that native code has something to read. Every other push (notices,
  // events) is left as a normal notification+data message, unchanged.
  dataOnly?: boolean;
}

async function sendToTokens(tokens: string[], payload: PushNotificationPayload): Promise<void> {
  if (tokens.length === 0) {
    console.warn('[Push] sendToTokens called with zero tokens — nothing to send.');
    return;
  }
  const app = getFirebaseApp();
  if (!app) return;

  console.log(`[Push] Sending "${payload.title}" to ${tokens.length} device(s)...`);

  try {
    const data = { ...(payload.data || {}) };
    if (payload.dataOnly) {
      data.title = payload.title;
      data.body = payload.body;
    }

    const response = await getMessaging(app).sendEachForMulticast({
      tokens,
      ...(payload.dataOnly ? {} : { notification: { title: payload.title, body: payload.body } }),
      data
    });

    console.log(`[Push] FCM response: ${response.successCount} succeeded, ${response.failureCount} failed.`);

    // Prune tokens FCM reports as permanently invalid (app uninstalled,
    // token rotated, etc.) so future sends don't keep retrying them.
    const deadTokens: string[] = [];
    response.responses.forEach((r, idx: number) => {
      if (r.success) {
        console.log(`[Push]   Token ...${tokens[idx].slice(-10)} -> success, messageId=${r.messageId}`);
      } else {
        const code = (r.error as any)?.code;
        console.warn(`[Push]   Token ...${tokens[idx].slice(-10)} -> FAILED: ${code} — ${r.error?.message}`);
        if (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered') {
          deadTokens.push(tokens[idx]);
        }
      }
    });
    if (deadTokens.length > 0) {
      await pool.query('DELETE FROM society_device_tokens WHERE token = ANY($1)', [deadTokens]);
      console.log(`[Push] Pruned ${deadTokens.length} dead token(s) from society_device_tokens.`);
    }
  } catch (err) {
    console.error('[Push] Failed to send notification (exception thrown):', err);
  }
}

/** Sends a push notification to every device registered to one specific resident. */
export async function sendPushToUser(uid: string, payload: PushNotificationPayload): Promise<void> {
  const result = await pool.query('SELECT token FROM society_device_tokens WHERE uid = $1', [uid]);
  await sendToTokens(result.rows.map((r) => r.token), payload);
}

/**
 * Sends a push notification to every registered device belonging to
 * residents of the given society (a broadcast notice/event). `excludeUid`
 * optionally skips one resident (e.g. the admin who created it, though
 * admins don't currently register device tokens either way).
 */
export async function sendPushToSociety(societyId: string, payload: PushNotificationPayload, excludeUid?: string): Promise<void> {
  let query = `
    SELECT dt.token FROM society_device_tokens dt
    JOIN society_users u ON u.uid = dt.uid
    WHERE u.society_id = $1
  `;
  const params: any[] = [societyId];
  if (excludeUid) {
    params.push(excludeUid);
    query += ` AND dt.uid != $${params.length}`;
  }
  const result = await pool.query(query, params);
  await sendToTokens(result.rows.map((r) => r.token), payload);
}
