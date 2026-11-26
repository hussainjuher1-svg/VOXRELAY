import crypto from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { HttpError } from './authz.js';
import { getLocalDb, hashSecret } from './local-db.js';
import { getServiceClient, getSupabaseConfig } from './supabase.js';

export const SESSION_COOKIE_NAME = 'voxrelay_session';
export const REMEMBER_ME_COOKIE_NAME = 'voxrelay_remember_me';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days persistent
export const SESSION_BROWSER_MAX_AGE_SECONDS = 60 * 60 * 24; // 1 day server-side for browser-session mode

function isSecureRequest(req) {
  const xfProto = String(req.headers?.['x-forwarded-proto'] || '').toLowerCase();
  if (xfProto) return xfProto === 'https';
  return process.env.NODE_ENV === 'production';
}

export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

function appendSetCookie(res, value) {
  let prev;
  if (typeof res.getHeader === 'function') prev = res.getHeader('Set-Cookie');
  else if (typeof res.get === 'function') prev = res.get('Set-Cookie');
  if (prev === undefined && res.headers && typeof res.headers === 'object') prev = res.headers['set-cookie'] ?? res.headers['Set-Cookie'];
  if (!prev) {
    res.setHeader('Set-Cookie', value);
  } else if (Array.isArray(prev)) {
    res.setHeader('Set-Cookie', [...prev, value]);
  } else {
    res.setHeader('Set-Cookie', [prev, value]);
  }
}

export function getRememberMeFromRequest(req) {
  const cookies = parseCookies(req);
  return cookies[REMEMBER_ME_COOKIE_NAME] === '1';
}

export function setRememberMeCookie(req, res, rememberMe) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  if (rememberMe) {
    appendSetCookie(
      res,
      `${REMEMBER_ME_COOKIE_NAME}=1; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`
    );
  } else {
    // Browser-session cookie (no Max-Age/Expires) so it clears when browser session ends.
    appendSetCookie(res, `${REMEMBER_ME_COOKIE_NAME}=0; Path=/; SameSite=Lax${secure}`);
  }
}

export function clearRememberMeCookie(req, res) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  appendSetCookie(res, `${REMEMBER_ME_COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0${secure}`);
}

export function setSessionCookie(reqOrRes, resOrToken, tokenOrOpts, maybeOpts) {
  // Backward compat: (res, token, opts?) or new (req, res, token, opts?)
  let req, res, token, opts;
  if (typeof tokenOrOpts === 'string' || tokenOrOpts === undefined) {
    // new signature: (req, res, token, opts?)
    req = reqOrRes; res = resOrToken; token = tokenOrOpts; opts = maybeOpts || {};
  } else {
    // old signature: (res, token, opts?)
    req = resOrToken?.req || null; res = reqOrRes; token = resOrToken; opts = tokenOrOpts || {};
    // old was (res, token) where token is string - handle that
  }
  if (typeof resOrToken === 'string') {
    // old: (res, token)
    req = null; res = reqOrRes; token = resOrToken; opts = tokenOrOpts || {};
  }
  const rememberMe = Boolean(opts?.rememberMe);
  const secure = req ? (isSecureRequest(req) ? '; Secure' : '') : (process.env.NODE_ENV === 'production' ? '; Secure' : '');
  // Remember Me checked: persistent cookie, 30-day max. Unchecked: browser-session cookie (no Max-Age).
  const maxAgeAttr = rememberMe ? `; Max-Age=${SESSION_MAX_AGE_SECONDS}` : '';
  appendSetCookie(
    res,
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${maxAgeAttr}${secure}`
  );
  if (req) setRememberMeCookie(req, res, rememberMe);
  else {
    const sec = secure;
    if (rememberMe) appendSetCookie(res, `${REMEMBER_ME_COOKIE_NAME}=1; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${sec}`);
    else appendSetCookie(res, `${REMEMBER_ME_COOKIE_NAME}=0; Path=/; SameSite=Lax${sec}`);
  }
}

export function clearSessionCookie(reqOrRes, maybeRes) {
  const req = maybeRes ? reqOrRes : null;
  const res = maybeRes ? maybeRes : reqOrRes;
  const secure = req ? (isSecureRequest(req) ? '; Secure' : '') : (process.env.NODE_ENV === 'production' ? '; Secure' : '');
  appendSetCookie(res, `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
  if (req) clearRememberMeCookie(req, res);
  else appendSetCookie(res, `${REMEMBER_ME_COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0${secure}`);
}

export function createLocalSession(db, userId, userAgent = '', { rememberMe = false } = {}) {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashSecret(rawToken);
  const id = crypto.randomUUID();
  const now = new Date();
  const lifetime = rememberMe ? SESSION_MAX_AGE_SECONDS : SESSION_BROWSER_MAX_AGE_SECONDS;
  const expiresAt = new Date(now.getTime() + lifetime * 1000).toISOString();
  db.prepare(
    `INSERT INTO local_sessions (id, user_id, token_hash, user_agent, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, tokenHash, String(userAgent).slice(0, 160), expiresAt, now.toISOString());
  return { rawToken, sessionId: id, expiresAt, rememberMe };
}

function getRequestCookies(req) {
  const cookies = parseCookies(req);
  return Object.keys(cookies).map((name) => ({ name, value: cookies[name] }));
}

function setResponseCookies(req, res, cookiesToSet) {
  const secure = isSecureRequest(req);
  for (const { name, value, options } of cookiesToSet) {
    const opts = { ...(options || {}) };
    if (secure) opts.secure = true;
    if (!opts.sameSite) opts.sameSite = 'lax';
    if (!opts.path) opts.path = '/';
    // For remember-me browser-session mode, Supabase auth cookies should be session cookies.
    // We preserve deletions (maxAge 0).
    const remember = getRememberMeFromRequest(req);
    if (opts.maxAge !== 0 && !remember) {
      delete opts.maxAge;
      delete opts.expires;
    }
    if (opts.maxAge !== 0 && remember && typeof opts.maxAge === 'number') {
      opts.maxAge = Math.min(opts.maxAge, SESSION_MAX_AGE_SECONDS);
    }
    const parts = [`${name}=${encodeURIComponent(value)}`];
    if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
    if (opts.expires) parts.push(`Expires=${new Date(opts.expires).toUTCString()}`);
    parts.push(`Path=${opts.path}`);
    if (opts.domain) parts.push(`Domain=${opts.domain}`);
    parts.push(`SameSite=${typeof opts.sameSite === 'string' ? opts.sameSite.charAt(0).toUpperCase() + opts.sameSite.slice(1) : 'Lax'}`);
    if (opts.secure) parts.push('Secure');
    if (opts.httpOnly) parts.push('HttpOnly');
    appendSetCookie(res, parts.join('; '));
  }
}

export function createSupabaseCookieClient(req, res) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return null;
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return getRequestCookies(req);
      },
      setAll(cookiesToSet) {
        if (res) setResponseCookies(req, res, cookiesToSet);
      },
    },
  });
}

export async function clearSupabaseSession(req, res) {
  const client = createSupabaseCookieClient(req, res);
  if (!client) return;
  try {
    await client.auth.signOut();
  } catch {
    // ignore
  }
}

function preventAuthCache(res) {
  if (!res || typeof res.setHeader !== 'function') return;
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
}

export function enforceSameOrigin(req) {
  const method = String(req.method || 'GET').toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
  const origin = req.headers?.origin;
  if (!origin) {
    // Non-browser or same-origin requests may omit Origin; allow if no cross-site signal.
    const secFetchSite = String(req.headers?.['sec-fetch-site'] || '').toLowerCase();
    if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'same-site' && secFetchSite !== 'none') {
      throw new HttpError(403, 'Cross-origin request rejected.');
    }
    return;
  }
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  if (!host) return;
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim();
  let expected;
  try {
    expected = `${new URL(origin).protocol}//${host}`;
  } catch {
    expected = null;
  }
  const originNorm = origin.replace(/\/$/, '');
  const ok =
    originNorm === `${proto}://${host}` ||
    originNorm === `https://${host}` ||
    originNorm === `http://${host}` ||
    (expected && originNorm === expected);
  if (!ok) {
    throw new HttpError(403, 'Cross-origin request rejected.');
  }
}

function hasSupabaseAuthCookies(req) {
  const cookies = parseCookies(req);
  return Object.keys(cookies).some((n) => n.startsWith('sb-') && n.includes('-auth-token'));
}

async function withAuthTimeout(promise, ms = 4000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('auth_timeout')), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveActor(req, res, { skipMembership = false } = {}) {
  const db = getLocalDb();

  // One verified token/actor per request. Never mix a cookie identity with a
  // different Bearer token when displaying or revoking a session.
  const { url, anonKey } = getSupabaseConfig();
  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  const bearer = authHeader.match(/^Bearer (.+)$/i)?.[1]?.trim();
  const cookieCredentials = hasSupabaseAuthCookies(req);
  if (bearer || cookieCredentials) {
    const service = getServiceClient();
    const verifier = bearer
      ? service || (url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null)
      : createSupabaseCookieClient(req, res);
    if (!verifier) {
      // In local-only mode a Bearer string is not a supported credential.
      if (db && !anonKey && !service) return null;
      throw new HttpError(503, 'Authentication service is unavailable.');
    }
    try {
      let token = bearer;
      if (!token) {
        const sessionResult = await withAuthTimeout(verifier.auth.getSession());
        if (sessionResult.error) throw sessionResult.error;
        token = sessionResult.data?.session?.access_token;
      }
      if (!token) return null;
      const { data, error } = await withAuthTimeout(verifier.auth.getUser(token));
      if (error) throw error;
      if (!data?.user) return null;
      const verifiedUser = {
        id: data.user.id, email: data.user.email || '',
        email_confirmed_at: data.user.email_confirmed_at || null,
        full_name: data.user.user_metadata?.full_name || '',
        role: data.user.app_metadata?.role || 'interpreter',
        app_metadata: data.user.app_metadata || {},
      };
      let membership = null;
      if (service && !skipMembership) {
        const result = await withAuthTimeout(service.from('memberships')
          .select('org_id, role, status').eq('user_id', verifiedUser.id)
          .eq('status', 'active').maybeSingle());
        if (result.error) throw new HttpError(503, 'Membership verification is unavailable.');
        membership = result.data || null;
      }
      preventAuthCache(res);
      return { mode: 'supabase', user: verifiedUser, accessToken: token,
        appRole: verifiedUser.role, membership, supabase: service };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if ([400, 401, 403].includes(error?.status)) return null;
      throw new HttpError(503, 'Authentication verification is unavailable. Please retry.');
    }
  }

  // 3. Local HTTP-only session cookie.
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

  preventAuthCache(res);
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
