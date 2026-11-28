import { describe, expect, it } from 'vitest';
import { assistantServiceErrorMessage, runAssistantStream } from '../api/_lib/assistant-engine.js';

function failingDb() {
  return {
    prepare: () => {
      throw new Error('simulated read outage');
    },
  };
}

function emptyDb() {
  return { prepare: () => ({ get: () => ({ c: 0 }) }) };
}

async function collect(args) {
  const events = [];
  await runAssistantStream({
    mode: 'ask',
    locale: 'en',
    db: null,
    userId: null,
    emit: (event) => events.push(event),
    ...args,
  });
  return events;
}

describe('assistant honest unavailability (deterministic)', () => {
  it('reports workspace records as unavailable instead of fabricating zeros when the read fails', async () => {
    const events = await collect({ question: 'How does billing rounding work?', db: failingDb(), userId: 'user-1' });
    const delta = events.find((e) => e.type === 'delta');
    expect(delta.text).toContain('KB-06');
    expect(delta.text).toContain('temporarily unavailable');
    expect(delta.text).not.toContain('0 assignments');
    expect(events.some((e) => e.type === 'unavailable' && e.reason === 'workspace_read')).toBe(true);
  });

  it('distinguishes a genuine empty workspace from a read failure', async () => {
    const events = await collect({ question: 'How does billing rounding work?', db: emptyDb(), userId: 'user-1' });
    const delta = events.find((e) => e.type === 'delta');
    expect(delta.text).toContain('0 assignments');
    expect(events.some((e) => e.type === 'unavailable')).toBe(false);
  });

  it('treats a signed-in user with no database backend as unavailable, not as an empty snapshot', async () => {
    const events = await collect({ question: 'How does billing rounding work?', db: null, userId: 'user-1' });
    const delta = events.find((e) => e.type === 'delta');
    expect(delta.text).toContain('temporarily unavailable');
    expect(delta.text).not.toContain('0 assignments');
    expect(events.some((e) => e.type === 'unavailable' && e.reason === 'workspace_read')).toBe(true);
  });

  it('omits workspace data for signed-out users without claiming availability', async () => {
    const events = await collect({ question: 'How does billing rounding work?', db: emptyDb(), userId: null });
    const delta = events.find((e) => e.type === 'delta');
    expect(delta.text).not.toContain('Your workspace');
    expect(events.some((e) => e.type === 'unavailable')).toBe(false);
  });

  it('flags a weak knowledge-base match as the closest related topic with citations retained', async () => {
    const events = await collect({ question: 'payouts', db: emptyDb(), userId: null });
    const delta = events.find((e) => e.type === 'delta');
    expect(delta.text).toContain('closest related topic');
    const citations = events.find((e) => e.type === 'citations');
    expect(citations.items.some((c) => c.id === 'KB-06')).toBe(true);
  });

  it('does not qualify a strong knowledge-base match', async () => {
    const events = await collect({ question: 'How does billing rounding work?', db: emptyDb(), userId: null });
    const delta = events.find((e) => e.type === 'delta');
    expect(delta.text).not.toContain('closest related topic');
    const citations = events.find((e) => e.type === 'citations');
    expect(citations.items.some((c) => c.id === 'KB-06')).toBe(true);
  });

  it('maps service failure messages by locale without raw exception text', () => {
    expect(assistantServiceErrorMessage('en')).toMatch(/temporarily unavailable/);
    expect(assistantServiceErrorMessage('ar')).not.toMatch(/temporarily unavailable/);
    expect(assistantServiceErrorMessage('bn')).not.toMatch(/temporarily unavailable/);
    expect(assistantServiceErrorMessage('de')).toBe(assistantServiceErrorMessage('en'));
  });
});
