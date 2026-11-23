import crypto from 'node:crypto';
import { resolveActor } from './_lib/auth-session.js';
import { hashQuestion, runAssistantStream } from './_lib/assistant-engine.js';
import { HttpError } from './_lib/authz.js';
import { readJsonBody, sendJson } from './_lib/core.js';
import { getLocalDb } from './_lib/local-db.js';
import { assistantRequestSchema } from './_lib/validate.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const raw = await readJsonBody(req).catch((err) => {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    return null;
  });
  if (!raw || res.writableEnded) return;

  // Allow feedback recording on same endpoint
  if (raw.feedback && typeof raw.feedback === 'string') {
    const db = getLocalDb();
    if (db) {
      db.prepare(
        'INSERT INTO assistant_feedback (id, mode, rating, question_hash, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), raw.mode || 'ask', raw.feedback, hashQuestion(raw.question || ''), new Date().toISOString());
    }
    return sendJson(res, 200, { ok: true });
  }

  const parsed = assistantRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid assistant request' });
  }

  const actor = await resolveActor(req).catch(() => null);
  const db = getLocalDb();

  const wantsSse = String(req.headers.accept || '').includes('text/event-stream');
  if (wantsSse) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const emit = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      await runAssistantStream({
        mode: parsed.data.mode,
        question: parsed.data.question,
        locale: parsed.data.locale,
        db,
        userId: actor?.user?.id || null,
        emit,
      });
      emit({ type: 'done' });
    } catch (err) {
      emit({ type: 'error', message: err?.message || 'Assistant stream failed.' });
    } finally {
      res.end();
    }
    return;
  }

  // Fallback NDJSON format for compatibility
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  const emit = (obj) => res.write(`${JSON.stringify(obj)}\n`);
  try {
    await runAssistantStream({
      mode: parsed.data.mode,
      question: parsed.data.question,
      locale: parsed.data.locale,
      db,
      userId: actor?.user?.id || null,
      emit,
    });
    emit({ type: 'done' });
  } catch (err) {
    emit({ type: 'error', message: err?.message || 'Assistant stream failed.' });
  } finally {
    res.end();
  }
}
