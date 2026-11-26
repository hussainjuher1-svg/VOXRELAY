import crypto from 'node:crypto';
import { z } from 'zod';
import { enforceSameOrigin, resolveActor } from './_lib/auth-session.js';
import { HttpError, isPlatformAdminActor } from './_lib/authz.js';
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
  if (!['GET','HEAD','OPTIONS'].includes(String(req.method||'GET').toUpperCase())) enforceSameOrigin(req);
  try {
    const actor = await resolveActor(req, res);
    const db = actor?.mode === 'local' ? actor.db : getLocalDb();

    if (db) {
      if (!actor) {
        return sendJson(res, 401, { error: 'Sign in to access the review queue.' });
      }
      if (!isPlatformAdminActor(actor)) {
        return sendJson(res, 403, { error: 'Platform administrator permission required.' });
      }

      if (req.method === 'GET') {
        const requests = db
          .prepare(
            `SELECT id, full_name, work_email, role, organization, country, languages, message, status, reviewer_note, org_id, created_at
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

        const rawInvite = parsed.data.decision === 'approve' ? crypto.randomBytes(24).toString('base64url') : null;
        const inviteHash = rawInvite ? hashSecret(rawInvite) : null;
        const expiresAt = rawInvite ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null;
        const origin = process.env.APP_ORIGIN || 'http://localhost:5173';
        const inviteUrl = rawInvite ? `${origin}/login?invite=${encodeURIComponent(rawInvite)}` : null;

        db.exec('BEGIN IMMEDIATE');
        let reqRow;
        let provisionedOrgId = null;
        try {
          reqRow = db.prepare('SELECT * FROM access_requests WHERE id = ?').get(parsed.data.id);
          if (!reqRow) {
            db.exec('ROLLBACK');
            return sendJson(res, 404, { error: 'Access request not found.' });
          }
          if (reqRow.status !== 'pending') {
            db.exec('ROLLBACK');
            return sendJson(res, 409, { error: `Access request has already been ${reqRow.status}.` });
          }

          if (parsed.data.decision === 'reject') {
            const upd = db
              .prepare(
                "UPDATE access_requests SET status = 'rejected', reviewer_note = ?, invite_token_hash = NULL, invite_expires_at = NULL WHERE id = ? AND status = 'pending'"
              )
              .run(parsed.data.note, reqRow.id);
            if (upd.changes !== 1) {
              db.exec('ROLLBACK');
              return sendJson(res, 409, { error: 'Access request has already been reviewed.' });
            }
            writeLocalAudit(db, {
              actorId: actor.user.id,
              area: 'admin',
              type: 'access_request_rejected',
              objectRef: reqRow.id,
              result: 'rejected',
            });
            db.exec('COMMIT');
            return sendJson(res, 200, { ok: true, status: 'rejected' });
          }

          if (reqRow.role === 'organization') {
            provisionedOrgId = reqRow.org_id || crypto.randomUUID();
            if (!reqRow.org_id) {
              const orgName = String(reqRow.organization || '').trim().slice(0, 120) || `Organization ${provisionedOrgId.slice(0, 8)}`;
              db.prepare('INSERT INTO organizations (id, name, created_by, created_at) VALUES (?, ?, ?, ?)').run(
                provisionedOrgId,
                orgName,
                actor.user.id,
                new Date().toISOString()
              );
            }
          }

          const upd = db
            .prepare(
              "UPDATE access_requests SET status = 'approved', reviewer_note = ?, invite_token_hash = ?, invite_expires_at = ?, org_id = ? WHERE id = ? AND status = 'pending'"
            )
            .run(parsed.data.note, inviteHash, expiresAt, provisionedOrgId, reqRow.id);
          if (upd.changes !== 1) {
            db.exec('ROLLBACK');
            return sendJson(res, 409, { error: 'Access request has already been reviewed.' });
          }

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

          db.exec('COMMIT');
        } catch (err) {
          try {
            db.exec('ROLLBACK');
          } catch {
            // already rolled back
          }
          throw err;
        }

        return sendJson(res, 200, { ok: true, status: 'approved', inviteUrl, orgId: provisionedOrgId });
      }

      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const ctx = await authenticateRequest(req, res, actor);
    if (!isPlatformAdminActor(ctx)) {
      return sendJson(res, 403, { error: 'Platform administrator permission required.' });
    }

    if (req.method === 'GET') {
      const [{ data: requests, error: reqErr }, { data: audit, error: auditErr }] = await Promise.all([
        ctx.supabase
          .from('access_requests')
          .select('id, name, email, audience, organization, country, languages, message, consent, status, reviewer_note, reviewed_at, org_id, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        ctx.supabase
          .from('audit_events')
          .select('id, actor_id, org_id, area, type, object_ref, result, created_at')
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
          org_id: r.org_id || null,
          created_at: r.created_at,
        })),
        outbox: [],
        emailDelivery: 'manual',
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

      const rawInvite = parsed.data.decision === 'approve' ? crypto.randomBytes(24).toString('base64url') : null;
      const inviteHash = rawInvite ? hashSecret(rawInvite) : null;
      const expiresAt = rawInvite ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() : null;
      const origin = process.env.APP_ORIGIN || 'https://voxrelay.vercel.app';
      const inviteUrl = rawInvite ? `${origin}/login?invite=${encodeURIComponent(rawInvite)}` : null;

      // Organization creation, request lock/transition, and audit_events insert
      // all happen inside the single transactional review_access_request RPC.
      const { data: rpcResult, error: rpcErr } = await ctx.supabase.rpc('review_access_request', {
        p_request_id: numericId,
        p_decision: parsed.data.decision,
        p_note: parsed.data.note,
        p_reviewer_id: ctx.userId,
        p_invite_hash: inviteHash,
        p_invite_expires_at: expiresAt,
      });

      if (rpcErr) {
        throw new Error(rpcErr.message);
      }

      if (!rpcResult?.ok) {
        if (rpcResult?.code === 'not_found') {
          return sendJson(res, 404, { error: 'Access request not found.' });
        }
        if (rpcResult?.code === 'already_reviewed') {
          return sendJson(res, 409, { error: 'Access request has already been reviewed.' });
        }
        throw new Error('Unable to complete review transition.');
      }

      if (parsed.data.decision === 'reject') {
        return sendJson(res, 200, { ok: true, status: 'rejected' });
      }

      return sendJson(res, 200, {
        ok: true,
        status: 'approved',
        inviteUrl,
        orgId: rpcResult.org_id || null,
        emailDispatched: false,
        note: 'Share the generated invite URL manually; automated email delivery is not configured.',
      });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    return sendJson(res, 500, { error: 'Admin review request failed.' });
  }
}
