// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { PrivacyPage } from '../src/pages/Public';
import typography from '../src/pages/PrivacyTypography.module.css';
const state = vi.hoisted(() => ({ locale: 'en' }));
vi.mock('../src/context/hooks', () => ({ useLocale: () => ({ locale: state.locale }) }));
afterEach(() => { cleanup(); state.locale = 'en'; });

it('scopes the reading typography to the privacy page and retains all five live section anchors', () => {
  const { container } = render(<MemoryRouter><PrivacyPage /></MemoryRouter>);
  expect(container.firstElementChild).toHaveClass(typography.page);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('What we refuse to store is our primary safeguard');
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(5);
  const contents = screen.getByRole('complementary', { name: 'Essay contents' });
  const links = within(contents).getAllByRole('link');
  expect(links).toHaveLength(5);
  for (const link of links) {
    const id = link.getAttribute('href')!.slice(1);
    expect(document.getElementById(id)).toBeInTheDocument();
  }
  expect(container.querySelector('blockquote')).toHaveTextContent('live session speech never touches our servers');
});

it('retains Arabic headings and navigation without replacing their text', () => {
  state.locale = 'ar';
  render(<MemoryRouter><PrivacyPage /></MemoryRouter>);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('البيانات التي لا نجمعها هي خط الدفاع الأول');
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(5);
  expect(screen.getByRole('complementary', { name: 'فهرس المقال' })).toBeInTheDocument();
});
