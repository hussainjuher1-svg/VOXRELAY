// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider } from '../src/context/AuthContext';
import { useAuth } from '../src/context/hooks';

const events = vi.hoisted(() => ({ emit: null as null | ((event: string, session: null) => void) }));

vi.mock('../src/lib/supabaseClient', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: (callback: (event: string, session: null) => void) => {
      events.emit = callback;
      callback('INITIAL_SESSION', null);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
    signOut: vi.fn(),
  } },
}));
function Probe() {
  const { loading, user } = useAuth();
  return <p>{loading ? 'Restoring session' : user?.email || 'Guest'}</p>;
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('does not expose Guest while cookie auth is pending after a null provider event', async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise((done) => { resolve = done; })));
  render(<AuthProvider><Probe /></AuthProvider>);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.getByText('Restoring session')).toBeInTheDocument();
  expect(screen.queryByText('Guest')).not.toBeInTheDocument();
  await act(async () => { resolve({ ok: true, json: async () => ({ authenticated: true, user: { id: '1', email: 'interpreter@example.com' } }) }); });
  expect(await screen.findByText('interpreter@example.com')).toBeInTheDocument();
});

it('restores the cookie-backed identity after the provider remounts (reload lifecycle)', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authenticated: true, user: { id: '1', email: 'interpreter@example.com' } }) }));
  const first = render(<AuthProvider><Probe /></AuthProvider>);
  await screen.findByText('interpreter@example.com');
  first.unmount();
  render(<AuthProvider><Probe /></AuthProvider>);
  expect(await screen.findByText('interpreter@example.com')).toBeInTheDocument();
  expect(fetch).toHaveBeenLastCalledWith('/api/auth', expect.objectContaining({ credentials: 'include' }));
});

it('clears a server-restored identity on provider SIGNED_OUT rather than leaving stale UI', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ authenticated: true, user: { id: '1', email: 'synthetic@example.test' } }) }));
  render(<AuthProvider><Probe /></AuthProvider>);
  await screen.findByText('synthetic@example.test');
  act(() => events.emit?.('SIGNED_OUT', null));
  expect(screen.getByText('Guest')).toBeInTheDocument();
});
