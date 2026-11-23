import { evaluateAssistantRequest, matchTopic } from './_lib/assistant.js';
import { can, canReadDoc, canReviewDoc, HttpError, requireCapability } from './_lib/authz.js';
import { enforceRateLimit, readJsonBody, sendJson, streamRoute } from './_lib/core.js';
import { computeBillingAmountCents, computeQualityIndicators, summarizeReports } from './_lib/ops-metrics.js';
import { authenticateRequest } from './_lib/supabase.js';
import { assistantRequestSchema, safeMeta, sessionDocSchema } from './_lib/validate.js';

export default async function handler(req, res) {
  try {
    const ctx = await authenticateRequest(req);
    const url = new URL(req.url, 'http://localhost');
    const resource = req.query?.resource || url.searchParams.get('resource') || 'dashboard';

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
