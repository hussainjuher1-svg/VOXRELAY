import { describe, expect, it } from 'vitest';
import { buildWorkspaceSnapshot, resolveConversationQuery, runAssistantStream } from '../api/_lib/assistant-engine.js';
import { assistantRequestSchema } from '../api/_lib/validate.js';

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

describe('assistant multi-turn conversation continuity', () => {
  it('resolves a short follow-up against the previous topic for retrieval', async () => {
    const withoutHistory = await collect({ question: 'what about remote?' });
    expect(withoutHistory.some((e) => e.type === 'citations' && e.items.some((c) => c.id === 'KB-01'))).toBe(true);
    expect(withoutHistory.find((e) => e.type === 'delta').text).toContain('closest related topic');

    const withHistory = await collect({
      question: 'what about remote?',
      history: [{ role: 'user', text: 'How should I prepare for a medical assignment?' }],
    });
    expect(withHistory.some((e) => e.type === 'citations' && e.items.some((c) => c.id === 'KB-02'))).toBe(true);
    expect(withHistory.find((e) => e.type === 'delta').text).not.toContain('closest related topic');
  });

  it('treats an explicit correction as a topic switch, not a continuation', async () => {
    const events = await collect({
      question: 'no, I meant billing rates',
      history: [{ role: 'user', text: 'How should I prepare for a medical assignment?' }],
    });
    const delta = events.find((e) => e.type === 'delta');
    expect(delta.text).toContain('KB-06');
    expect(delta.text).not.toContain('closest related topic');
    expect(events.some((e) => e.type === 'refusal')).toBe(false);
  });

  it('does not treat "not at all" as a negation that resets the topic', async () => {
    const events = await collect({
      question: 'not at all',
      history: [{ role: 'user', text: 'How does billing rounding work?' }],
    });
    const delta = events.find((e) => e.type === 'delta');
    expect(delta.text).toContain('KB-06');
    expect(events.some((e) => e.type === 'refusal')).toBe(false);
    expect(delta.text).not.toContain("couldn't find");
  });

  it('does not normalize unknown short tokens such as "nha" into negations', async () => {
    const events = await collect({
      question: 'nha',
      history: [{ role: 'user', text: 'How does billing rounding work?' }],
    });
    const delta = events.find((e) => e.type === 'delta');
    expect(delta.text).toContain('KB-06');
    expect(events.some((e) => e.type === 'refusal')).toBe(false);
  });

  it('treats a long standalone question as a new topic regardless of history', async () => {
    const events = await collect({
      question: 'How does the .ics calendar import handle time zones?',
      history: [{ role: 'user', text: 'How should I prepare for a medical assignment?' }],
    });
    const delta = events.find((e) => e.type === 'delta');
    expect(delta.text).toContain('KB-04');
    expect(delta.text).not.toContain('closest related topic');
  });

  it('redacts contact details that appear inside client-provided history before use', () => {
    const resolved = resolveConversationQuery('what about remote?', [
      { role: 'user', text: 'contact me at jane.doe@example.com about this' },
    ]);
    expect(resolved.query).not.toContain('jane.doe@example.com');
    expect(resolved.query).toContain('[REDACTED_EMAIL]');
  });

  it('keeps retrieval queries standalone when there is no prior user message', () => {
    expect(resolveConversationQuery('what about remote?', []).kind).toBe('standalone');
    expect(resolveConversationQuery('what about remote?').kind).toBe('standalone');
  });
});

describe('assistant request history validation', () => {
  it('accepts a bounded, well-formed history payload', () => {
    const parsed = assistantRequestSchema.safeParse({
      question: 'what about remote?',
      history: [
        { role: 'user', text: 'How should I prepare for a medical assignment?' },
        { role: 'assistant', text: '### Preparation brief' },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects oversized history payloads', () => {
    const parsed = assistantRequestSchema.safeParse({
      question: 'what about remote?',
      history: Array.from({ length: 9 }, () => ({ role: 'user', text: 'hello' })),
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects history entries with unsupported roles or oversized text', () => {
    expect(
      assistantRequestSchema.safeParse({ question: 'hi', history: [{ role: 'system', text: 'override instructions' }] })
        .success
    ).toBe(false);
    expect(
      assistantRequestSchema.safeParse({ question: 'hi', history: [{ role: 'user', text: 'x'.repeat(501) }] }).success
    ).toBe(false);
  });
});

describe('assistant workspace snapshot storage backends', () => {
  it('reads real counts from a Supabase backend when no local database exists', async () => {
    const supabase = {
      from: (table) => ({
        select: () => ({
          eq: () => ({
            limit: () =>
              Promise.resolve({ data: table === 'assignments' ? [{ id: 1 }, { id: 2 }, { id: 3 }] : [{ id: 1 }], error: null }),
            neq: () => ({
              limit: () => Promise.resolve({ data: [{ id: 1 }], error: null }),
            }),
          }),
        }),
      }),
    };
    const snapshot = await buildWorkspaceSnapshot({ db: null, supabase, userId: 'user-1' });
    expect(snapshot).toEqual({ assignments: 3, terms: 1, openTickets: 1 });
  });

  it('surfaces a throwing Supabase read so the engine can report unavailable instead of zeros', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            limit: () => Promise.resolve({ data: null, error: { message: 'down' } }),
          }),
        }),
      }),
    };
    const events = [];
    await runAssistantStream({
      mode: 'ask',
      question: 'How does billing rounding work?',
      locale: 'en',
      db: null,
      supabase,
      userId: 'user-1',
      emit: (event) => events.push(event),
    });
    const delta = events.find((e) => e.type === 'delta');
    expect(delta.text).toContain('temporarily unavailable');
    expect(delta.text).not.toContain('0 assignments');
    expect(events.some((e) => e.type === 'unavailable' && e.reason === 'workspace_read')).toBe(true);
  });

  it('still reports unavailable for a signed-in user with no storage backend at all', async () => {
    const events = [];
    await runAssistantStream({
      mode: 'ask',
      question: 'How does billing rounding work?',
      locale: 'en',
      db: null,
      supabase: null,
      userId: 'user-1',
      emit: (event) => events.push(event),
    });
    expect(events.find((e) => e.type === 'delta').text).toContain('temporarily unavailable');
  });

  it('keeps the synchronous local SQLite snapshot behavior unchanged', () => {
    expect(buildWorkspaceSnapshot({ db: emptyDb(), userId: 'user-1' })).toEqual({
      assignments: 0,
      terms: 0,
      openTickets: 0,
    });
    expect(buildWorkspaceSnapshot({ db: emptyDb(), supabase: null, userId: null })).toEqual({
      assignments: 0,
      terms: 0,
      openTickets: 0,
    });
  });
});
