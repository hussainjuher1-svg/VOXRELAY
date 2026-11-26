// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('../src/context/hooks', () => ({
  useAuth: () => ({ user: { id: 'synthetic', email: 'synthetic@example.test' }, loading: false, session: null, signOut: mocks.signOut }),
  useLocale: () => ({ locale: 'en', tr: (key: string) => key, toggleLocale: vi.fn(), setLocale: vi.fn() }),
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));
import { AppShell } from '../src/components/AppShell';
import { SettingsPage } from '../src/pages/AppWorkspace';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('keeps the user on the page and announces a failed signout', async () => {
  mocks.signOut.mockRejectedValue(new Error('isolated outage'));
  render(<MemoryRouter><AppShell>Workspace</AppShell></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign out failed. Please retry.');
  expect(screen.getByText('Workspace')).toBeInTheDocument();
});
it.each(['network','http'])('shows a retry notice on revoke-all %s failure', async (failure) => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      if (failure === 'network') throw new Error('isolated network failure');
      return { ok: false, json: async () => ({ error: 'Provider revocation unavailable' }) };
    }
    return { ok: true, json: async () => ({ data: {}, sessions: [{ id: 'synthetic-session', user_agent: 'Test browser', created_at: '2026-01-01', expires_at: '2026-12-31' }] }) };
  }));
  render(<MemoryRouter><SettingsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Revoke all' }));
  expect(await screen.findByText(failure === 'network' ? 'Session service is unavailable. Please retry.' : 'Provider revocation unavailable')).toBeInTheDocument();
});
