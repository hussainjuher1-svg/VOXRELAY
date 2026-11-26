/** Never use the application's DATABASE_URL for tests. Validate before connecting. */
export function disposableDatabaseUrl(env = process.env) {
  if (env.DATABASE_URL) throw new Error('Refusing application DATABASE_URL in migration tests. Unset it; use isolated PGlite or an explicitly disposable local test database.');
  const raw = env.VOXRELAY_TEST_DATABASE_URL;
  if (!raw) return null;
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid disposable test database URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.pathname !== '/voxrelay_test' || url.search || url.hash ||
      env.VOXRELAY_ALLOW_DISPOSABLE_DB !== 'voxrelay_test') {
    throw new Error('Refusing non-disposable database target. Only explicit loopback voxrelay_test without URL options is allowed.');
  }
  return raw;
}
