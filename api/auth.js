import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { clearSessionCookie, createLocalSession, resolveActor, setSessionCookie } from './_lib/auth-session.js';
import { HttpError } from './_lib/authz.js';
import { readJsonBody, sendJson } from './_lib/core.js';
import { enqueueOutboxEmail, getLocalDb, hashPassword, hashSecret, verifyPassword, writeLocalAudit } from './_lib/local-db.js';
import { getServiceClient, getSupabaseConfig } from './_lib/supabase.js';

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

async function handleSupabaseSignup(data, res) {
  const service = getServiceClient();
  if (!service) {
    return sendJson(res, 503, { error: 'Authentication service is not configured.' });
  }
  if (BREACHED_PASSWORDS.has(data.password.toLowerCase())) {
    return sendJson(res, 400, { error: 'This password appears in known breaches. Choose a stronger passphrase.' });
  }

  const email = data.email.toLowerCase();
  let claimed = null;

  if (data.inviteToken) {
    const { data: claimRes, error: claimErr } = await service.rpc('claim_access_invite', {
      p_token_hash: hashSecret(data.inviteToken),
      p_email: email,
    });
    if (claimErr) {
      throw new Error(claimErr.message);
    }
    if (!claimRes?.ok) {
      if (claimRes?.code === 'email_mismatch') {
        return sendJson(res, 403, { error: 'This invitation was issued for a different email address.' });
      }
      if (claimRes?.code === 'expired') {
        return sendJson(res, 400, { error: 'Invite link has expired.' });
      }
      return sendJson(res, 400, { error: 'Invite link is invalid, expired, or already used.' });
    }
    claimed = claimRes;
  }

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password: data.password,
    email_confirm: false,
    user_metadata: { full_name: data.fullName || '' },
    app_metadata: { role: 'interpreter' },
  });

  if (createErr || !created?.user) {
    const msg = createErr?.message || '';
    if (/already.*registered|already.*exists|duplicate/i.test(msg)) {
      return sendJson(res, 409, { error: 'An account with that email already exists.' });
    }
    throw new Error(msg || 'Unable to provision account.');
  }

  const userId = created.user.id;
  let assignedOrgRole = 'interpreter';

  if (claimed?.org_id) {
    assignedOrgRole = claimed.approved_role === 'admin' ? 'admin' : 'interpreter';
    const { error: memErr } = await service.from('memberships').insert({
      org_id: claimed.org_id,
      user_id: userId,
      role: assignedOrgRole,
      status: 'active',
    });
    if (memErr) {
      await service.auth.admin.deleteUser(userId);
      throw new Error(memErr.message);
    }
  }

  const { error: auditErr } = await service.from('audit_events').insert({
    actor_id: userId,
    org_id: claimed?.org_id || null,
    area: 'auth',
    type: claimed ? 'invite_signup' : 'signup',
    object_ref: claimed ? String(claimed.id) : null,
    result: 'ok',
  });
  if (auditErr) {
    await service.auth.admin.deleteUser(userId);
    throw new Error(auditErr.message);
  }

  // Trigger Supabase confirmation email when anon key is available
  const { url, anonKey } = getSupabaseConfig();
  if (url && anonKey) {
    const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    await anon.auth.resend({ type: 'signup', email }).catch(() => {});
  }

  return sendJson(res, 201, {
    ok: true,
    requiresConfirmation: true,
    user: {
      id: userId,
      email,
      full_name: data.fullName || '',
      role: 'interpreter',
      org_id: claimed?.org_id || null,
      org_role: claimed?.org_id ? assignedOrgRole : null,
    },
  });
}

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
    return sendJson(res, 200, {
      authenticated: true,
      mode: actor.mode,
      user: actor.user,
      membership: actor.membership || null,
      sessions,
    });
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

    const data = parsed.data;
    const db = getLocalDb();

    if (!db) {
      if (data.action === 'signup') {
        return await handleSupabaseSignup(data, res);
      }
      return sendJson(res, 503, { error: 'Local authentication unavailable in serverless mode; use Supabase Auth.' });
    }

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
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      let assignedRole = 'interpreter';
      let assignedOrgId = null;

      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = db.prepare('SELECT id FROM local_users WHERE email = ?').get(email);
        if (existing) {
          db.exec('ROLLBACK');
          return sendJson(res, 409, { error: 'An account with that email already exists.' });
        }

        if (data.inviteToken) {
          const tokenHash = hashSecret(data.inviteToken);
          const invite = db
            .prepare(
              'SELECT id, work_email, role, status, invite_expires_at, org_id FROM access_requests WHERE invite_token_hash = ?'
            )
            .get(tokenHash);
          if (!invite || invite.status !== 'approved') {
            db.exec('ROLLBACK');
            return sendJson(res, 400, { error: 'Invite link is invalid, expired, or already used.' });
          }
          if (invite.invite_expires_at && new Date(invite.invite_expires_at).getTime() <= Date.now()) {
            db.exec('ROLLBACK');
            return sendJson(res, 400, { error: 'Invite link has expired.' });
          }
          if (String(invite.work_email || '').trim().toLowerCase() !== email) {
            db.exec('ROLLBACK');
            return sendJson(res, 403, { error: 'This invitation was issued for a different email address.' });
          }

          const claim = db
            .prepare(
              "UPDATE access_requests SET status = 'redeemed', invite_token_hash = NULL WHERE id = ? AND status = 'approved' AND invite_token_hash = ?"
            )
            .run(invite.id, tokenHash);
          if (claim.changes !== 1) {
            db.exec('ROLLBACK');
            return sendJson(res, 400, { error: 'Invite link has already been redeemed.' });
          }

          if (invite.role === 'organization' && invite.org_id) {
            assignedRole = 'org_admin';
            assignedOrgId = invite.org_id;
          } else {
            assignedRole = 'interpreter';
          }
        }

        db.prepare(
          `INSERT INTO local_users (id, email, full_name, role, org_id, password_hash, locale, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'en', ?)`
        ).run(id, email, data.fullName || '', assignedRole, assignedOrgId, hashPassword(data.password), now);

        writeLocalAudit(db, {
          actorId: id,
          area: 'auth',
          type: data.inviteToken ? 'invite_signup' : 'signup',
          result: 'ok',
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

      return sendJson(res, 201, {
        ok: true,
        user: { id, email, full_name: data.fullName || '', role: assignedRole, org_id: assignedOrgId },
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
