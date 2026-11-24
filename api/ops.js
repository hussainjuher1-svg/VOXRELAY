import crypto from 'node:crypto';
import { resolveActor } from './_lib/auth-session.js';
import { evaluateAssistantRequest, matchTopic } from './_lib/assistant.js';
import { can, canReadDoc, canReviewDoc, HttpError, requireCapability } from './_lib/authz.js';
import { enforceRateLimit, readJsonBody, sendJson, streamRoute } from './_lib/core.js';
import { writeLocalAudit } from './_lib/local-db.js';
import { computeBillingAmountCents, computeQualityIndicators, summarizeReports } from './_lib/ops-metrics.js';
import { authenticateRequest } from './_lib/supabase.js';
import { assistantRequestSchema, safeMeta, sessionDocSchema } from './_lib/validate.js';

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
      const rateCents = Math.max(0, Math.round(Number(body.rate_cents ?? 0)));
      const calc = computeBillingAmountCents(body.minutes, rateCents, {
        minimum_minutes: body.minimum_minutes ?? 0,
        round_to_minutes: body.round_to_minutes ?? 1,
      });
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO billing_records (id, user_id, assignment_ref, minutes, rate_cents, currency, amount_cents, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'invoiced', ?)`
      ).run(id, userId, body.assignment_ref || null, calc.minutes, rateCents, String(body.currency || 'USD'), calc.amount_cents, now);
      const rec = db.prepare('SELECT * FROM billing_records WHERE id = ?').get(id);
      return sendJson(res, 201, { data: rec });
    }
    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (!body.id) return sendJson(res, 400, { error: 'Billing record ID required.' });
      db.prepare("UPDATE billing_records SET status = 'paid' WHERE id = ? AND user_id = ?").run(body.id, userId);
      const rec = db.prepare('SELECT * FROM billing_records WHERE id = ? AND user_id = ?').get(body.id, userId);
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
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const result = body.result === 'fail' ? 'fail' : 'pass';
      const latencyMs = Number.isFinite(Number(body.latency_ms)) ? Math.round(Number(body.latency_ms)) : null;
      const peakLevel = Math.min(100, Math.max(0, Math.round(Number(body.peak_level ?? 0))));
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
      const allowed = new Set(['clarification', 'pace_pause', 'technical_issue']);
      const type = allowed.has(body.type) ? body.type : 'clarification';
      const aid = String(body.assignment_id || assignmentId);
      const now = new Date().toISOString();
      const info = db
        .prepare('INSERT INTO session_events (assignment_id, actor_id, type, created_at) VALUES (?, ?, ?, ?)')
        .run(aid, userId, type, now);
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
      if (row) {
        db.prepare(
          'UPDATE local_users SET full_name = ?, locale = ?, time_zone = ?, language_pairs = ?, weekly_hours = ? WHERE id = ?'
        ).run(
          String(body.full_name ?? row.full_name).slice(0, 120),
          body.locale === 'ar' ? 'ar' : 'en',
          String(body.time_zone ?? row.time_zone).slice(0, 64),
          String(body.language_pairs ?? row.language_pairs).slice(0, 160),
          Math.min(100, Math.max(1, Math.round(Number(body.weekly_hours ?? row.weekly_hours)))),
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
      const date = String(body.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return sendJson(res, 400, { error: 'Valid YYYY-MM-DD date is required.' });
      }
      const kind = body.kind === 'custom' ? 'custom' : 'unavailable';
      const windowLabel = String(body.window_label || '').slice(0, 80);
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
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const profile = ['voice', 'video', 'full'].includes(body.profile) ? body.profile : 'video';
      const score = Math.min(100, Math.max(0, Math.round(Number(body.score ?? 0))));
      const verdict = ['pass', 'warn', 'fail'].includes(body.verdict) ? body.verdict : 'warn';
      const payloadJson = JSON.stringify(body.payload || {});
      db.prepare(
        `INSERT INTO diagnostics_runs (id, user_id, profile, score, verdict, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(id, userId, profile, score, verdict, payloadJson, now);
      writeLocalAudit(db, { actorId: userId, area: 'diagnostics', type: `run_${profile}`, objectRef: id, result: verdict });
      return sendJson(res, 201, { data: { id, profile, score, verdict, payload: body.payload || {}, created_at: now } });
    }
  }

  if (resource === 'audit' && req.method === 'GET') {
    const isAdmin = actor.user.role === 'platform_admin' || actor.user.role === 'org_admin';
    const rows = isAdmin
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
        const { data: settings } = await ctx.supabase.from('billing_settings').select('*').eq('user_id', ctx.userId).maybeSingle();
        const rateCents = Number(body.rate_cents ?? settings?.rate_cents ?? 0);
        const currency = String(body.currency || settings?.currency || 'USD');
        const calc = computeBillingAmountCents(body.minutes, rateCents, settings?.rules || {});
        const { data: rec, error } = await ctx.supabase
          .from('billing_records')
          .insert({
            user_id: ctx.userId,
            assignment_ref: body.assignment_ref || null,
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
