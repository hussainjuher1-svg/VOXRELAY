import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), cookie: vi.fn() }));
vi.mock('../api/_lib/supabase.js', () => ({ getServiceClient: () => ({ auth: { admin: { signOut: mocks.signOut } } }) }));
vi.mock('../api/_lib/auth-session.js', () => ({
  createSupabaseCookieClient: () => mocks.cookie(),
  parseCookies: () => ({ 'sb-project-auth-token.0': 'secret' }),
}));
import { currentSupabaseSession, revokeSupabaseSessions } from '../api/_lib/supabase-sessions.js';
const token = `header.${Buffer.from(JSON.stringify({ sub: 'user-1', session_id: 'session-1', exp: 2000000000, iat: 1800000000 })).toString('base64url')}.signature`;
const actor = { user: { id: 'user-1' }, accessToken: token };
const req = { headers: { authorization: `Bearer ${token}` } };
let res;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookie.mockReturnValue(null);
  mocks.signOut.mockResolvedValue({ error: null });
  res = { getHeader: () => undefined, setHeader: vi.fn() };
});
describe('verified serverless session revocation', () => {
  it('exposes only the verified current session identity', async () => {
    expect((await currentSupabaseSession(req, res, actor)).id).toBe('session-1');
    expect(await currentSupabaseSession(req, res, { user: { id: 'other' } })).toBeNull();
  });
  it.each([['signout', 'local'], ['revoke_session', 'local'], ['revoke_all', 'global']])('%s uses explicit %s provider scope', async (action, scope) => {
    await revokeSupabaseSessions(req, res, actor, action, 'session-1');
    expect(mocks.signOut).toHaveBeenCalledWith(token, scope);
    expect(res.setHeader).toHaveBeenCalled();
  });
  it('does not pretend to revoke an arbitrary remote session', async () => {
    await expect(revokeSupabaseSessions(req, res, actor, 'revoke_session', 'other')).rejects.toMatchObject({ status: 501 });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it('propagates provider failures and retains cookies for retry', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('offline') });
    await expect(revokeSupabaseSessions(req, res, actor, 'signout')).rejects.toThrow('revocation failed');
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});

// The session helper must consume the already-verified token, never re-read a
// conflicting/unverified authorization header.
it('binds metadata to the exact verified actor token', async () => {
  const result = await currentSupabaseSession({ headers: { authorization: 'Bearer forged' } }, res, actor);
  expect(result.id).toBe('session-1');
  expect(result.token).toBe(token);
  expect(await currentSupabaseSession(req, res, { user: actor.user })).toBeNull();
});
