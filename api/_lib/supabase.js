import { createClient } from '@supabase/supabase-js';
import { HttpError } from './authz.js';

export function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
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

export async function authenticateRequest(req) {
  const supabase = getServiceClient();
  if (!supabase) {
    throw new HttpError(503, 'Supabase service-role environment variables are not configured.');
  }

  const authHeader = req.headers?.authorization || req.headers?.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    throw new HttpError(401, 'Sign in required.');
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    throw new HttpError(401, 'Invalid or expired session.');
  }

  if (!data.user.email_confirmed_at) {
    throw new HttpError(403, 'Verify your email address before accessing the workspace.');
  }

  const { data: membership } = await supabase
    .from('memberships')
    .select('org_id, role, status')
    .eq('user_id', data.user.id)
    .eq('status', 'active')
    .maybeSingle();

  return {
    supabase,
    userId: data.user.id,
    email: data.user.email || '',
    appRole: data.user.app_metadata?.role || 'interpreter',
    membership: membership || null,
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
  // If anon key query returns a permissions/RLS error, public access is locked.
  return {
    configured: true,
    locked: Boolean(error),
  };
}
