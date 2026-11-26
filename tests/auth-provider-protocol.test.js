// Integration of real Supabase JS/SSR + application handlers over loopback HTTP.
// The provider here is a synthetic protocol simulator, NOT GoTrue. No production
// URL, key, account or session is used. This cannot certify GoTrue behavior.
import http from 'node:http';
import crypto from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { resolveActor } from '../api/_lib/auth-session.js';
import { authenticateRequest } from '../api/_lib/supabase.js';
import { currentSupabaseSession, revokeSupabaseSessions } from '../api/_lib/supabase-sessions.js';
import handler from '../api/auth.js';

const sessions = new Map();
const refreshTokens = new Map();
let server, origin, unavailable = false;
const userA = '00000000-0000-4000-8000-000000000001';
const userC = '00000000-0000-4000-8000-000000000003';
function token(user, sid, seconds = 3600) {
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: user, session_id: sid, role: 'authenticated', aud: 'authenticated', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + seconds })).toString('base64url');
  const input = `${head}.${body}`;
  return `${input}.${crypto.createHmac('sha256','isolated-test-only-key').update(input).digest('base64url')}`;
}
function mint(user, seconds = 3600) {
  const id = crypto.randomUUID();
  sessions.set(id, user);
  const refresh = crypto.randomUUID();
  refreshTokens.set(refresh, id);
  return { access_token: token(user,id,seconds), refresh_token: refresh, expires_in: seconds, expires_at: Math.floor(Date.now()/1000)+seconds, token_type: 'bearer', user: { id: user, email: `${user}@example.test`, email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { role: 'interpreter' }, user_metadata: {} } };
}
function response() {
  const headers = {};
  return { statusCode: 200, headers, setHeader(k,v) { headers[k.toLowerCase()] = v; }, getHeader(k) { return headers[k.toLowerCase()]; }, end(body) { this.body = JSON.parse(body); } };
}
function request(session) { return { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` } }; }
function claims(raw) {
  try {
    const [h,b,s] = raw.split('.');
    if (crypto.createHmac('sha256','isolated-test-only-key').update(`${h}.${b}`).digest('base64url') !== s) return null;
    const p = JSON.parse(Buffer.from(b,'base64url'));
    return p.exp > Date.now()/1000 && sessions.get(p.session_id) === p.sub ? p : null;
  } catch { return null; }
}
beforeAll(async () => {
  server = http.createServer(async (req,res) => {
    res.setHeader('Content-Type','application/json');
    const fail = (status,message) => { res.statusCode=status; res.end(JSON.stringify({ msg: message, code: status === 503 ? 'unexpected_failure' : 'session_not_found' })); };
    if (unavailable) return fail(503,'isolated service unavailable');
    if (req.url.startsWith('/rest/v1/memberships')) return res.end('[]');
    if (req.url.startsWith('/auth/v1/token')) {
      let body=''; for await (const chunk of req) body+=chunk;
      const refresh=JSON.parse(body).refresh_token;
      const sid=refreshTokens.get(refresh), user=sessions.get(sid);
      if (!user) return fail(400,'invalid refresh token');
      refreshTokens.delete(refresh);
      const next=crypto.randomUUID(); refreshTokens.set(next,sid);
      return res.end(JSON.stringify({ access_token:token(user,sid), refresh_token:next, expires_in:3600, token_type:'bearer', user:{id:user,email:'synthetic@example.test',email_confirmed_at:'2026-01-01',app_metadata:{},user_metadata:{}} }));
    }
    const p = claims((req.headers.authorization || '').replace(/^Bearer /,''));
    if (!p) return fail(403,'missing, expired or revoked synthetic session');
    if (req.url.startsWith('/auth/v1/user')) return res.end(JSON.stringify({ id:p.sub,email:'synthetic@example.test',email_confirmed_at:'2026-01-01',app_metadata:{role:'interpreter'},user_metadata:{} }));
    if (req.url.startsWith('/auth/v1/logout')) {
      const global = new URL(req.url,origin).searchParams.get('scope') === 'global';
      for (const [sid,user] of sessions) if (global ? user === p.sub : sid === p.session_id) sessions.delete(sid);
      res.statusCode=204; return res.end();
    }
    return fail(404,'unhandled synthetic route');
  });
  await new Promise((resolve) => server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${server.address().port}`;
  vi.stubEnv('VERCEL','1');
  vi.stubEnv('SUPABASE_URL',origin);
  vi.stubEnv('SUPABASE_ANON_KEY','synthetic-anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','synthetic-server-key');
});
beforeEach(() => { sessions.clear(); refreshTokens.clear(); unavailable=false; });
afterAll(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); vi.unstubAllEnvs(); });

it('local logout revokes only A, global revoke removes A/B but not user C; old access and refresh are denied', async () => {
  const a=mint(userA), b=mint(userA), c=mint(userC);
  const actor=await resolveActor(request(a),response());
  await revokeSupabaseSessions(request(a),response(),actor,'signout');
  expect(await resolveActor(request(a),response())).toBeNull();
  expect((await resolveActor(request(b),response())).user.id).toBe(userA);
  const r=await fetch(`${origin}/auth/v1/token?grant_type=refresh_token`,{method:'POST',body:JSON.stringify({refresh_token:a.refresh_token})});
  expect(r.status).toBe(400);
  const actorB=await resolveActor(request(b),response());
  await revokeSupabaseSessions(request(b),response(),actorB,'revoke_all');
  expect(await resolveActor(request(b),response())).toBeNull();
  expect((await resolveActor(request(c),response())).user.id).toBe(userC);
  await expect(authenticateRequest(request(a),response())).rejects.toMatchObject({status:401});
});

it('rejects expired Bearer credentials and refuses cookie/Bearer identity mixing', async () => {
  const expired=mint(userA,-100), valid=mint(userC);
  expect(await resolveActor(request(expired),response())).toBeNull();
  const actor=await resolveActor(request(valid),response());
  const meta=await currentSupabaseSession(request(expired),response(),actor);
  expect(meta.token).toBe(valid.access_token);
});

it('verifies cookie-only requests through the same authorization path', async () => {
  const a=mint(userA);
  const encoded=Buffer.from(JSON.stringify(a)).toString('base64url');
  const req={method:'GET',headers:{cookie:`sb-127-auth-token=base64-${encoded}`}};
  const actor=await resolveActor(req,response());
  expect(actor.user.id).toBe(userA);
  expect((await authenticateRequest(req,response(),actor)).userId).toBe(userA);
});

it('refreshes an expired cookie session with the real SSR client and rotates the simulated refresh token', async () => {
  const a=mint(userA,-100);
  const req={method:'GET',headers:{cookie:`sb-127-auth-token=base64-${Buffer.from(JSON.stringify(a)).toString('base64url')}`}};
  const res=response();
  expect((await resolveActor(req,res)).user.id).toBe(userA);
  expect(refreshTokens.has(a.refresh_token)).toBe(false);
  expect(res.headers['set-cookie']).toBeTruthy();
});

it('returns a retryable error, not false logout success, on provider failure', async () => {
  const a=mint(userA);
  unavailable=true;
  const req={...request(a),body:{action:'signout'}};
  const res=response();
  await handler(req,res);
  expect(res.statusCode).toBe(503);
  expect(sessions.size).toBe(1);
  expect(res.headers['set-cookie']).toBeUndefined();
});
