import crypto from 'node:crypto';
import { getLocalDb, hashSecret } from './local-db.js';
import { getServiceClient } from './supabase.js';

export const SESSION_COOKIE_NAME = 'voxrelay_session';

export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export function setSessionCookie(res, token, maxAgeSeconds = 60 * 60 * 24 * 7) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

export function createLocalSession(db, userId, userAgent = '') {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashSecret(rawToken);
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    `INSERT INTO local_sessions (id, user_id, token_hash, user_agent, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, tokenHash, String(userAgent).slice(0, 160), expiresAt, now.toISOString());
  return { rawToken, sessionId: id, expiresAt };
}

export async function resolveActor(req) {
  // 1. Check Bearer token against Supabase if configured
  const authHeader = req.headers?.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const service = getServiceClient();
    if (service) {
      try {
        const token = authHeader.slice(7).trim();
        const { data, error } = await service.auth.getUser(token);
        if (!error && data?.user) {
          return {
            mode: 'supabase',
            user: {
              id: data.user.id,
              email: data.user.email || '',
              full_name: data.user.user_metadata?.full_name || '',
              role: data.user.user_metadata?.role || 'interpreter',
            },
            supabase: service,
          };
        }
      } catch {
        // fall through to local cookie check
      }
    }
  }

  // 2. Check local HTTP-only session cookie
  const db = getLocalDb();
  if (!db) return null;
  const cookies = parseCookies(req);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken) return null;

  const tokenHash = hashSecret(rawToken);
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.full_name, u.role, u.locale
       FROM local_sessions s
       JOIN local_users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash);

  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM local_sessions WHERE id = ?').run(row.session_id);
    return null;
  }

  return {
    mode: 'local',
    sessionId: row.session_id,
    user: {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      role: row.role,
      locale: row.locale || 'en',
    },
    db,
  };
}
