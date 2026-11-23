import crypto from 'node:crypto';
import { resolveActor } from './_lib/auth-session.js';
import { HttpError, requireCapability, serializeAssignment } from './_lib/authz.js';
import { readJsonBody, sendJson } from './_lib/core.js';
import { writeLocalAudit } from './_lib/local-db.js';
import { computeReadiness } from './_lib/readiness.js';
import { authenticateRequest } from './_lib/supabase.js';
import { assignmentCreateSchema, assignmentPatchSchema } from './_lib/validate.js';

const TRANSITIONS = {
  accept: { from: ['offered'], to: 'scheduled', event: 'offer_accepted', offerState: 'accepted' },
  decline: { from: ['offered'], to: 'cancelled', event: 'offer_declined', offerState: 'declined' },
  start_preparation: { from: ['scheduled', 'rescheduled'], to: 'preparation_required', event: 'preparation_started' },
  mark_ready: { from: ['preparation_required', 'scheduled', 'rescheduled'], event: 'marked_ready' },
  reschedule: { from: ['scheduled', 'preparation_required', 'ready', 'rescheduled'], to: 'rescheduled', event: 'rescheduled' },
  start_session: { from: ['scheduled', 'preparation_required', 'ready', 'rescheduled'], to: 'in_progress', event: 'session_started' },
  close_out: { from: ['in_progress'], to: 'completed', event: 'closed_out' },
  cancel: { from: ['scheduled', 'preparation_required', 'ready', 'rescheduled'], to: 'cancelled', event: 'cancelled' },
};

async function handleLocal(req, res, actor) {
  const db = actor.db;
  const url = new URL(req.url, 'http://localhost');
  const id = req.query?.id || url.searchParams.get('id');

  if (req.method === 'GET' && !id) {
    const rows = db.prepare('SELECT * FROM assignments WHERE owner_id = ? ORDER BY start_at ASC').all(actor.user.id);
    return sendJson(res, 200, {
      data: rows.map((r) => ({
        ...r,
        checklist: JSON.parse(r.checklist_json || '[]'),
      })),
    });
  }

  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const parsed = assignmentCreateSchema.safeParse(body);
    if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0].message });
    const d = parsed.data;
    const count = db.prepare('SELECT COUNT(*) AS c FROM assignments').get()?.c || 0;
    const ref = `VR-${String(count + 1).padStart(4, '0')}`;
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO assignments (id, ref, owner_id, start_at, duration_minutes, time_zone, language_pair, modality, category, status, checklist_json, personal_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)`
    ).run(
      newId,
      ref,
      actor.user.id,
      d.start_at,
      d.duration_minutes,
      d.time_zone,
      d.language_pair,
      d.modality,
      d.category,
      JSON.stringify(d.checklist),
      d.personal_note,
      now,
      now
    );
    writeLocalAudit(db, { actorId: actor.user.id, area: 'assignments', type: 'created', objectRef: ref, result: 'ok' });
    const created = db.prepare('SELECT * FROM assignments WHERE id = ?').get(newId);
    return sendJson(res, 201, { data: { ...created, checklist: JSON.parse(created.checklist_json || '[]') } });
  }

  if (req.method === 'PATCH' && id) {
    const row = db.prepare('SELECT * FROM assignments WHERE id = ? AND owner_id = ?').get(id, actor.user.id);
    if (!row) return sendJson(res, 404, { error: 'Assignment not found.' });
    const body = await readJsonBody(req);
    const parsed = assignmentPatchSchema.safeParse(body);
    if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0].message });
    const d = parsed.data;
    const rule = TRANSITIONS[d.action];
    if (!rule.from.includes(row.status)) {
      return sendJson(res, 409, { error: `Cannot ${d.action.replace('_', ' ')} while status is "${row.status}".` });
    }
    const nextStatus = rule.to || (d.action === 'mark_ready' ? 'ready' : row.status);
    const nextChecklist = d.checklist !== undefined ? JSON.stringify(d.checklist) : row.checklist_json;
    const nextNote = d.personal_note !== undefined ? d.personal_note : row.personal_note;
    const now = new Date().toISOString();
    db.prepare('UPDATE assignments SET status = ?, checklist_json = ?, personal_note = ?, updated_at = ? WHERE id = ?').run(
      nextStatus,
      nextChecklist,
      nextNote,
      now,
      id
    );
    const updated = db.prepare('SELECT * FROM assignments WHERE id = ?').get(id);
    return sendJson(res, 200, { data: { ...updated, checklist: JSON.parse(updated.checklist_json || '[]') } });
  }

  return sendJson(res, 405, { error: 'Method not allowed.' });
}

export default async function handler(req, res) {
  try {
    const actor = await resolveActor(req);
    if (actor?.mode === 'local') {
      return await handleLocal(req, res, actor);
    }

    const ctx = await authenticateRequest(req);
    const url = new URL(req.url, 'http://localhost');
    const id = req.query?.id || url.searchParams.get('id');

    if (req.method === 'GET' && !id) {
      const scope = req.query?.scope || url.searchParams.get('scope');
      let query = ctx.supabase.from('assignments').select('*').order('start_at', { ascending: true });
      if (scope === 'org' && ctx.membership && ['owner', 'admin', 'coordinator'].includes(ctx.membership.role)) {
        query = query.eq('org_id', ctx.membership.org_id);
      } else {
        query = query.eq('owner_id', ctx.userId);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return sendJson(res, 200, { data: (data || []).map((row) => serializeAssignment(row, ctx.userId)) });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const parsed = assignmentCreateSchema.safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0].message });
      const d = parsed.data;

      let ownerId = ctx.userId;
      let status = 'scheduled';
      let offerState = null;

      if (d.org_id) {
        if (!ctx.membership || ctx.membership.org_id !== d.org_id) {
          return sendJson(res, 404, { error: 'Organization not found.' });
        }
        requireCapability(ctx, 'org.offers.create');
        if (d.assignee_user_id && d.assignee_user_id !== ctx.userId) {
          const { data: target } = await ctx.supabase
            .from('memberships')
            .select('user_id')
            .eq('org_id', d.org_id)
            .eq('user_id', d.assignee_user_id)
            .eq('status', 'active')
            .maybeSingle();
          if (!target) return sendJson(res, 404, { error: 'Member not found in this organization.' });
          ownerId = d.assignee_user_id;
          status = 'offered';
          offerState = 'pending';
        }
      }

      const { count } = await ctx.supabase.from('assignments').select('id', { count: 'exact', head: true });
      const ref = `VR-${String((count || 0) + 1).padStart(4, '0')}`;

      const { data: created, error } = await ctx.supabase
        .from('assignments')
        .insert({
          ref,
          owner_id: ownerId,
          org_id: d.org_id || null,
          start_at: d.start_at,
          duration_minutes: d.duration_minutes,
          time_zone: d.time_zone,
          language_pair: d.language_pair,
          modality: d.modality,
          category: d.category,
          status,
          offer_state: offerState,
          checklist: d.checklist,
          personal_note: d.personal_note,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      await ctx.supabase.from('assignment_events').insert({
        assignment_id: created.id,
        actor_id: ctx.userId,
        type: status === 'offered' ? 'offer_created' : 'created',
        metadata: { ref },
      });

      return sendJson(res, 201, { data: serializeAssignment(created, ctx.userId) });
    }

    if (!id) return sendJson(res, 400, { error: 'Assignment ID is required.' });

    const { data: assignment } = await ctx.supabase.from('assignments').select('*').eq('id', id).maybeSingle();
    if (!assignment) return sendJson(res, 404, { error: 'Assignment not found.' });

    const isOwner = assignment.owner_id === ctx.userId;
    const isOrgStaff = Boolean(
      assignment.org_id &&
        ctx.membership?.org_id === assignment.org_id &&
        ['owner', 'admin', 'coordinator'].includes(ctx.membership.role)
    );
    if (!isOwner && !isOrgStaff) return sendJson(res, 404, { error: 'Assignment not found.' });

    if (req.method === 'GET') {
      const [{ data: events }, { data: checks }] = await Promise.all([
        ctx.supabase.from('assignment_events').select('*').eq('assignment_id', id).order('created_at', { ascending: true }),
        ctx.supabase.from('device_checks').select('*').eq('user_id', assignment.owner_id).order('created_at', { ascending: false }).limit(5),
      ]);
      const readiness = computeReadiness({
        checklist: assignment.checklist,
        deviceChecks: checks || [],
        assignmentId: assignment.id,
        startAt: assignment.start_at,
      });
      return sendJson(res, 200, { data: serializeAssignment(assignment, ctx.userId), events: events || [], readiness });
    }

    if (req.method === 'PATCH') {
      if (!isOwner) return sendJson(res, 403, { error: 'Only the assigned interpreter can update this stage.' });

      const body = await readJsonBody(req);
      const parsed = assignmentPatchSchema.safeParse(body);
      if (!parsed.success) return sendJson(res, 400, { error: parsed.error.issues[0].message });
      const d = parsed.data;
      const rule = TRANSITIONS[d.action];

      if (!rule.from.includes(assignment.status)) {
        return sendJson(res, 409, { error: `Cannot ${d.action.replace('_', ' ')} while status is "${assignment.status}".` });
      }

      const patch = { updated_at: new Date().toISOString() };
      if (rule.to) patch.status = rule.to;
      if (rule.offerState) patch.offer_state = rule.offerState;
      if (d.action === 'start_session') patch.started_at = new Date().toISOString();
      if (d.action === 'close_out') {
        if (!d.exception_category) return sendJson(res, 400, { error: 'Close-out requires an exception category.' });
        patch.exception_category = d.exception_category;
        patch.ended_at = new Date().toISOString();
      }
      if (d.action === 'reschedule') {
        if (!d.start_at && !d.duration_minutes) return sendJson(res, 400, { error: 'Provide a new start or duration.' });
        if (d.start_at) patch.start_at = d.start_at;
        if (d.duration_minutes) patch.duration_minutes = d.duration_minutes;
      }
      if (d.checklist !== undefined) patch.checklist = d.checklist;
      if (d.personal_note !== undefined) patch.personal_note = d.personal_note;

      if (d.action === 'mark_ready') {
        const { data: checks } = await ctx.supabase
          .from('device_checks')
          .select('*')
          .eq('user_id', assignment.owner_id)
          .order('created_at', { ascending: false })
          .limit(5);
        const readiness = computeReadiness({
          checklist: patch.checklist ?? assignment.checklist,
          deviceChecks: checks || [],
          assignmentId: id,
          startAt: assignment.start_at,
        });
        patch.status = readiness.ready ? 'ready' : 'preparation_required';
      }

      const { data: updated, error } = await ctx.supabase.from('assignments').update(patch).eq('id', id).select('*').single();
      if (error) throw new Error(error.message);

      await ctx.supabase.from('assignment_events').insert({
        assignment_id: id,
        actor_id: ctx.userId,
        type: rule.event,
        metadata: d.exception_category ? { exception_category: d.exception_category } : {},
      });

      return sendJson(res, 200, { data: serializeAssignment(updated, ctx.userId) });
    }

    return sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    return sendJson(res, 500, { error: 'Unable to process assignment request.' });
  }
}
