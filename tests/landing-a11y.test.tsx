// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import { LocaleProvider } from '../src/context/LocaleContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { AppRoutes } from '../src/App';

afterEach(() => {
  cleanup();
});

function renderAt(initialPath = '/') {
  return render(
    <ThemeProvider>
      <LocaleProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}

describe('Public homepage layout, accessibility, Radix primitives, and routing', () => {
  it('renders the full editorial VOXRELAY homepage matching the 7 reference sections without floating assistant', () => {
    const { container } = renderAt('/');
    const h1 = container.querySelector('h1');
    const firstH2 = container.querySelector('h2');
    expect(h1).toBeTruthy();
    expect(firstH2).toBeTruthy();
    expect(Boolean(h1!.compareDocumentPosition(firstH2!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    expect(
      screen.getByRole('heading', { level: 1, name: /infrastructure for the humans between languages/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/HUMAN-LED · NEVER AI-REPLACED/i)).toBeInTheDocument();
    expect(screen.getByText('Audio stays in your tab')).toBeInTheDocument();

    expect(screen.getByRole('heading', { level: 2, name: /one workflow, four honest stages/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /calm on the inside\. alive where it counts/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /test mic live/i })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /live microphone input level/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /round-trip \(live\)/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /built against real friction/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /what voxrelay will not do/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /ai, on your terms/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /ready when you are/i })).toBeInTheDocument();

    // No floating Assistant button on public homepage
    expect(screen.queryByRole('button', { name: /work assistant/i })).not.toBeInTheDocument();
  });

  it('toggles mobile navigation drawer with matching aria-controls', () => {
    renderAt('/');
    const menuBtn = screen.getByRole('button', { name: /menu/i });
    expect(menuBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menuBtn);
    expect(menuBtn).toHaveAttribute('aria-expanded', 'true');
    expect(menuBtn).toHaveAttribute('aria-controls', 'mobile-nav-drawer');
    expect(document.getElementById('mobile-nav-drawer')).toBeInTheDocument();
  });

  it('renders /contact with custom Radix role combobox instead of visible native select', () => {
    const { container } = renderAt('/contact');
    expect(container.querySelector('select:not([aria-hidden="true"])')).toBeNull();
    expect(screen.getByRole('combobox', { name: /role/i })).toBeInTheDocument();
  });

  it('routes /privacy, /faq, /design, and unknown routes cleanly and populates KB rows on /faq', async () => {
    renderAt('/privacy');
    expect(screen.getByRole('heading', { level: 1, name: /what we refuse to store/i })).toBeInTheDocument();
    cleanup();

    renderAt('/faq');
    expect(screen.getByRole('heading', { level: 1, name: /canonical answers synced/i })).toBeInTheDocument();
    expect(screen.getByText('KB-01')).toBeInTheDocument();
    expect(screen.getByText(/what voxrelay does and never does/i)).toBeInTheDocument();
    cleanup();

    renderAt('/design');
    expect(await screen.findByRole('heading', { level: 1, name: /voxrelay design system/i })).toBeInTheDocument();
    cleanup();

    renderAt('/does-not-exist-xyz');
    expect(screen.getByRole('heading', { level: 1, name: /not in the index/i })).toBeInTheDocument();
  });
});
