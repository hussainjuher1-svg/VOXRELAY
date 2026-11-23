import { sendJson } from './_lib/core.js';
import { getLocalDb } from './_lib/local-db.js';
import { checkPublicAccessLock, getServiceClient } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }
  const service = Boolean(getServiceClient());
  const localDb = Boolean(getLocalDb());
  const publicLock = await checkPublicAccessLock();

  return sendJson(res, 200, {
    ok: true,
    apiConfigured: service || localDb,
    storageMode: service ? 'supabase' : localDb ? 'sqlite-local' : 'unconfigured',
    publicKeyConfigured: publicLock.configured,
    directDatabaseAccess: publicLock.locked === null ? (localDb ? 'locked' : 'unknown') : publicLock.locked ? 'locked' : 'open',
    aiProviderEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
    assistantGroundedKb: true,
    checkedAt: new Date().toISOString(),
  });
}
