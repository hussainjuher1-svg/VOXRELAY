import crypto from 'node:crypto';
import { z } from 'zod';
import { resolveActor } from './_lib/auth-session.js';
import { HttpError, isAdminActor } from './_lib/authz.js';
import { readJsonBody, sendJson } from './_lib/core.js';
import { buildInviteEmail } from './_lib/email-templates.js';
import { enqueueOutboxEmail, getLocalDb, hashSecret, writeLocalAudit } from './_lib/local-db.js';
import { authenticateRequest } from './_lib/supabase.js';

const reviewSchema = z.object({
  id: z.union([z.string().min(1), z.number().int().positive()]).transform((v) => String(v)),
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(400).optional().default(''),
});

export default async function handler(req, res) {
  try {
    const actor = await resolveActor(req);
    const db = actor?.mode === 'local' ? actor.db : getLocalDb();

    if (db) {
      if (!actor) {
        return sendJson(res, 401, { error: 'Sign in to access the review queue.' });
      }
      if (!isAdminActor(actor)) {
        return sendJson(res, 403, { error: 'Administrator permission required.' });
      }

      if (req.method === 'GET') {
        const requests = db
          .prepare(
            `SELECT id, full_name, work_email, role, organization, country, languages, message, status, reviewer_note, created_at
             FROM access_requests ORDER BY created_at DESC LIMIT 100`
          )
          .all();
        const outbox = db
          .prepare(
            `SELECT id, to_email, locale, kind, subject, text_body, created_at
             FROM email_outbox ORDER BY created_at DESC LIMIT 50`
          )
          .all();
        const audit = db
          .prepare('SELECT id, actor_id, area, type, object_ref, result, created_at FROM audit_events ORDER BY id DESC LIMIT 50')
          .all();
        return sendJson(res, 200, { requests, outbox, audit });
      }

      if (req.method === 'POST') {
        const body = await readJsonBody(req);
        const parsed = reviewSchema.safeParse(body);
        if (!parsed.success) {
          return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid review request' });
        }

        const reqRow = db.prepare('SELECT * FROM access_requests WHERE id = ?').get(parsed.data.id);
        if (!reqRow) return sendJson(res, 404, { error: 'Access request not found.' });

        if (parsed.data.decision === 'reject') {
          db.prepare("UPDATE access_requests SET status = 'rejected', reviewer_note = ? WHERE id = ?").run(
            parsed.data.note,
            reqRow.id
          );
          writeLocalAudit(db, {
            actorId: actor.user.id,
            area: 'admin',
            type: 'access_request_rejected',
            objectRef: reqRow.id,
            result: 'rejected',
          });
          return sendJson(res, 200, { ok: true, status: 'rejected' });
        }

        const rawInvite = crypto.randomBytes(24).toString('base64url');
        const inviteHash = hashSecret(rawInvite);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const origin = process.env.APP_ORIGIN || 'http://localhost:5173';
        const inviteUrl = `${origin}/login?invite=${encodeURIComponent(rawInvite)}`;

        db.prepare(
          "UPDATE access_requests SET status = 'approved', reviewer_note = ?, invite_token_hash = ?, invite_expires_at = ? WHERE id = ?"
        ).run(parsed.data.note, inviteHash, expiresAt, reqRow.id);

        const inviteEmail = buildInviteEmail({
          locale: 'en',
          fullName: reqRow.full_name,
          inviteUrl,
          role: reqRow.role,
        });
        enqueueOutboxEmail(db, {
          toEmail: reqRow.work_email,
          locale: 'en',
          kind: 'invite',
          ...inviteEmail,
        });

        writeLocalAudit(db, {
          actorId: actor.user.id,
          area: 'admin',
          type: 'access_request_approved',
          objectRef: reqRow.id,
          result: 'approved',
        });

        return sendJson(res, 200, { ok: true, status: 'approved', inviteUrl });
      }

      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const ctx = await authenticateRequest(req);
    if (!isAdminActor(ctx)) {
      return sendJson(res, 403, { error: 'Administrator permission required.' });
    }

    if (req.method === 'GET') {
      const [{ data: requests, error: reqErr }, { data: audit, error: auditErr }] = await Promise.all([
        ctx.supabase
          .from('access_requests')
          .select('id, name, email, audience, organization, country, languages, message, consent, status, reviewer_note, reviewed_at, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        ctx.supabase
          .from('audit_events')
          .select('id, actor_id, area, type, object_ref, result, created_at')
          .order('id', { ascending: false })
          .limit(50),
      ]);
      if (reqErr) throw new Error(reqErr.message);
      if (auditErr) throw new Error(auditErr.message);
      return sendJson(res, 200, {
        requests: (requests || []).map((r) => ({
          id: String(r.id),
          full_name: r.name,
          work_email: r.email,
          role: r.audience,
          organization: r.organization,
          country: r.country,
          languages: r.languages,
          message: r.message,
          status: r.status,
          reviewer_note: r.reviewer_note,
          created_at: r.created_at,
        })),
        outbox: [],
        audit: audit || [],
      });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const parsed = reviewSchema.safeParse(body);
      if (!parsed.success) {
        return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid review request' });
      }

      const numericId = Number(parsed.data.id);
      if (!Number.isInteger(numericId) || numericId <= 0) {
        return sendJson(res, 400, { error: 'Invalid access request ID.' });
      }

      const { data: reqRow, error: lookupErr } = await ctx.supabase
        .from('access_requests')
        .select('*')
        .eq('id', numericId)
        .maybeSingle();
      if (lookupErr) throw new Error(lookupErr.message);
      if (!reqRow) return sendJson(res, 404, { error: 'Access request not found.' });

      const now = new Date().toISOString();

      if (parsed.data.decision === 'reject') {
        const { error: updErr } = await ctx.supabase
          .from('access_requests')
          .update({
            status: 'rejected',
            reviewer_note: parsed.data.note,
            reviewed_by: ctx.userId,
            reviewed_at: now,
            invite_token_hash: null,
          })
          .eq('id', numericId);
        if (updErr) throw new Error(updErr.message);

        await ctx.supabase.from('audit_events').insert({
          actor_id: ctx.userId,
          org_id: ctx.membership?.org_id || null,
          area: 'admin',
          type: 'access_request_rejected',
          object_ref: String(numericId),
          result: 'rejected',
        });

        return sendJson(res, 200, { ok: true, status: 'rejected' });
      }

      const rawInvite = crypto.randomBytes(24).toString('base64url');
      const inviteHash = hashSecret(rawInvite);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const origin = process.env.APP_ORIGIN || 'https://voxrelay.vercel.app';
      const inviteUrl = `${origin}/login?invite=${encodeURIComponent(rawInvite)}`;

      const { error: updErr } = await ctx.supabase
        .from('access_requests')
        .update({
          status: 'approved',
          reviewer_note: parsed.data.note,
          reviewed_by: ctx.userId,
          reviewed_at: now,
          invite_token_hash: inviteHash,
          invite_expires_at: expiresAt,
        })
        .eq('id', numericId);
      if (updErr) throw new Error(updErr.message);

      await ctx.supabase.from('audit_events').insert({
        actor_id: ctx.userId,
        org_id: ctx.membership?.org_id || null,
        area: 'admin',
        type: 'access_request_approved',
        object_ref: String(numericId),
        result: 'approved',
      });

      return sendJson(res, 200, { ok: true, status: 'approved', inviteUrl });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    return sendJson(res, 500, { error: 'Admin review request failed.' });
  }
}
