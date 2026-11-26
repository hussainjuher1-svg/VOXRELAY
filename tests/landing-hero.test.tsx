// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LandingHero } from '../src/components/LandingHero';
import styles from '../src/components/LandingHero.module.css';

let reduced = false;
let onChange: (() => void) | undefined;
const removeListener = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  reduced = false;
  onChange = undefined;
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    get matches() { return reduced; },
    addEventListener: (_event: string, listener: () => void) => { onChange = listener; },
    removeEventListener: removeListener,
  })));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const mount = () => render(<MemoryRouter><LandingHero /></MemoryRouter>);
const activeWord = () => document.querySelector(`.${styles.isOn}`)?.textContent;

it('preserves approved copy and accessible stable heading', () => {
  mount();
  expect(screen.getByText('HUMAN-LED · NEVER AI-REPLACED')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Infrastructure for the humans between languages.');
  expect(screen.getByText('Assignments, preparation, terminology and real human support for professional remote interpreters.')).toBeInTheDocument();
  expect(screen.getAllByText('languages.').filter((node) => !node.closest('[aria-hidden]'))).toHaveLength(1);
});

it('links to existing product, organization, sign-in and signup flows', () => {
  mount();
  expect(screen.getByRole('link', { name: 'How it works' })).toHaveAttribute('href', '/how-it-works');
  expect(screen.getByRole('link', { name: 'For organizations' })).toHaveAttribute('href', '/organizations');
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(screen.getByRole('link', { name: 'Create your workspace' })).toHaveAttribute('href', '/login?mode=signup');
  expect(screen.getByRole('link', { name: 'Request organization access' })).toHaveAttribute('href', '/contact?audience=organization');
  const logo = screen.getByRole('link', { name: 'VoxRelay home' });
  expect(logo.querySelector('svg text')).toBeNull();
  expect(logo.querySelectorAll('path')).toHaveLength(2);
});

it('cycles all six words every 2400ms in a single stable stack', () => {
  mount();
  const stack = document.querySelector(`.${styles.cycle}`)!;
  expect(stack).toHaveAttribute('aria-hidden', 'true');
  expect(stack.children).toHaveLength(6);
  expect(activeWord()).toBe('languages.');
  act(() => vi.advanceTimersByTime(2399));
  expect(activeWord()).toBe('languages.');
  for (const word of ['idiomas.', 'langues.', 'Sprachen.', 'lingue.', 'línguas.', 'languages.']) {
    act(() => vi.advanceTimersByTime(word === 'idiomas.' ? 1 : 2400));
    expect(activeWord()).toBe(word);
    expect(document.querySelectorAll(`.${styles.isOut}`)).toHaveLength(1);
  }
});

it('does not cycle for reduced motion, responds to changes, and cleans up', () => {
  reduced = true;
  const view = mount();
  expect(vi.getTimerCount()).toBe(0);
  act(() => vi.advanceTimersByTime(10000));
  expect(activeWord()).toBe('languages.');
  act(() => { reduced = false; onChange?.(); vi.advanceTimersByTime(2400); });
  expect(activeWord()).toBe('idiomas.');
  act(() => { reduced = true; onChange?.(); });
  expect(activeWord()).toBe('languages.');
  expect(vi.getTimerCount()).toBe(0);
  view.unmount();
  expect(removeListener).toHaveBeenCalled();
});
