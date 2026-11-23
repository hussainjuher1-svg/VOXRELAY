import { sendJson } from './_lib/core.js';
import { getLocalDb } from './_lib/local-db.js';
import { getServiceClient } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }
  const supabase = getServiceClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('profiles').select('user_id').limit(1);
      if (!error) {
        return sendJson(res, 200, { ok: true, service: 'voxrelay-api', db: 'supabase' });
      }
    } catch {
      // fall through to local sqlite check
    }
  }

  const db = getLocalDb();
  if (db) {
    db.prepare('SELECT 1').get();
    return sendJson(res, 200, { ok: true, service: 'voxrelay-api', db: 'sqlite-local' });
  }

  return sendJson(res, 503, {
    ok: false,
    service: 'voxrelay-api',
    error: 'Database environment variables are not configured.',
  });
}
