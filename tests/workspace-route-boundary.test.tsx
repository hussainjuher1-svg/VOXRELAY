// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { RequireWorkspaceSession } from '../src/components/RequireWorkspaceSession';
const state = vi.hoisted(() => ({ loading: false, user: null as null | { id: string } }));
vi.mock('../src/context/hooks', () => ({ useAuth: () => state, useLocale: () => ({ locale: 'en' }) }));
afterEach(() => { cleanup(); state.loading = false; state.user = null; });
function Location() { const at = useLocation(); return <div data-testid="login">{at.pathname}{at.search}</div>; }
function tree() { return <MemoryRouter initialEntries={['/app/terminology?language=es#saved']}><Routes><Route element={<RequireWorkspaceSession />}><Route path="/app/terminology" element={<h1>Private terms</h1>} /></Route><Route path="/login" element={<Location />} /></Routes></MemoryRouter>; }
it('redirects signed-out users with a safe complete return route, without rendering private content', async () => {
  render(tree());
  expect(await screen.findByTestId('login')).toHaveTextContent('/login?returnTo=%2Fapp%2Fterminology%3Flanguage%3Des%23saved');
  expect(screen.queryByText('Private terms')).not.toBeInTheDocument();
});
it('waits for restoration then allows the verified session', () => {
  state.loading = true;
  const { rerender } = render(tree());
  expect(screen.getByRole('status')).toHaveTextContent('Checking your session');
  expect(screen.queryByText('Private terms')).not.toBeInTheDocument();
  state.loading = false; state.user = { id: 'synthetic' }; rerender(tree());
  expect(screen.getByRole('heading', { name: 'Private terms' })).toBeInTheDocument();
});
it('removes private content and redirects on session loss', async () => {
  state.user = { id: 'synthetic' };
  const { rerender } = render(tree());
  expect(screen.getByText('Private terms')).toBeInTheDocument();
  state.user = null; rerender(tree());
  expect(await screen.findByTestId('login')).toBeInTheDocument();
  expect(screen.queryByText('Private terms')).not.toBeInTheDocument();
});
