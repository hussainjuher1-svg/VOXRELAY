import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { AuthContext, type AuthUser } from './hooks';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [localUser, setLocalUser] = useState<AuthUser | null>(null);
  const [initialized, setInitialized] = useState(false);
  const authRequest = useRef(0);

  const checkLocalAuth = useCallback(async () => {
    const request = ++authRequest.current;
    try {
      if (typeof window === 'undefined' || typeof fetch !== 'function') return;
      if (window.location.origin === 'null') return;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? window.setTimeout(() => controller.abort(), 8000) : null;
      let res: Response;
      try {
        res = await fetch('/api/auth', {
          credentials: 'include',
          signal: controller?.signal,
          headers: { 'Cache-Control': 'no-cache' },
        });
      } finally {
        if (timer !== null) window.clearTimeout(timer);
      }
      if (!res.ok) return;
      const data = await res.json();
      if (request !== authRequest.current) return;
      setLocalUser(data?.authenticated && data?.user ? data.user : null);
    } catch {
      // Ignore in test/static contexts; do not block app initialization.
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        setSession(data.session ?? null);
      }
    } finally {
      await checkLocalAuth();
    }
  }, [checkLocalAuth]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      if (supabase) {
        // One-time migration: move legacy localStorage Supabase session to cookie-based storage.
        // We only migrate if no cookie session exists and a legacy key is present.
        try {
          const { data: cookieSession } = await supabase.auth.getSession();
          if (!cookieSession.session && typeof window !== 'undefined') {
            const legacyKeys = Object.keys(window.localStorage).filter(
              (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
            );
            for (const key of legacyKeys) {
              const raw = window.localStorage.getItem(key);
              if (!raw) continue;
              try {
                const parsed = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
                if (parsed?.access_token && parsed?.refresh_token) {
                  const { data: migrated, error } = await supabase.auth.setSession({
                    access_token: parsed.access_token,
                    refresh_token: parsed.refresh_token,
                  });
                  if (!error && migrated.session) {
                    window.localStorage.removeItem(key);
                    if (active) setSession(migrated.session);
                  }
                } else {
                  // Invalid/untrusted shape - remove obsolete storage, require normal sign-in.
                  window.localStorage.removeItem(key);
                }
              } catch {
                window.localStorage.removeItem(key);
              }
            }
          }
        } catch {
          // Migration is best-effort; user can sign in normally.
        }
        try {
          const { data } = await supabase.auth.getSession();
          if (active) setSession(data.session ?? null);
        } catch {
          // A provider failure must not prevent cookie-session initialization.
        }
      }
      await checkLocalAuth();
      if (active) setInitialized(true);
    });

    const subscription = supabase?.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession ?? null);
      if (event === 'SIGNED_OUT') setLocalUser(null);
      // Cookie auth may still be resolving when Supabase emits INITIAL_SESSION.
      if (nextSession) setInitialized(true);
    });

    const onFocus = () => {
      if (active) void refreshSession();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
      authRequest.current += 1;
      subscription?.data.subscription.unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, [checkLocalAuth, refreshSession]);

  return (
    <AuthContext.Provider
      value={{
        configured: isSupabaseConfigured,
        session,
        user: session?.user ?? localUser,
        loading: !initialized,
        isAuthenticated: Boolean(session?.user || localUser),
        completeSignIn: (user, nextSession = null) => {
          // Commit the identity returned by the successful auth exchange, not a
          // second request that can race initialization or transient failures.
          authRequest.current += 1;
          setLocalUser(user as AuthUser);
          setSession(nextSession);
          setInitialized(true);
        },
        refreshSession,
        signOut: async () => {
          authRequest.current += 1;
          const response = await fetch('/api/auth', {
            credentials: 'include', method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'signout' }),
          });
          if (!response.ok) throw new Error('Sign out failed. Please retry.');
          // Clear provider memory/storage only after the server has revoked the
          // session using the cookies it still needs to verify the request.
          if (supabase) await supabase.auth.signOut({ scope: 'local' });
          setLocalUser(null);
          setSession(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
