import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { loadUserFromToken } from '../middleware/auth.js';

// Real-time layer (Socket.io) — used alongside, not instead of, the existing
// FCM push notifications (services/pushNotifications.ts). The two cover
// different gaps:
//   - FCM reliably reaches a resident's Android app even when it's
//     backgrounded/closed (a WebSocket connection doesn't survive that).
//   - This WebSocket layer gives instant, no-refresh-needed updates to
//     whichever party has something actively open right now — most
//     importantly the guard's browser screen, which has no FCM-equivalent
//     channel (there's no service worker / Web Push set up for browsers).
//
// Every authenticated connection joins a room keyed to its own uid (for
// direct 1:1 targeting, e.g. "tell this specific resident about this
// visitor") and, if it's an admin, also a per-society room (for broadcasting
// to whoever is currently monitoring the gate/admin console for that society).
let io: SocketIOServer | null = null;

export function initializeRealtime(httpServer: HttpServer, allowedOrigins: string[]): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const result = await loadUserFromToken(token);
    if (!result.user) {
      return next(new Error('Unauthorized'));
    }
    socket.data.user = result.user;
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.uid}`);
    if ((user.role === 'SuperAdmin' || user.role === 'WingAdmin') && user.societyId) {
      socket.join(`society-admins:${user.societyId}`);
    }
  });

  console.log('[Realtime] Socket.io server initialized.');
  return io;
}

/** Emits an event directly to one specific user's connected session(s), if any. */
export function emitToUser(uid: string, event: string, payload: unknown): void {
  io?.to(`user:${uid}`).emit(event, payload);
}

/** Emits an event to every admin/guard session currently connected for a society. */
export function emitToSocietyAdmins(societyId: string, event: string, payload: unknown): void {
  io?.to(`society-admins:${societyId}`).emit(event, payload);
}
