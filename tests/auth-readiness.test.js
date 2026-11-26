import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ error: null }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({ select: () => ({ limit: async () => ({ error: state.error }) }) }) }) }));
import { authenticateRequest, checkPublicAccessLock } from '../api/_lib/supabase.js';
afterEach(() => vi.unstubAllEnvs());
it.each([['42501',true],['PGRST106',null],['NETWORK_ERROR',null],[null,false]])('classifies %s without faking a successful lock check',async (code,locked) => {
  vi.stubEnv('SUPABASE_URL','http://127.0.0.1:1'); vi.stubEnv('SUPABASE_ANON_KEY','synthetic');
  state.error = code ? { code } : null;
  expect((await checkPublicAccessLock()).locked).toBe(locked);
});
it('requires confirmation identically for a verified cookie or Bearer actor', async () => {
  await expect(authenticateRequest({headers:{}}, {}, {mode:'supabase',supabase:{},user:{id:'synthetic',email_confirmed_at:null}})).rejects.toMatchObject({status:403});
});
