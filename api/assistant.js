import crypto from 'node:crypto';
import { resolveActor } from './_lib/auth-session.js';
import {
  assistantRateLimitMessage,
  assistantServiceErrorMessage,
  hashQuestion,
  runAssistantStream,
} from './_lib/assistant-engine.js';
import { HttpError } from './_lib/authz.js';
import { enforceLocalRateLimit, enforceRateLimit, readJsonBody, sendJson } from './_lib/core.js';
import { getLocalDb, writeLocalAudit } from './_lib/local-db.js';
import { getServiceClient } from './_lib/supabase.js';
import { assistantRequestSchema } from './_lib/validate.js';

const ASSISTANT_RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  const raw = await readJsonBody(req).catch((err) => {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    return null;
  });
  if (!raw || res.writableEnded) return;

  // Allow feedback recording on same endpoint (supports both { action: 'feedback', vote } and { feedback })
  const rating = typeof raw.feedback === 'string' ? raw.feedback : raw.action === 'feedback' && typeof raw.vote === 'string' ? raw.vote : null;
  if (rating) {
    const db = getLocalDb();
    if (db) {
      db.prepare(
        'INSERT INTO assistant_feedback (id, mode, rating, question_hash, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(crypto.randomUUID(), raw.mode || 'ask', rating, hashQuestion(raw.question || raw.messageId || ''), new Date().toISOString());
    }
    return sendJson(res, 200, { ok: true });
  }

  const parsed = assistantRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid assistant request' });
  }

  const actor = await resolveActor(req).catch(() => null);
  const db = getLocalDb();

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const bucket = actor?.user?.id ? `assistant:${actor.user.id}` : `assistant-anon:${ip}`;
  const service = getServiceClient();
  try {
    if (service) {
      await enforceRateLimit(service, bucket, ASSISTANT_RATE_LIMIT);
    } else {
      enforceLocalRateLimit(db, bucket, ASSISTANT_RATE_LIMIT);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      const message =
        err.status === 429 ? assistantRateLimitMessage(parsed.data.locale) : assistantServiceErrorMessage(parsed.data.locale);
      return sendJson(res, err.status, { error: message });
    }
    throw err;
  }

  const role = actor?.membership?.role || actor?.user?.role || null;
  const auditRoleRefusal = (event) => {
    if (event?.type !== 'refusal' || event.code !== 'role_refused') return;
    if (service && actor?.user?.id) {
      service
        .from('audit_events')
        .insert({
          actor_id: actor.user.id,
          org_id: actor.membership?.org_id || null,
          area: 'assistant',
          type: 'assistant_role_refusal',
          result: 'denied',
          metadata: { topic: event.topic || null },
        })
        .then(
          () => undefined,
          () => undefined
        );
    } else if (db) {
      try {
        writeLocalAudit(db, {
          actorId: actor?.user?.id || null,
          area: 'assistant',
          type: 'assistant_role_refusal',
          result: 'denied',
        });
      } catch {
        return;
      }
    }
  };

  const wantsSse = String(req.headers.accept || '').includes('text/event-stream');
  if (wantsSse) {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const emit = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const emitWithAudit = (payload) => {
      emit(payload);
      auditRoleRefusal(payload);
    };

    try {
      await runAssistantStream({
        mode: parsed.data.mode,
        question: parsed.data.question,
        locale: parsed.data.locale,
        db,
        supabase: actor?.supabase || null,
        userId: actor?.user?.id || null,
        role,
        history: parsed.data.history || [],
        emit: emitWithAudit,
      });
      emit({ type: 'done' });
    } catch {
      emit({ type: 'error', message: assistantServiceErrorMessage(parsed.data.locale) });
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
  const emitWithAudit = (payload) => {
    emit(payload);
    auditRoleRefusal(payload);
  };
  try {
    await runAssistantStream({
      mode: parsed.data.mode,
      question: parsed.data.question,
      locale: parsed.data.locale,
      db,
      supabase: actor?.supabase || null,
      userId: actor?.user?.id || null,
      role,
      history: parsed.data.history || [],
      emit: emitWithAudit,
    });
    emit({ type: 'done' });
  } catch {
    emit({ type: 'error', message: assistantServiceErrorMessage(parsed.data.locale) });
  } finally {
    res.end();
  }
}
