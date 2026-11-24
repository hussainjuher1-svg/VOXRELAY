import crypto from 'node:crypto';
import { resolveActor } from './_lib/auth-session.js';
import { evaluateAssistantRequest, matchTopic } from './_lib/assistant.js';
import { can, canReadDoc, canReviewDoc, HttpError, isAdminActor, requireCapability } from './_lib/authz.js';
import { enforceRateLimit, readJsonBody, sendJson, streamRoute } from './_lib/core.js';
import { getLocalDb, writeLocalAudit } from './_lib/local-db.js';
import { computeBillingAmountCents, computeQualityIndicators, summarizeReports } from './_lib/ops-metrics.js';
import { authenticateRequest } from './_lib/supabase.js';
import {
  assistantRequestSchema,
  availabilityCreateSchema,
  billingMarkPaidSchema,
  billingRecordCreateSchema,
  deviceCheckCreateSchema,
  diagnosticsRunSchema,
  profileUpdateSchema,
  safeMeta,
  sessionDocSchema,
  sessionEventCreateSchema,
} from './_lib/validate.js';

async function handleLocalOps(req, res, actor, resource) {
  const db = actor.db;
  const userId = actor.user.id;
  const url = new URL(req.url, 'http://localhost');

  if (resource === 'billing') {
    if (req.method === 'GET') {
      const records = db
        .prepare('SELECT * FROM billing_records WHERE user_id = ? ORDER BY created_at DESC LIMIT 100')
        .all(userId);
      return sendJson(res, 200, { settings: null, records });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const parsed = billingRecordCreateSchema.safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid billing entry' });
      const d = parsed.data;
      const rateCents = d.rate_cents ?? 0;
      const calc = computeBillingAmountCents(d.minutes, rateCents, {
        minimum_minutes: d.minimum_minutes,
        round_to_minutes: d.round_to_minutes,
      });
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO billing_records (id, user_id, assignment_ref, minutes, rate_cents, currency, amount_cents, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'invoiced', ?)`
      ).run(id, userId, d.assignment_ref || null, calc.minutes, rateCents, d.currency, calc.amount_cents, now);
      const rec = db.prepare('SELECT * FROM billing_records WHERE id = ?').get(id);
      return sendJson(res, 201, { data: rec });
    }
    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      const parsed = billingMarkPaidSchema.safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Billing record ID required.' });
      db.prepare("UPDATE billing_records SET status = 'paid' WHERE id = ? AND user_id = ?").run(parsed.data.id, userId);
      const rec = db.prepare('SELECT * FROM billing_records WHERE id = ? AND user_id = ?').get(parsed.data.id, userId);
      if (!rec) return sendJson(res, 404, { error: 'Billing record not found.' });
      return sendJson(res, 200, { data: rec });
    }
  }

  if (resource === 'device_check') {
    if (req.method === 'GET') {
      const rows = db
        .prepare('SELECT * FROM device_checks WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
        .all(userId);
      return sendJson(res, 200, { data: rows });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const parsed = deviceCheckCreateSchema.safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid device check' });
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const result = parsed.data.result;
      const latencyMs = parsed.data.latency_ms !== null && parsed.data.latency_ms !== undefined ? Math.round(parsed.data.latency_ms) : null;
      const peakLevel = Math.round(parsed.data.peak_level);
      db.prepare(
        `INSERT INTO device_checks (id, user_id, result, latency_ms, peak_level, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, userId, result, latencyMs, peakLevel, now);
      writeLocalAudit(db, { actorId: userId, area: 'device_check', type: 'device_check_run', result });
      const rec = db.prepare('SELECT * FROM device_checks WHERE id = ?').get(id);
      return sendJson(res, 201, { data: rec });
    }
  }

  if (resource === 'session_event') {
    const assignmentId = req.query?.assignment_id || url.searchParams.get('assignment_id') || 'preview';
    if (req.method === 'GET') {
      const rows = db
        .prepare('SELECT * FROM session_events WHERE assignment_id = ? AND actor_id = ? ORDER BY id ASC')
        .all(assignmentId, userId);
      return sendJson(res, 200, { data: rows });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const parsed = sessionEventCreateSchema.safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid session event' });
      const aid = parsed.data.assignment_id || assignmentId;
      const now = new Date().toISOString();
      const info = db
        .prepare('INSERT INTO session_events (assignment_id, actor_id, type, created_at) VALUES (?, ?, ?, ?)')
        .run(aid, userId, parsed.data.type, now);
      const rec = db.prepare('SELECT * FROM session_events WHERE id = ?').get(info.lastInsertRowid);
      return sendJson(res, 201, { data: rec });
    }
  }

  if (resource === 'reports' && req.method === 'GET') {
    const assignments = db.prepare('SELECT * FROM assignments WHERE owner_id = ?').all(userId);
    return sendJson(res, 200, summarizeReports(assignments));
  }

  if (resource === 'quality' && req.method === 'GET') {
    const assignments = db.prepare('SELECT * FROM assignments WHERE owner_id = ?').all(userId);
    const checks = db.prepare('SELECT * FROM device_checks WHERE user_id = ?').all(userId);
    return sendJson(res, 200, {
      indicators: computeQualityIndicators({
        assignments,
        assignmentEvents: [],
        deviceChecks: checks,
        sessionDocs: [],
        followups: [],
      }),
    });
  }

  if (resource === 'profile') {
    const row = db
      .prepare('SELECT id, email, full_name, role, locale, time_zone, language_pairs, weekly_hours FROM local_users WHERE id = ?')
      .get(userId);
    if (req.method === 'GET') {
      return sendJson(res, 200, {
        data: row || {
          id: userId,
          email: actor.user.email,
          full_name: actor.user.full_name || '',
          role: actor.user.role || 'interpreter',
          locale: 'en',
          time_zone: 'UTC',
          language_pairs: '',
          weekly_hours: 30,
        },
      });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const parsed = profileUpdateSchema.safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid profile update' });
      const d = parsed.data;
      if (row) {
        db.prepare(
          'UPDATE local_users SET full_name = ?, locale = ?, time_zone = ?, language_pairs = ?, weekly_hours = ? WHERE id = ?'
        ).run(
          d.full_name ?? row.full_name,
          d.locale ?? row.locale,
          d.time_zone ?? row.time_zone,
          d.language_pairs ?? row.language_pairs,
          d.weekly_hours ?? row.weekly_hours,
          userId
        );
      }
      const updated = db
        .prepare('SELECT id, email, full_name, role, locale, time_zone, language_pairs, weekly_hours FROM local_users WHERE id = ?')
        .get(userId);
      return sendJson(res, 200, { data: updated || row });
    }
  }

  if (resource === 'availability') {
    if (req.method === 'GET') {
      const rows = db
        .prepare('SELECT * FROM availability_overrides WHERE user_id = ? ORDER BY date ASC')
        .all(userId);
      return sendJson(res, 200, { data: rows });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const parsed = availabilityCreateSchema.safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Valid YYYY-MM-DD date is required.' });
      const { date, kind, window_label: windowLabel } = parsed.data;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO availability_overrides (id, user_id, date, kind, window_label, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, date) DO UPDATE SET kind = excluded.kind, window_label = excluded.window_label`
      ).run(id, userId, date, kind, windowLabel, now);
      const saved = db.prepare('SELECT * FROM availability_overrides WHERE user_id = ? AND date = ?').get(userId, date);
      return sendJson(res, 201, { data: saved });
    }
    if (req.method === 'DELETE') {
      const id = req.query?.id || url.searchParams.get('id');
      if (!id) return sendJson(res, 400, { error: 'Override ID is required.' });
      db.prepare('DELETE FROM availability_overrides WHERE id = ? AND user_id = ?').run(id, userId);
      return sendJson(res, 200, { ok: true });
    }
  }

  if (resource === 'diagnostics') {
    if (req.method === 'GET') {
      const rows = db
        .prepare('SELECT id, profile, score, verdict, payload_json, created_at FROM diagnostics_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
        .all(userId)
        .map((r) => {
          let payload = {};
          try {
            payload = JSON.parse(r.payload_json || '{}');
          } catch {
            payload = {};
          }
          return { ...r, payload };
        });
      return sendJson(res, 200, { data: rows });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const parsed = diagnosticsRunSchema.safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid diagnostics run' });
      const { profile, score, verdict, payload } = parsed.data;
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const payloadJson = JSON.stringify(payload || {});
      db.prepare(
        `INSERT INTO diagnostics_runs (id, user_id, profile, score, verdict, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, userId, profile, score, verdict, payloadJson, now);
      writeLocalAudit(db, { actorId: userId, area: 'diagnostics', type: `run_${profile}`, objectRef: id, result: verdict });
      return sendJson(res, 201, { data: { id, profile, score, verdict, payload: payload || {}, created_at: now } });
    }
  }

  if (resource === 'audit' && req.method === 'GET') {
    const rows = isAdminActor(actor)
      ? db.prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT 100').all()
      : db.prepare('SELECT * FROM audit_events WHERE actor_id = ? ORDER BY id DESC LIMIT 100').all(userId);
    return sendJson(res, 200, { data: rows });
  }

  if (resource === 'gdpr_export' && req.method === 'GET') {
    const profile = db
      .prepare('SELECT id, email, full_name, role, locale, time_zone, language_pairs, weekly_hours, created_at FROM local_users WHERE id = ?')
      .get(userId);
    const assignments = db.prepare('SELECT * FROM assignments WHERE owner_id = ?').all(userId);
    const terms = db.prepare('SELECT * FROM terms WHERE owner_id = ?').all(userId);
    const deviceChecks = db.prepare('SELECT * FROM device_checks WHERE user_id = ?').all(userId);
    const diagnostics = db.prepare('SELECT * FROM diagnostics_runs WHERE user_id = ?').all(userId);
    const billing = db.prepare('SELECT * FROM billing_records WHERE user_id = ?').all(userId);
    const availability = db.prepare('SELECT * FROM availability_overrides WHERE user_id = ?').all(userId);
    const tickets = db.prepare('SELECT * FROM support_tickets WHERE requester_id = ?').all(userId);
    const audit = db.prepare('SELECT * FROM audit_events WHERE actor_id = ? ORDER BY id DESC LIMIT 200').all(userId);
    writeLocalAudit(db, { actorId: userId, area: 'privacy', type: 'gdpr_export', result: 'ok' });
    return sendJson(res, 200, {
      exportedAt: new Date().toISOString(),
      profile,
      assignments,
      terms,
      deviceChecks,
      diagnostics,
      billing,
      availability,
      tickets,
      audit,
    });
  }

  if (resource === 'assistant' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const parsed = assistantRequestSchema.safeParse(body);
    if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0].message });

    const role = actor.user.role || 'interpreter';
    const topic = matchTopic(parsed.data.question);

    return streamRoute(res, async (emit) => {
      emit({ type: 'meta', topic });
      emit({ type: 'step', step: 'records', status: 'run' });

      const assignments = db.prepare('SELECT id, ref, status, start_at FROM assignments WHERE owner_id = ? LIMIT 50').all(userId);
      const billing = db.prepare('SELECT id, status, amount_cents FROM billing_records WHERE user_id = ? LIMIT 50').all(userId);
      const terms = db.prepare('SELECT id, label FROM terms WHERE owner_id = ? LIMIT 20').all(userId);

      emit({ type: 'step', step: 'records', status: 'done', count: assignments.length });

      const decision = evaluateAssistantRequest({
        ...parsed.data,
        role,
        records: { assignments, followups: [], billing, terms },
      });

      if (decision.auditType) {
        writeLocalAudit(db, {
          actorId: userId,
          area: 'assistant',
          type: decision.auditType,
          result: decision.refused ? 'denied' : 'ok',
        });
      }

      for (const block of decision.blocks) {
        emit({ type: 'block', key: block.key, vars: block.vars });
      }
      emit({
        type: 'sources',
        reads: decision.reads,
        at: new Date().toISOString(),
      });
      emit({ type: 'suggest', topics: decision.suggestions });
    });
  }

  return sendJson(res, 404, { error: 'Unknown ops resource.' });
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const resource = req.query?.resource || url.searchParams.get('resource') || 'dashboard';

    if (resource === 'network_probe') {
      if (req.method === 'GET') {
        const size = Math.min(262144, Math.max(1024, Number(url.searchParams.get('bytes') || 65536)));
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end('V'.repeat(size));
        return;
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req, 512 * 1024);
        const receivedBytes = typeof body?.payload === 'string' ? body.payload.length : 0;
        return sendJson(res, 200, { ok: true, receivedBytes, serverTs: Date.now() });
      }
    }

    const actor = await resolveActor(req);
    if (actor?.mode === 'local') {
      return await handleLocalOps(req, res, actor, resource);
    }
    if (!actor && getLocalDb()) {
      return sendJson(res, 401, { error: 'Sign in required.' });
    }

    const ctx = await authenticateRequest(req);

    if (resource === 'assistant' && req.method === 'POST') {
      await enforceRateLimit(ctx.supabase, `assistant:${ctx.userId}`, { maxRequests: 20, windowMs: 60_000 });
      const body = await readJsonBody(req);
      const parsed = assistantRequestSchema.safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0].message });

      const role = ctx.membership?.role || 'interpreter';
      const topic = matchTopic(parsed.data.question);

      return streamRoute(res, async (emit) => {
        emit({ type: 'meta', topic });
        emit({ type: 'step', step: 'records', status: 'run' });

        const [{ data: assignments }, { data: followups }, { data: billing }, { data: terms }] = await Promise.all([
          ctx.supabase.from('assignments').select('id, ref, status, start_at').eq('owner_id', ctx.userId).limit(50),
          ctx.supabase.from('followups').select('id, status, due_date').or(`proposer_id.eq.${ctx.userId},assignee_id.eq.${ctx.userId}`).limit(50),
          ctx.supabase.from('billing_records').select('id, status, amount_cents').eq('user_id', ctx.userId).limit(50),
          ctx.supabase.from('terms').select('id, label').eq('owner_id', ctx.userId).limit(20),
        ]);

        emit({ type: 'step', step: 'records', status: 'done', count: (assignments || []).length });

        const decision = evaluateAssistantRequest({
          ...parsed.data,
          role,
          records: {
            assignments: assignments || [],
            followups: followups || [],
            billing: billing || [],
            terms: terms || [],
          },
        });

        if (decision.auditType) {
          await ctx.supabase.from('audit_events').insert({
            actor_id: ctx.userId,
            org_id: ctx.membership?.org_id || null,
            area: 'assistant',
            type: decision.auditType,
            result: decision.refused ? 'denied' : 'ok',
            metadata: safeMeta({ topic }),
          });
        }

        for (const block of decision.blocks) {
          emit({ type: 'block', key: block.key, vars: block.vars });
        }
        emit({
          type: 'sources',
          reads: decision.reads,
          at: new Date().toISOString(),
        });
        emit({ type: 'suggest', topics: decision.suggestions });
      });
    }

    if (resource === 'quality' && req.method === 'GET') {
      if (ctx.membership) requireCapability(ctx, 'ops.quality.view');
      const scopeFilter = ctx.membership
        ? ctx.supabase.from('assignments').select('*').eq('org_id', ctx.membership.org_id)
        : ctx.supabase.from('assignments').select('*').eq('owner_id', ctx.userId);
      const { data: assignments } = await scopeFilter;
      const ids = (assignments || []).map((a) => a.id);
      const [{ data: events }, { data: checks }, { data: docs }, { data: followups }] = await Promise.all([
        ids.length ? ctx.supabase.from('assignment_events').select('*').in('assignment_id', ids) : { data: [] },
        ctx.supabase.from('device_checks').select('*').eq('user_id', ctx.userId),
        ids.length ? ctx.supabase.from('session_docs').select('*').in('assignment_id', ids) : { data: [] },
        ctx.supabase.from('followups').select('*').or(`proposer_id.eq.${ctx.userId},assignee_id.eq.${ctx.userId}`),
      ]);
      return sendJson(res, 200, {
        indicators: computeQualityIndicators({
          assignments: assignments || [],
          assignmentEvents: events || [],
          deviceChecks: checks || [],
          sessionDocs: docs || [],
          followups: followups || [],
        }),
      });
    }

    if (resource === 'reports' && req.method === 'GET') {
      const orgView = ctx.membership && can(ctx.membership.role, 'ops.org.view');
      const query = orgView
        ? ctx.supabase.from('assignments').select('*').eq('org_id', ctx.membership.org_id)
        : ctx.supabase.from('assignments').select('*').eq('owner_id', ctx.userId);
      const { data: assignments } = await query;
      return sendJson(res, 200, summarizeReports(assignments || []));
    }

    if (resource === 'billing') {
      if (req.method === 'GET') {
        const [{ data: settings }, { data: records }] = await Promise.all([
          ctx.supabase.from('billing_settings').select('*').eq('user_id', ctx.userId).maybeSingle(),
          ctx.supabase.from('billing_records').select('*').eq('user_id', ctx.userId).order('created_at', { ascending: false }),
        ]);
        return sendJson(res, 200, { settings: settings || null, records: records || [] });
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const parsed = billingRecordCreateSchema.safeParse(body);
        if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid billing entry' });
        const d = parsed.data;
        const { data: settings } = await ctx.supabase.from('billing_settings').select('*').eq('user_id', ctx.userId).maybeSingle();
        const rateCents = d.rate_cents ?? settings?.rate_cents ?? 0;
        const currency = d.currency || settings?.currency || 'USD';
        const calc = computeBillingAmountCents(d.minutes, rateCents, settings?.rules || {
          minimum_minutes: d.minimum_minutes,
          round_to_minutes: d.round_to_minutes,
        });
        const { data: rec, error } = await ctx.supabase
          .from('billing_records')
          .insert({
            user_id: ctx.userId,
            assignment_ref: d.assignment_ref || null,
            minutes: calc.minutes,
            rate_cents: rateCents,
            currency,
            amount_cents: calc.amount_cents,
            status: 'invoiced',
          })
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        return sendJson(res, 201, { data: rec });
      }
      if (req.method === 'PATCH') {
        const body = await readJsonBody(req);
        const parsed = billingMarkPaidSchema.safeParse(body);
        if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Billing record ID required.' });
        const { data: rec, error } = await ctx.supabase
          .from('billing_records')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', parsed.data.id)
          .eq('user_id', ctx.userId)
          .select('*')
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!rec) return sendJson(res, 404, { error: 'Billing record not found.' });
        return sendJson(res, 200, { data: rec });
      }
    }

    if (resource === 'device_check') {
      if (req.method === 'GET') {
        const { data, error } = await ctx.supabase
          .from('device_checks')
          .select('*')
          .eq('user_id', ctx.userId)
          .order('created_at', { ascending: false })
          .limit(20);
        if (error) throw new Error(error.message);
        return sendJson(res, 200, { data: data || [] });
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const parsed = deviceCheckCreateSchema.safeParse(body);
        if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid device check' });
        const { data: rec, error } = await ctx.supabase
          .from('device_checks')
          .insert({
            user_id: ctx.userId,
            result: parsed.data.result,
            figures: { latency_ms: parsed.data.latency_ms ?? null, peak_level: parsed.data.peak_level },
          })
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        return sendJson(res, 201, { data: rec });
      }
    }

    if (resource === 'diagnostics') {
      if (req.method === 'GET') {
        const { data, error } = await ctx.supabase
          .from('device_checks')
          .select('*')
          .eq('user_id', ctx.userId)
          .order('created_at', { ascending: false })
          .limit(30);
        if (error) throw new Error(error.message);
        return sendJson(res, 200, {
          data: (data || []).map((row) => ({
            id: row.id,
            profile: row.figures?.profile || 'video',
            score: Number(row.figures?.score ?? (row.result === 'pass' ? 100 : 50)),
            verdict: row.figures?.verdict || (row.result === 'pass' ? 'pass' : 'fail'),
            payload: row.figures || {},
            created_at: row.created_at,
          })),
        });
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const parsed = diagnosticsRunSchema.safeParse(body);
        if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid diagnostics run' });
        const { profile, score, verdict, payload } = parsed.data;
        const { data: rec, error } = await ctx.supabase
          .from('device_checks')
          .insert({
            user_id: ctx.userId,
            result: verdict === 'fail' ? 'fail' : 'pass',
            figures: { ...(payload || {}), profile, score, verdict },
          })
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        return sendJson(res, 201, { data: { id: rec.id, profile, score, verdict, payload, created_at: rec.created_at } });
      }
    }

    if (resource === 'availability') {
      if (req.method === 'GET') {
        const { data, error } = await ctx.supabase
          .from('availability_overrides')
          .select('*')
          .eq('user_id', ctx.userId)
          .order('date', { ascending: true });
        if (error) throw new Error(error.message);
        return sendJson(res, 200, {
          data: (data || []).map((row) => ({
            ...row,
            window_label: row.hours?.window_label || '',
          })),
        });
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const parsed = availabilityCreateSchema.safeParse(body);
        if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Valid YYYY-MM-DD date is required.' });
        const { data: saved, error } = await ctx.supabase
          .from('availability_overrides')
          .upsert(
            {
              user_id: ctx.userId,
              date: parsed.data.date,
              kind: parsed.data.kind,
              hours: { window_label: parsed.data.window_label },
            },
            { onConflict: 'user_id,date' }
          )
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        return sendJson(res, 201, { data: { ...saved, window_label: saved.hours?.window_label || '' } });
      }
      if (req.method === 'DELETE') {
        const url = new URL(req.url, 'http://localhost');
        const id = req.query?.id || url.searchParams.get('id');
        if (!id) return sendJson(res, 400, { error: 'Override ID is required.' });
        const { error } = await ctx.supabase.from('availability_overrides').delete().eq('id', id).eq('user_id', ctx.userId);
        if (error) throw new Error(error.message);
        return sendJson(res, 200, { ok: true });
      }
    }

    if (resource === 'profile') {
      if (req.method === 'GET') {
        const { data, error } = await ctx.supabase
          .from('profiles')
          .select('*')
          .eq('user_id', ctx.userId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return sendJson(res, 200, {
          data: data
            ? {
                id: ctx.userId,
                email: ctx.email,
                full_name: data.display_name || '',
                role: ctx.membership?.role || 'interpreter',
                locale: data.locale || 'en',
                time_zone: data.time_zone || 'UTC',
                language_pairs: Array.isArray(data.language_pairs) ? data.language_pairs.join(', ') : '',
                weekly_hours: data.weekly_hours ?? 30,
              }
            : {
                id: ctx.userId,
                email: ctx.email,
                full_name: '',
                role: ctx.membership?.role || 'interpreter',
                locale: 'en',
                time_zone: 'UTC',
                language_pairs: '',
                weekly_hours: 30,
              },
        });
      }
      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const parsed = profileUpdateSchema.safeParse(body);
        if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid profile update' });
        const d = parsed.data;
        const pairs = d.language_pairs !== undefined
          ? d.language_pairs.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined;
        const { data: saved, error } = await ctx.supabase
          .from('profiles')
          .upsert(
            {
              user_id: ctx.userId,
              ...(d.full_name !== undefined ? { display_name: d.full_name } : {}),
              ...(d.locale !== undefined ? { locale: d.locale } : {}),
              ...(d.time_zone !== undefined ? { time_zone: d.time_zone } : {}),
              ...(pairs !== undefined ? { language_pairs: pairs } : {}),
              ...(d.weekly_hours !== undefined ? { weekly_hours: d.weekly_hours } : {}),
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id' }
          )
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        return sendJson(res, 200, {
          data: {
            id: ctx.userId,
            email: ctx.email,
            full_name: saved.display_name || '',
            role: ctx.membership?.role || 'interpreter',
            locale: saved.locale || 'en',
            time_zone: saved.time_zone || 'UTC',
            language_pairs: Array.isArray(saved.language_pairs) ? saved.language_pairs.join(', ') : '',
            weekly_hours: saved.weekly_hours ?? 30,
          },
        });
      }
    }

    if (resource === 'audit' && req.method === 'GET') {
      let query = ctx.supabase.from('audit_events').select('*').order('id', { ascending: false }).limit(100);
      if (ctx.membership && can(ctx.membership.role, 'org.audit.view')) {
        query = query.eq('org_id', ctx.membership.org_id);
      } else if (!isAdminActor(ctx)) {
        query = query.eq('actor_id', ctx.userId);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return sendJson(res, 200, { data: data || [] });
    }

    if (resource === 'documentation' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const parsed = sessionDocSchema.safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0].message });
      const d = parsed.data;
      const { data: existing } = await ctx.supabase
        .from('session_docs')
        .select('*')
        .eq('assignment_id', d.assignment_id)
        .maybeSingle();

      if (existing && d.action === 'approve') {
        if (!canReviewDoc(existing, ctx)) {
          return sendJson(res, 403, { error: 'Cannot approve this documentation record.' });
        }
        const { data: updated } = await ctx.supabase
          .from('session_docs')
          .update({
            status: 'approved',
            reviewed_by: ctx.userId,
            reviewed_at: new Date().toISOString(),
            review_result: 'approved',
          })
          .eq('id', existing.id)
          .select('*')
          .single();
        return sendJson(res, 200, { data: updated });
      }

      if (existing && !canReadDoc(existing, ctx)) {
        return sendJson(res, 404, { error: 'Documentation not found.' });
      }

      const nextStatus = d.action === 'submit' ? 'submitted' : 'draft';
      const payload = {
        assignment_id: d.assignment_id,
        author_id: existing?.author_id || ctx.userId,
        org_id: ctx.membership?.org_id || null,
        encounter_type: d.encounter_type,
        mode: d.mode,
        intervention_counts: d.intervention_counts,
        flags: d.flags,
        process_note: d.process_note,
        status: nextStatus,
        submitted_at: nextStatus === 'submitted' ? new Date().toISOString() : existing?.submitted_at || null,
        updated_at: new Date().toISOString(),
      };
      const { data: saved, error } = await ctx.supabase
        .from('session_docs')
        .upsert(payload, { onConflict: 'assignment_id' })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return sendJson(res, 200, { data: saved });
    }

    return sendJson(res, 404, { error: 'Unknown ops resource.' });
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    return sendJson(res, 500, { error: 'Operations request failed.' });
  }
}
