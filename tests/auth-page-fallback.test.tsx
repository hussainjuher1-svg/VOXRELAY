// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSignUp = vi.fn();
const mockResend = vi.fn();
const mockSignInWithPassword = vi.fn();

vi.mock('../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  setRememberMePreference: vi.fn(),
  getRememberMePreference: () => false,
  REMEMBER_ME_KEY: 'voxrelay_remember_me',
  supabase: {
    auth: {
      signUp: (...args: unknown[]) => mockSignUp(...args),
      resend: (...args: unknown[]) => mockResend(...args),
      signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
    },
  },
}));

import { AuthProvider } from '../src/context/AuthContext';
import { LocaleProvider } from '../src/context/LocaleContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { LoginPage } from '../src/pages/Auth';

function renderLogin(initialPath = '/login?mode=signup') {
  return render(
    <ThemeProvider>
      <LocaleProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <LoginPage />
          </MemoryRouter>
        </AuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

function clickCreateAccountSubmit() {
  const submitBtn = screen
    .getAllByRole('button', { name: /create account/i })
    .find((btn) => (btn as HTMLButtonElement).type === 'submit');
  if (!submitBtn) throw new Error('Submit button not found');
  fireEvent.click(submitBtn);
}

describe('Auth.tsx frontend fail-closed behavior against /api/auth rate limits & 5xx responses', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    mockResend.mockReset();
    mockSignInWithPassword.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not fall back to supabase.auth.signUp() when /api/auth returns 503 (e.g. rate-limit DB unavailable)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify({ authenticated: false, user: null, sessions: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'Rate limit verification unavailable. Try again shortly.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    renderLogin('/login?mode=signup');
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'interp@clinic.org' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'ValidStrongPassword123!' } });
    clickCreateAccountSubmit();

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/rate limit verification unavailable/i);
    });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('does not fall back to supabase.auth.signUp() or supabase.auth.resend() when /api/auth returns 429', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify({ authenticated: false, user: null, sessions: [] }), { status: 200 });
      }
      const body = JSON.parse(String(init.body || '{}'));
      if (body.action === 'signup' && callCount === 0) {
        callCount++;
        return new Response(JSON.stringify({ error: 'Too many signup attempts. Please retry later.' }), { status: 429 });
      }
      if (body.action === 'signup') {
        return new Response(
          JSON.stringify({ ok: true, requiresConfirmation: true, confirmationEmailSent: true }),
          { status: 201 }
        );
      }
      if (body.action === 'resend_confirmation') {
        return new Response(JSON.stringify({ error: 'Too many confirmation requests.' }), { status: 429 });
      }
      return new Response('{}', { status: 500 });
    });

    renderLogin('/login?mode=signup');
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'ratelimited@clinic.org' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'ValidStrongPassword123!' } });
    clickCreateAccountSubmit();

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/too many signup attempts/i);
    });
    expect(mockSignUp).not.toHaveBeenCalled();

    // Now simulate successful signup showing the resend button, then 429 on resend
    clickCreateAccountSubmit();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resend confirmation email/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /resend confirmation email/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/too many confirmation requests/i);
    });
    expect(mockResend).not.toHaveBeenCalled();
  });

  it('does not fall back to supabase.auth.resend() when /api/auth resend_confirmation returns 503', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify({ authenticated: false, user: null, sessions: [] }), { status: 200 });
      }
      const body = JSON.parse(String(init.body || '{}'));
      if (body.action === 'signup') {
        return new Response(
          JSON.stringify({
            ok: true,
            requiresConfirmation: true,
            confirmationEmailSent: false,
            confirmationWarning: 'Account created, but confirmation email could not be sent yet.',
          }),
          { status: 201 }
        );
      }
      if (body.action === 'resend_confirmation') {
        return new Response(JSON.stringify({ error: 'Authentication service is not configured.' }), { status: 503 });
      }
      return new Response('{}', { status: 500 });
    });

    renderLogin('/login?mode=signup');
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'resend503@clinic.org' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'ValidStrongPassword123!' } });
    clickCreateAccountSubmit();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resend confirmation email/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /resend confirmation email/i }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/authentication service is not configured/i);
    });
    expect(mockResend).not.toHaveBeenCalled();
  });

  it('completes normal signup and confirmation resend cleanly through /api/auth', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (!init?.method || init.method === 'GET') {
        return new Response(JSON.stringify({ authenticated: false, user: null, sessions: [] }), { status: 200 });
      }
      const body = JSON.parse(String(init.body || '{}'));
      if (body.action === 'signup') {
        return new Response(
          JSON.stringify({ ok: true, requiresConfirmation: true, confirmationEmailSent: true }),
          { status: 201 }
        );
      }
      if (body.action === 'resend_confirmation') {
        return new Response(
          JSON.stringify({ ok: true, confirmationEmailSent: true }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 500 });
    });

    renderLogin('/login?mode=signup');
    fireEvent.change(screen.getByLabelText(/work email/i), { target: { value: 'normal.user@clinic.org' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'ValidStrongPassword123!' } });
    clickCreateAccountSubmit();

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/check your inbox to confirm your email/i);
    });
    const resendBtn = screen.getByRole('button', { name: /resend confirmation email/i });
    fireEvent.click(resendBtn);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/confirmation link re-sent to normal\.user@clinic\.org/i);
    });
    expect(mockSignUp).not.toHaveBeenCalled();
    expect(mockResend).not.toHaveBeenCalled();
  });
});
