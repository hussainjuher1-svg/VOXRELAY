import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxrelay-cookie-test-'));
const tempDbPath = path.join(tempDir, 'voxrelay-cookie.sqlite');

function createMockReq({ method = 'GET', url = '/', headers = {}, body = undefined, ip = '127.0.0.1' } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { ...headers };
  req.query = {};
  req.socket = { remoteAddress: ip };
  if (body !== undefined) req.body = body;
  return req;
}

function createMockRes() {
  const headers = {};
  let rawBody = '';
  return {
    statusCode: 200,
    headers,
    setHeader(key, val) { headers[String(key).toLowerCase()] = val; },
    getHeader(key) { return headers[String(key).toLowerCase()]; },
    write(chunk) { rawBody += String(chunk); },
    end(chunk = '') { rawBody += String(chunk); },
    json() { return rawBody ? JSON.parse(rawBody) : null; },
    text() { return rawBody; },
  };
}

function getSetCookies(res) {
  const raw = res.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [String(raw)];
}

function cookieHeaderFromRes(res) {
  return getSetCookies(res)
    .map((c) => String(c).split(';')[0])
    .join('; ');
}

describe('Cookie auth, Remember Me, and cookie management', () => {
  let authHandler;
  let adminHandler;
  let getLocalDb;

  beforeAll(async () => {
    process.env.VOXRELAY_LOCAL_DB = tempDbPath;
    process.env.NODE_ENV = 'test';
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VERCEL;

    authHandler = (await import('../api/auth.js')).default;
    adminHandler = (await import('../api/admin.js')).default;
    ({ getLocalDb } = await import('../api/_lib/local-db.js'));
  });

  afterAll(() => {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('local signin with rememberMe=false sets browser-session cookies (no Max-Age on session)', async () => {
    const signupRes = createMockRes();
    await authHandler(createMockReq({
      method: 'POST', url: '/api/auth',
      body: { action: 'signup', email: 'remember-off@vox.test', password: 'CorrectHorseBatteryStaple1!', fullName: 'Off', rememberMe: false },
    }), signupRes);
    expect(signupRes.statusCode).toBe(201);
    const cookies = getSetCookies(signupRes);
    const session = cookies.find((c) => String(c).startsWith('voxrelay_session='));
    const remember = cookies.find((c) => String(c).startsWith('voxrelay_remember_me='));
    expect(session).toBeTruthy();
    expect(String(session)).not.toMatch(/Max-Age=2592000/i);
    expect(String(session)).toMatch(/HttpOnly/i);
    expect(String(session)).toMatch(/SameSite=Lax/i);
    expect(String(remember)).toMatch(/voxrelay_remember_me=0/);
  });

  it('local signin with rememberMe=true sets persistent 30-day cookies', async () => {
    const signupRes = createMockRes();
    await authHandler(createMockReq({
      method: 'POST', url: '/api/auth',
      body: { action: 'signup', email: 'remember-on@vox.test', password: 'CorrectHorseBatteryStaple1!', fullName: 'On', rememberMe: true },
    }), signupRes);
    expect(signupRes.statusCode).toBe(201);
    const cookies = getSetCookies(signupRes);
    const session = cookies.find((c) => String(c).startsWith('voxrelay_session='));
    const remember = cookies.find((c) => String(c).startsWith('voxrelay_remember_me='));
    expect(String(session)).toMatch(/Max-Age=2592000/);
    expect(String(remember)).toMatch(/voxrelay_remember_me=1/);
    expect(String(remember)).toMatch(/Max-Age=2592000/);
  });

  it('reload/restore: GET /api/auth with session cookie returns authenticated user', async () => {
    const signinRes = createMockRes();
    await authHandler(createMockReq({
      method: 'POST', url: '/api/auth',
      body: { action: 'signin', email: 'remember-on@vox.test', password: 'CorrectHorseBatteryStaple1!', rememberMe: true },
    }), signinRes);
    expect(signinRes.statusCode).toBe(200);
    const cookie = cookieHeaderFromRes(signinRes);
    const getRes = createMockRes();
    await authHandler(createMockReq({ method: 'GET', url: '/api/auth', headers: { cookie } }), getRes);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().authenticated).toBe(true);
    expect(getRes.json().user.email).toBe('remember-on@vox.test');
    expect(getRes.json().rememberMe).toBe(true);
  });

  it('invalid and expired session cookies are rejected', async () => {
    const badRes = createMockRes();
    await authHandler(createMockReq({ method: 'GET', url: '/api/auth', headers: { cookie: 'voxrelay_session=bogus' } }), badRes);
    expect(badRes.json().authenticated).toBe(false);

    // expire a real session
    const signinRes = createMockRes();
    await authHandler(createMockReq({
      method: 'POST', url: '/api/auth',
      body: { action: 'signin', email: 'remember-off@vox.test', password: 'CorrectHorseBatteryStaple1!', rememberMe: false },
    }), signinRes);
    const cookie = cookieHeaderFromRes(signinRes);
    const db = getLocalDb();
    db.prepare("UPDATE local_sessions SET expires_at = '2000-01-01T00:00:00.000Z' WHERE user_id = (SELECT id FROM local_users WHERE email = ?)").run('remember-off@vox.test');
    const getRes = createMockRes();
    await authHandler(createMockReq({ method: 'GET', url: '/api/auth', headers: { cookie } }), getRes);
    expect(getRes.json().authenticated).toBe(false);
  });

  it('signout clears auth cookies and session is no longer accepted', async () => {
    const signinRes = createMockRes();
    await authHandler(createMockReq({
      method: 'POST', url: '/api/auth',
      body: { action: 'signin', email: 'remember-on@vox.test', password: 'CorrectHorseBatteryStaple1!', rememberMe: true },
    }), signinRes);
    const cookie = cookieHeaderFromRes(signinRes);
    const outRes = createMockRes();
    await authHandler(createMockReq({ method: 'POST', url: '/api/auth', headers: { cookie }, body: { action: 'signout' } }), outRes);
    expect(outRes.statusCode).toBe(200);
    const cleared = getSetCookies(outRes).join('\n');
    expect(cleared).toMatch(/voxrelay_session=;/);
    expect(cleared).toMatch(/Max-Age=0/);

    const after = createMockRes();
    await authHandler(createMockReq({ method: 'GET', url: '/api/auth', headers: { cookie } }), after);
    expect(after.json().authenticated).toBe(false);
  });

  it('rejects cross-origin mutating cookie-authenticated requests', async () => {
    const res = createMockRes();
    await authHandler(createMockReq({
      method: 'POST', url: '/api/auth',
      headers: { origin: 'https://evil.example', host: 'voxrelay.test' },
      body: { action: 'signin', email: 'remember-on@vox.test', password: 'CorrectHorseBatteryStaple1!' },
    }), res);
    expect(res.statusCode).toBe(403);
  });

  it('cookie-based server authorization preserves role isolation', async () => {
    const signinRes = createMockRes();
    await authHandler(createMockReq({
      method: 'POST', url: '/api/auth',
      body: { action: 'signin', email: 'remember-off@vox.test', password: 'CorrectHorseBatteryStaple1!', rememberMe: false },
    }), signinRes);
    const cookie = cookieHeaderFromRes(signinRes);
    const adminRes = createMockRes();
    await adminHandler(createMockReq({ method: 'GET', url: '/api/admin?resource=audit_events', headers: { cookie } }), adminRes);
    expect(adminRes.statusCode).toBe(403);
  });

  it('revoke_all clears sessions and cookies; revoke_session removes specific session', async () => {
    const s1 = createMockRes();
    await authHandler(createMockReq({
      method: 'POST', url: '/api/auth',
      body: { action: 'signin', email: 'remember-on@vox.test', password: 'CorrectHorseBatteryStaple1!', rememberMe: true },
    }), s1);
    const cookie = cookieHeaderFromRes(s1);
    // list sessions
    const list = createMockRes();
    await authHandler(createMockReq({ method: 'GET', url: '/api/auth', headers: { cookie } }), list);
    const sessions = list.json().sessions;
    expect(sessions.length).toBeGreaterThan(0);
    const target = sessions.find((s) => !s.isCurrent) || sessions[0];
    // revoke specific
    const rev = createMockRes();
    await authHandler(createMockReq({ method: 'POST', url: '/api/auth', headers: { cookie }, body: { action: 'revoke_session', sessionId: target.id } }), rev);
    expect(rev.statusCode).toBe(200);

    // revoke all
    const ra = createMockRes();
    await authHandler(createMockReq({ method: 'POST', url: '/api/auth', headers: { cookie }, body: { action: 'revoke_all' } }), ra);
    expect(ra.statusCode).toBe(200);
    expect(getSetCookies(ra).join('\n')).toMatch(/voxrelay_session=;/);
  });
});
