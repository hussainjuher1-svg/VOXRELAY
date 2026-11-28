// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

type SessionShape = { access_token: string; user: { id: string } };
const testState = vi.hoisted(() => ({ session: null as SessionShape | null }));

vi.mock('../src/context/hooks', () => ({
  useAuth: () => ({
    user: testState.session ? { id: testState.session.user.id } : null,
    loading: false,
    session: testState.session,
    signOut: vi.fn(),
  }),
  useLocale: () => ({ locale: 'en', tr: (key: string) => key, toggleLocale: vi.fn(), setLocale: vi.fn() }),
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}));

import { AssistantDock } from '../src/components/AssistantSheet';

interface PendingRead {
  resolve: (value: { done: boolean; value?: Uint8Array }) => void;
}
const pendingReads: PendingRead[] = [];
let chunkIndex = 0;

function makeReader(chunks: Array<{ done: boolean; value?: Uint8Array }>) {
  chunkIndex = 0;
  return {
    read: () => {
      const next = chunks[chunkIndex];
      chunkIndex += 1;
      if (next) return Promise.resolve(next);
      return new Promise((resolve) => pendingReads.push({ resolve }));
    },
    cancel: vi.fn(() => Promise.resolve()),
  };
}

function sseFrame(payload: unknown) {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function renderDock() {
  return render(
    <MemoryRouter>
      <AssistantDock open onOpenChange={vi.fn()} />
    </MemoryRouter>
  );
}

async function ask(question: string) {
  fireEvent.change(screen.getByPlaceholderText('Ask about scheduling, privacy, or prep...'), {
    target: { value: question },
  });
  fireEvent.submit(screen.getByPlaceholderText('Ask about scheduling, privacy, or prep...').closest('form')!);
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  pendingReads.length = 0;
  testState.session = null;
  vi.unstubAllGlobals();
});

it('applies streamed answers during a stable session', async () => {
  testState.session = { access_token: 'token-1', user: { id: 'user-1' } };
  const reader = makeReader([
    { done: false, value: sseFrame({ type: 'delta', text: 'GROUND-ANSWER ' }) },
    { done: false, value: sseFrame({ type: 'delta', text: 'COMPLETE' }) },
    { done: false, value: sseFrame({ type: 'done', citations: [] }) },
  ]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, body: { getReader: () => reader } }))
  );

  renderDock();
  await ask('How does billing rounding work?');

  await waitFor(() => expect(screen.getByText(/GROUND-ANSWER/)).toBeInTheDocument());
  expect(screen.getByText(/COMPLETE/)).toBeInTheDocument();
});

it('drops stale answers after the account changes mid-stream', async () => {
  testState.session = { access_token: 'token-1', user: { id: 'user-1' } };
  const reader = makeReader([{ done: false, value: sseFrame({ type: 'delta', text: 'STALE-ANSWER' }) }]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, body: { getReader: () => reader } }))
  );

  const view = renderDock();
  await ask('How does billing rounding work?');
  expect(screen.getByText('You')).toBeInTheDocument();

  testState.session = { access_token: 'token-2', user: { id: 'user-2' } };
  view.rerender(
    <MemoryRouter>
      <AssistantDock open onOpenChange={vi.fn()} />
    </MemoryRouter>
  );

  pendingReads.splice(0).forEach((p) => p.resolve({ done: false, value: sseFrame({ type: 'delta', text: 'STALE-ANSWER' }) }));
  await waitFor(() => expect(reader.cancel).toHaveBeenCalled());
  expect(screen.queryByText(/STALE-ANSWER/)).not.toBeInTheDocument();
});

it('does not surface the connection-failure message when a stale stream aborts', async () => {
  testState.session = { access_token: 'token-1', user: { id: 'user-1' } };
  const reader = makeReader([]);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, body: { getReader: () => reader } }))
  );

  const view = renderDock();
  await ask('How does billing rounding work?');

  testState.session = null;
  view.rerender(
    <MemoryRouter>
      <AssistantDock open onOpenChange={vi.fn()} />
    </MemoryRouter>
  );

  pendingReads.splice(0).forEach((p) => p.resolve({ done: false, value: sseFrame({ type: 'delta', text: 'STALE-ANSWER' }) }));
  await waitFor(() => expect(reader.cancel).toHaveBeenCalled());
  expect(screen.queryByText(/STALE-ANSWER/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Unable to reach the assistant/)).not.toBeInTheDocument();
});
