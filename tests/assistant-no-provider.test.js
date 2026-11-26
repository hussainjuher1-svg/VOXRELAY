import { afterEach, expect, it, vi } from 'vitest';
import { runAssistantStream } from '../api/_lib/assistant-engine.js';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('never calls a paid provider even when a legacy key is configured', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key-not-real');
  const fetchSpy = vi.fn(() => { throw new Error('Network forbidden'); });
  vi.stubGlobal('fetch', fetchSpy);
  const events = [];
  await runAssistantStream({ mode: 'ask', question: 'How does billing rounding work?', locale: 'en', db: null, userId: null, emit: (event) => events.push(event) });
  expect(events.some((event) => event.type === 'delta' && event.text.includes('KB-06'))).toBe(true);
  expect(fetchSpy).not.toHaveBeenCalled();
});
