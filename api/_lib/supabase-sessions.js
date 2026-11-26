import { parseCookies } from './auth-session.js';
import { getServiceClient } from './supabase.js';
import { HttpError } from './authz.js';

export function expireSupabaseCookies(req, res) {
  const values = Object.keys(parseCookies(req)).filter((name) => /^sb-.*-auth-token(?:\.\d+)?$/.test(name))
    .map((name) => `${name}=; Path=/; Max-Age=0; SameSite=Lax${String(req.headers?.['x-forwarded-proto'] || '').includes('https') || process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  const previous = res.getHeader?.('Set-Cookie');
  if (values.length) res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : previous ? [previous] : []), ...values]);
}
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new HttpError(503, 'Session service timed out. Please retry.')), 4000); })]); }
  finally { clearTimeout(timer); }
}
/** Caller must first resolveActor: decode only that server-verified identity's token. */
export async function currentSupabaseSession(req, res, actor) {
  const token = actor.accessToken;
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    if (payload.sub !== actor.user.id || typeof payload.session_id !== 'string') return null;
    return { token, id: payload.session_id, expires_at: new Date(payload.exp * 1000).toISOString(), created_at: new Date(payload.iat * 1000).toISOString(), user_agent: req.headers?.['user-agent'] || 'Current browser', isCurrent: true };
  } catch { return null; }
}
export async function revokeSupabaseSessions(req, res, actor, action, sessionId) {
  const current = await currentSupabaseSession(req, res, actor);
  if (!current) throw new HttpError(401, 'A verified current session is required. Sign in again.');
  if (action === 'revoke_session' && sessionId !== current.id) throw new HttpError(501, 'Revoking an individual remote Supabase session is not supported. Use revoke all sessions instead.');
  const service = getServiceClient();
  if (!service) throw new HttpError(503, 'Session revocation service is unavailable.');
  const { error } = await bounded(service.auth.admin.signOut(current.token, action === 'revoke_all' ? 'global' : 'local'));
  if (error) throw new HttpError(503, 'Session revocation failed. Please retry.');
  expireSupabaseCookies(req, res);
}
