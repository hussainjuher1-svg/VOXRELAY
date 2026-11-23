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

describe('Landing page accessibility, Radix primitives, and routing', () => {
  it('renders a single h1 before h2s and wires AssistantDock aria-controls to id="assistant-panel"', () => {
    const { container } = renderAt('/');
    const h1 = container.querySelector('h1');
    const firstH2 = container.querySelector('h2');
    expect(h1).toBeTruthy();
    expect(firstH2).toBeTruthy();
    expect(Boolean(h1!.compareDocumentPosition(firstH2!) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    const toggle = screen.getByRole('button', { name: /work assistant/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).not.toHaveAttribute('aria-controls');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'assistant-panel');
    const panel = document.getElementById('assistant-panel');
    expect(panel).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /ask kb/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /research prep/i })).toBeInTheDocument();

    // Verify KB-01..KB-03 specification cards render populated titles & links (no empty boxes)
    expect(screen.getByText('KB-01')).toBeInTheDocument();
    expect(screen.getByText('KB-02')).toBeInTheDocument();
    expect(screen.getByText('KB-03')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /what voxrelay does and never does/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById('assistant-panel')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(toggle);
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

  it('routes /privacy, /faq, /design, and unknown routes cleanly', async () => {
    renderAt('/privacy');
    expect(screen.getByRole('heading', { level: 1, name: /what we refuse to store/i })).toBeInTheDocument();
    cleanup();

    renderAt('/faq');
    expect(screen.getByRole('heading', { level: 1, name: /canonical answers synced/i })).toBeInTheDocument();
    cleanup();

    renderAt('/design');
    expect(await screen.findByRole('heading', { level: 1, name: /voxrelay enterprise design system/i })).toBeInTheDocument();
    cleanup();

    renderAt('/does-not-exist-xyz');
    expect(screen.getByRole('heading', { level: 1, name: /not in the index/i })).toBeInTheDocument();
  });
});
