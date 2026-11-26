import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { Locale } from '../lib/i18n';

export interface AuthUser {
  id: string;
  email: string;
  full_name?: string;
  role?: string;
}

export interface AuthContextValue {
  configured: boolean;
  session: Session | null;
  user: User | AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  completeSignIn: (user: User | AuthUser, session?: Session | null) => void;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export interface LocaleContextValue {
  locale: Locale;
  rtl: boolean;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
  tr: (key: string, vars?: Record<string, string | number>) => string;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used inside LocaleProvider');
  return ctx;
}

export type ThemeMode = 'light' | 'dark';

export interface ThemeContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (next: ThemeMode) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
