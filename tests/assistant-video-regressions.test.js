import { describe, expect, it } from 'vitest';
import { KNOWLEDGE_BASE, searchKnowledgeBaseWithScores } from '../api/_lib/kb.js';
import { resolveConversationQuery, runAssistantStream } from '../api/_lib/assistant-engine.js';

const KB_IDS = new Set(KNOWLEDGE_BASE.map((e) => e.id));

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

function deltaText(events) {
  return events
    .filter((e) => e.type === 'delta')
    .map((e) => e.text)
    .join('');
}

function citationIds(events) {
  return (events.find((e) => e.type === 'citations')?.items || []).map((c) => c.id);
}

describe('assistant video regression cases', () => {
  it('Case 1: introduces itself as Vox without knowledge-base retrieval', async () => {
    const nameEvents = await collect({ question: 'What is your name?' });
    expect(deltaText(nameEvents)).toContain('Vox');
    expect(nameEvents.some((e) => e.type === 'citations')).toBe(false);

    const capabilityEvents = await collect({ question: 'What can you do?' });
    const capabilities = deltaText(capabilityEvents);
    expect(capabilities).toContain('Vox');
    expect(capabilities).toContain('Research');
    expect(capabilities).toContain('What I can do');
    expect(capabilityEvents.some((e) => e.type === 'citations')).toBe(false);
  });

  it('Case 2: explains the VOXRELAY product from its verified KB entry', async () => {
    const events = await collect({ question: 'What is VOXRELAY?' });
    const text = deltaText(events);
    expect(text).toContain('VOXRELAY');
    expect(text).toContain('interpreting');
    const ids = citationIds(events);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(KB_IDS.has(id)).toBe(true);
    expect(text).not.toContain("couldn't find");
  });

  it('Case 3: treats a broad domain query as grounded topic categories, not a failure', async () => {
    const events = await collect({ question: 'Interpreter' });
    const text = deltaText(events);
    expect(text).toContain('Interpreting');
    expect(text).toContain('Which area would you like to start with?');
    expect(text).not.toContain("couldn't find");
    const ids = citationIds(events);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(KB_IDS.has(id)).toBe(true);
  });

  it('Case 4: understands natural-language phrasings without keyword discovery', async () => {
    for (const question of ['Can you help me with interpreter?', 'please tell me about interpreters']) {
      const events = await collect({ question });
      const text = deltaText(events);
      expect(text).toContain('Interpreting');
      expect(text).not.toContain("couldn't find");
      expect(citationIds(events).length).toBeGreaterThan(0);
    }
  });

  it('Case 5: resolves an example follow-up to the previous topic', () => {
    const history = [{ role: 'user', text: 'Explain consecutive interpreting.' }];
    const resolved = resolveConversationQuery('Give me an example.', history);
    expect(resolved.query.toLowerCase()).toContain('consecutive interpreting');
    expect(resolved.kind).toBe('followup');
  });

  it('Case 5: presents tied KB interpretations instead of a confident single answer', async () => {
    const composed = searchKnowledgeBaseWithScores('Explain consecutive interpreting. give me an example', 'en', 2);
    expect(composed.length).toBeGreaterThan(1);
    expect(composed[0].score).toBe(composed[1].score);

    const events = await collect({
      question: 'Give me an example.',
      history: [{ role: 'user', text: 'Explain consecutive interpreting.' }],
    });
    const text = deltaText(events);
    expect(text).toContain('more than one knowledge-base topic');
    const ids = citationIds(events);
    for (const id of ids) expect(KB_IDS.has(id)).toBe(true);
    expect(text).not.toContain('closest related topic');
  });

  it('Case 6: explains the evidence limitation and lists real topics when nothing matches', async () => {
    const events = await collect({ question: 'How do I file a tax return as an interpreter in Germany?' });
    const text = deltaText(events);
    expect(text).toContain("don't have verified information");
    expect(text).toContain("won't guess");
    expect(text).toContain('billing');
    expect(text).toContain('Research');
    expect(events.some((e) => e.type === 'offer_ticket')).toBe(true);
    expect(citationIds(events)).toEqual([]);
  });

  it('Case 7: answers a Bengali-script question with an English-source transparency note', async () => {
    const events = await collect({ question: 'বিলিং কিভাবে কাজ করে?', locale: 'bn' });
    const text = deltaText(events);
    expect(citationIds(events)).toContain('KB-06');
    expect(text).toContain('ইংরেজিতে');
  });

  it('keeps identity consistent for unseen phrasings: "Hello Vox!" greets as Vox', async () => {
    const events = await collect({ question: 'Hello Vox!' });
    expect(deltaText(events)).toContain('Vox');
    expect(events.some((e) => e.type === 'citations')).toBe(false);
  });

  it('routes a correction without an explicit negation word to the right topic', async () => {
    const events = await collect({ question: 'I meant billing rates' });
    expect(deltaText(events)).toContain('KB-06');
    expect(citationIds(events)).toContain('KB-06');
  });
});
