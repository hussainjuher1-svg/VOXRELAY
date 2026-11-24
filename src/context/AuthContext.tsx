import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import { AuthContext, type AuthUser } from './hooks';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [localUser, setLocalUser] = useState<AuthUser | null>(null);
  const [initialized, setInitialized] = useState(false);

  const checkLocalAuth = useCallback(async () => {
    try {
      if (typeof window === 'undefined' || typeof fetch !== 'function') return;
      if (window.location.origin === 'null') return;
      const res = await fetch('/api/auth', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      setLocalUser(data?.authenticated && data?.user ? data.user : null);
    } catch {
      // Ignore in test/static contexts
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);
    }
    await checkLocalAuth();
  }, [checkLocalAuth]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(async () => {
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (active) setSession(data.session ?? null);
      }
      await checkLocalAuth();
      if (active) setInitialized(true);
    });

    const subscription = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession ?? null);
      setInitialized(true);
    });

    const onFocus = () => {
      if (active) void refreshSession();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      active = false;
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
        refreshSession,
        signOut: async () => {
          if (supabase) await supabase.auth.signOut();
          try {
            await fetch('/api/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'signout' }),
            });
          } catch {
            // ignore
          }
          setLocalUser(null);
          setSession(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
