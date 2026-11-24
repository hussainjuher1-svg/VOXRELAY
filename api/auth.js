import crypto from 'node:crypto';
import { z } from 'zod';
import { clearSessionCookie, createLocalSession, resolveActor, setSessionCookie } from './_lib/auth-session.js';
import { HttpError } from './_lib/authz.js';
import { readJsonBody, sendJson } from './_lib/core.js';
import { enqueueOutboxEmail, getLocalDb, hashPassword, hashSecret, verifyPassword, writeLocalAudit } from './_lib/local-db.js';

const BREACHED_PASSWORDS = new Set([
  'password1234',
  'password12345',
  '123456789012',
  'qwertyuiopas',
  'letmein12345',
  'admin1234567',
  'welcome12345',
  'voxrelay1234',
]);

const authActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('signup'),
    email: z.string().trim().email().max(160),
    password: z.string().min(12, 'Use at least 12 characters for your password.').max(128),
    fullName: z.string().trim().max(120).optional().default(''),
    role: z.enum(['interpreter', 'org_admin']).optional().default('interpreter'),
    inviteToken: z.string().max(160).optional(),
  }),
  z.object({
    action: z.literal('signin'),
    email: z.string().trim().email().max(160),
    password: z.string().min(1).max(128),
  }),
  z.object({
    action: z.literal('signout'),
  }),
  z.object({
    action: z.literal('revoke_session'),
    sessionId: z.string().min(1).max(120),
  }),
  z.object({
    action: z.literal('revoke_all'),
  }),
]);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const actor = await resolveActor(req);
    if (!actor) return sendJson(res, 200, { authenticated: false, user: null, sessions: [] });

    let sessions = [];
    if (actor.mode === 'local' && actor.db) {
      sessions = actor.db
        .prepare('SELECT id, user_agent, expires_at, created_at FROM local_sessions WHERE user_id = ? ORDER BY created_at DESC')
        .all(actor.user.id)
        .map((s) => ({ ...s, isCurrent: s.id === actor.sessionId }));
    }
    return sendJson(res, 200, { authenticated: true, mode: actor.mode, user: actor.user, sessions });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(req);
    const parsed = authActionSchema.safeParse(body);
    if (!parsed.success) {
      return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid auth request' });
    }

    const db = getLocalDb();
    if (!db) {
      return sendJson(res, 503, { error: 'Local authentication unavailable in serverless mode; use Supabase Auth.' });
    }

    const data = parsed.data;
    const ua = req.headers['user-agent'] || 'Browser';

    if (data.action === 'signout') {
      const actor = await resolveActor(req);
      if (actor?.mode === 'local' && actor.sessionId) {
        db.prepare('DELETE FROM local_sessions WHERE id = ?').run(actor.sessionId);
        writeLocalAudit(db, { actorId: actor.user.id, area: 'auth', type: 'signout', result: 'ok' });
      }
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    if (data.action === 'revoke_session') {
      const actor = await resolveActor(req);
      if (!actor) return sendJson(res, 401, { error: 'Authentication required.' });
      if (actor.mode === 'local') {
        db.prepare('DELETE FROM local_sessions WHERE id = ? AND user_id = ?').run(data.sessionId, actor.user.id);
        writeLocalAudit(db, { actorId: actor.user.id, area: 'auth', type: 'revoke_session', result: 'ok' });
        if (actor.sessionId === data.sessionId) {
          clearSessionCookie(res);
        }
      }
      return sendJson(res, 200, { ok: true });
    }

    if (data.action === 'revoke_all') {
      const actor = await resolveActor(req);
      if (!actor) return sendJson(res, 401, { error: 'Authentication required.' });
      if (actor.mode === 'local') {
        db.prepare('DELETE FROM local_sessions WHERE user_id = ?').run(actor.user.id);
        writeLocalAudit(db, { actorId: actor.user.id, area: 'auth', type: 'revoke_all_sessions', result: 'ok' });
      }
      clearSessionCookie(res);
      return sendJson(res, 200, { ok: true });
    }

    if (data.action === 'signup') {
      if (BREACHED_PASSWORDS.has(data.password.toLowerCase())) {
        return sendJson(res, 400, { error: 'This password appears in known breaches. Choose a stronger passphrase.' });
      }
      const email = data.email.toLowerCase();
      const existing = db.prepare('SELECT id FROM local_users WHERE email = ?').get(email);
      if (existing) {
        return sendJson(res, 409, { error: 'An account with that email already exists.' });
      }

      let assignedRole = 'interpreter';
      let redeemedInviteId = null;
      if (data.inviteToken) {
        const tokenHash = hashSecret(data.inviteToken);
        const invite = db
          .prepare("SELECT id, role, invite_expires_at FROM access_requests WHERE invite_token_hash = ? AND status = 'approved'")
          .get(tokenHash);
        if (!invite || (invite.invite_expires_at && new Date(invite.invite_expires_at).getTime() <= Date.now())) {
          return sendJson(res, 400, { error: 'Invite link is invalid or expired.' });
        }
        assignedRole = invite.role === 'organization' ? 'org_admin' : 'interpreter';
        redeemedInviteId = invite.id;
      } else {
        // First local user gets platform_admin capability so admin review queue can be tested immediately
        const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM local_users').get()?.c || 0;
        if (totalUsers === 0) assignedRole = 'platform_admin';
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO local_users (id, email, full_name, role, password_hash, locale, created_at)
         VALUES (?, ?, ?, ?, ?, 'en', ?)`
      ).run(id, email, data.fullName || '', assignedRole, hashPassword(data.password), now);

      if (redeemedInviteId) {
        db.prepare("UPDATE access_requests SET status = 'redeemed', invite_token_hash = NULL WHERE id = ?").run(
          redeemedInviteId
        );
      }

      const session = createLocalSession(db, id, ua);
      setSessionCookie(res, session.rawToken);

      enqueueOutboxEmail(db, {
        toEmail: email,
        locale: 'en',
        kind: 'welcome',
        subject: 'Welcome to VOXRELAY',
        textBody: `Your VOXRELAY workspace account (${assignedRole}) is active.`,
        htmlBody: `<p>Your VOXRELAY workspace account (<strong>${assignedRole}</strong>) is active.</p>`,
      });

      writeLocalAudit(db, { actorId: id, area: 'auth', type: 'signup', result: 'ok' });

      return sendJson(res, 201, {
        ok: true,
        user: { id, email, full_name: data.fullName || '', role: assignedRole },
      });
    }

    if (data.action === 'signin') {
      const email = data.email.toLowerCase();
      const user = db.prepare('SELECT * FROM local_users WHERE email = ?').get(email);
      if (!user) {
        return sendJson(res, 401, { error: 'Invalid email or password.' });
      }
      if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
        return sendJson(res, 429, { error: 'Account temporarily locked due to repeated failed attempts. Try again shortly.' });
      }
      if (!verifyPassword(data.password, user.password_hash)) {
        const attempts = (user.failed_attempts || 0) + 1;
        const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
        db.prepare('UPDATE local_users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(attempts, lockedUntil, user.id);
        writeLocalAudit(db, {
          actorId: user.id,
          area: 'auth',
          type: lockedUntil ? 'account_locked' : 'signin_failed',
          result: 'denied',
        });
        return sendJson(res, 401, { error: 'Invalid email or password.' });
      }

      db.prepare('UPDATE local_users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);
      const session = createLocalSession(db, user.id, ua);
      setSessionCookie(res, session.rawToken);
      writeLocalAudit(db, { actorId: user.id, area: 'auth', type: 'signin', result: 'ok' });

      return sendJson(res, 200, {
        ok: true,
        user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
      });
    }
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    return sendJson(res, 500, { error: 'Authentication error.' });
  }
}
