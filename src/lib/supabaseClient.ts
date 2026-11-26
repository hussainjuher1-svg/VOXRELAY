import { createBrowserClient } from '@supabase/ssr';
import { parse, serialize } from 'cookie';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const REMEMBER_ME_KEY = 'voxrelay_remember_me';
export const REMEMBER_ME_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function getRememberMePreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(REMEMBER_ME_KEY) === '1';
  } catch {
    return false;
  }
}

export function setRememberMePreference(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(REMEMBER_ME_KEY, '1');
    else window.localStorage.removeItem(REMEMBER_ME_KEY);
  } catch {
    // ignore
  }
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    if (value) {
      document.cookie = `voxrelay_remember_me=1; Path=/; SameSite=Lax; Max-Age=${REMEMBER_ME_MAX_AGE_SECONDS}${secure}`;
    } else {
      // Browser-session cookie so it clears when browser closes.
      document.cookie = `voxrelay_remember_me=0; Path=/; SameSite=Lax${secure}`;
    }
  } catch {
    // ignore
  }
}

function applyRememberMeCookieOptions(options?: Record<string, unknown>) {
  const next = { ...(options || {}) };
  const remember = getRememberMePreference();
  if (next.maxAge === 0) return next; // deletion
  if (remember) {
    next.maxAge = Math.min(Number(next.maxAge || REMEMBER_ME_MAX_AGE_SECONDS), REMEMBER_ME_MAX_AGE_SECONDS);
    delete next.expires;
  } else {
    // Browser-session cookie: remove persistent lifetime.
    delete next.maxAge;
    delete next.expires;
  }
  return next;
}

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createBrowserClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll() {
            if (typeof document === 'undefined') return [];
            const parsed = parse(document.cookie || '');
            return Object.keys(parsed).map((name) => ({ name, value: parsed[name] ?? '' }));
          },
          setAll(cookiesToSet) {
            if (typeof document === 'undefined') return;
            cookiesToSet.forEach(({ name, value, options }) => {
              const nextOptions = applyRememberMeCookieOptions(options as Record<string, unknown>);
              document.cookie = serialize(name, value, nextOptions as Parameters<typeof serialize>[2]);
            });
          },
        },
        cookieOptions: {
          // Supabase browser-managed cookies are JS-readable by @supabase/ssr design (not HttpOnly).
          // Server-owned opaque local session cookie remains HttpOnly.
          sameSite: 'lax',
          secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
          path: '/',
        },
      })
    : null;
