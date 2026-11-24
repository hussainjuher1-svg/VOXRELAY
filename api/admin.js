import crypto from 'node:crypto';
import { z } from 'zod';
import { resolveActor } from './_lib/auth-session.js';
import { readJsonBody, sendJson } from './_lib/core.js';
import { buildInviteEmail } from './_lib/email-templates.js';
import { enqueueOutboxEmail, getLocalDb, hashSecret, writeLocalAudit } from './_lib/local-db.js';

const reviewSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(['approve', 'reject']),
  note: z.string().max(400).optional().default(''),
});

export default async function handler(req, res) {
  const actor = await resolveActor(req);
  if (!actor) {
    return sendJson(res, 401, { error: 'Sign in to access the review queue.' });
  }

  const db = getLocalDb();
  if (!db) {
    return sendJson(res, 503, { error: 'Local review queue unavailable in serverless mode.' });
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
