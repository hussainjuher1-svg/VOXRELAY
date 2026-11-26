import { createClient } from '@supabase/supabase-js';
import { HttpError } from './authz.js';

export function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  return { url, serviceKey, anonKey };
}

export function getServiceClient() {
  const { url, serviceKey } = getSupabaseConfig();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'voxrelay' },
  });
}

export async function authenticateRequest(req, res, verifiedActor) {
  const { resolveActor } = await import('./auth-session.js');
  const actor = verifiedActor === undefined ? await resolveActor(req, res) : verifiedActor;
  if (!actor || actor.mode !== 'supabase') throw new HttpError(401, 'Sign in required.');
  if (!actor.supabase) throw new HttpError(503, 'Supabase service-role environment variables are not configured.');
  if (!actor.user.email_confirmed_at) throw new HttpError(403, 'Verify your email address before accessing the workspace.');
  return {
    supabase: actor.supabase, userId: actor.user.id, email: actor.user.email,
    appRole: actor.appRole, membership: actor.membership,
  };
}

export async function checkPublicAccessLock() {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) return { configured: false, locked: null };

  const anon = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'voxrelay' },
  });
  const { error } = await anon.from('assignments').select('id').limit(1);
  // Only explicit PostgreSQL permission denial establishes this probe result.
  // Schema exclusion, network and credential failures are not proof of lockdown.
  return {
    configured: true,
    locked: error ? (error.code === '42501' ? true : null) : false,
    reason: error ? (error.code === '42501' ? 'permission_denied' : 'probe_unavailable') : 'query_allowed',
  };
}
