import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ revoke: vi.fn() }));
vi.mock('../api/_lib/local-db.js', async (original) => ({ ...(await original()), getLocalDb: () => null }));
vi.mock('../api/_lib/auth-session.js', async (original) => ({ ...(await original()), resolveActor: async () => ({ mode: 'supabase', user: { id: 'user-1' } }) }));
vi.mock('../api/_lib/supabase-sessions.js', () => ({ currentSupabaseSession: async () => null, expireSupabaseCookies: vi.fn(), revokeSupabaseSessions: mocks.revoke }));
import handler from '../api/auth.js';

function request(action) {
  const req = {};
  req.method = 'POST';
  req.headers = { host: 'localhost', origin: 'http://localhost' };
  req.body = { action, sessionId: 'session-1' };
  return req;
}
function response() {
  return { statusCode: 200, setHeader: vi.fn(), getHeader: () => undefined, end(body) { this.body = JSON.parse(body); } };
}
beforeEach(() => { mocks.revoke.mockReset(); mocks.revoke.mockResolvedValue(undefined); });
describe('serverless auth routing without SQLite', () => {
  it.each(['signout', 'revoke_session', 'revoke_all'])('%s reaches provider revocation before no-database fallback', async (action) => {
    const res = response();
    await handler(request(action), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mocks.revoke).toHaveBeenCalled();
  });
});
