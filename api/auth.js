import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { clearSessionCookie, createLocalSession, resolveActor, setSessionCookie } from './_lib/auth-session.js';
import { HttpError } from './_lib/authz.js';
import { enforceLocalRateLimit, enforceRateLimit, hashKey, readJsonBody, sendJson } from './_lib/core.js';
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
    action: z.literal('resend_confirmation'),
    email: z.string().trim().email().max(160),
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

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

async function cleanupProvisioning({ service, userId, orgId, reserved }) {
  const cleanupErrors = [];

  if (userId && orgId) {
    const { error: delMemErr } = await service
      .from('memberships')
      .delete()
      .eq('user_id', userId)
      .eq('org_id', orgId);
    if (delMemErr) cleanupErrors.push(`membership cleanup: ${delMemErr.message}`);
  }

  if (userId) {
    const { error: delUserErr } = await service.auth.admin.deleteUser(userId);
    if (delUserErr) cleanupErrors.push(`user cleanup: ${delUserErr.message}`);
  }

  if (reserved?.id && reserved?.claim_token) {
    const { error: relErr } = await service.rpc('release_access_invite', {
      p_request_id: reserved.id,
      p_claim_token: reserved.claim_token,
    });
    if (relErr) cleanupErrors.push(`invite release: ${relErr.message}`);
  }

  if (cleanupErrors.length > 0) {
    console.error('[VOXRELAY] Provisioning cleanup failed:', cleanupErrors.join('; '));
    throw new HttpError(500, 'Account provisioning failed and automatic rollback cleanup was incomplete.');
  }
}

async function dispatchConfirmationEmail(email) {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    return {
      sent: false,
      reason: 'Confirmation email delivery is unavailable because Supabase public client credentials are missing.',
    };
  }
  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { error } = await anon.auth.resend({ type: 'signup', email });
    if (error) {
      return { sent: false, reason: 'Confirmation email could not be dispatched right now.' };
    }
    return { sent: true, reason: null };
  } catch {
    return { sent: false, reason: 'Confirmation email dispatch failed.' };
  }
}

async function handleSupabaseResend(data, req, res) {
  const service = getServiceClient();
  if (!service) {
    return sendJson(res, 503, { error: 'Authentication service is not configured.' });
  }
  const email = data.email.toLowerCase();
  const ip = getClientIp(req);

  await enforceRateLimit(service, `resend:ip:${ip}`, { maxRequests: 5, windowMs: 3600_000 });
  await enforceRateLimit(service, `resend:email:${hashKey(email)}`, { maxRequests: 3, windowMs: 3600_000 });

  const delivery = await dispatchConfirmationEmail(email);
  if (!delivery.sent) {
    return sendJson(res, 502, {
      ok: false,
      confirmationEmailSent: false,
      error: delivery.reason,
    });
  }
  return sendJson(res, 200, {
    ok: true,
    confirmationEmailSent: true,
    message: 'If an unconfirmed account exists, a confirmation email has been sent.',
  });
}

async function handleSupabaseSignup(data, req, res) {
  const service = getServiceClient();
  if (!service) {
    return sendJson(res, 503, { error: 'Authentication service is not configured.' });
  }
  if (BREACHED_PASSWORDS.has(data.password.toLowerCase())) {
    return sendJson(res, 400, { error: 'This password appears in known breaches. Choose a stronger passphrase.' });
  }

  const email = data.email.toLowerCase();
  const ip = getClientIp(req);

  // Enforce atomic rate limits BEFORE any invite reservation or Auth Admin call
  const ipBucket = data.inviteToken ? `signup:invite:ip:${ip}` : `signup:public:ip:${ip}`;
  const ipLimit = data.inviteToken ? 10 : 5;
  await enforceRateLimit(service, ipBucket, { maxRequests: ipLimit, windowMs: 3600_000 });
  await enforceRateLimit(service, `signup:email:${hashKey(email)}`, { maxRequests: 5, windowMs: 3600_000 });

  let reserved = null;

  if (data.inviteToken) {
    const { data: reserveRes, error: reserveErr } = await service.rpc('reserve_access_invite', {
      p_token_hash: hashSecret(data.inviteToken),
      p_email: email,
      p_lease_seconds: 120,
    });
    if (reserveErr) {
      throw new Error(reserveErr.message);
    }
    if (!reserveRes?.ok) {
      if (reserveRes?.code === 'email_mismatch') {
        return sendJson(res, 403, { error: 'This invitation was issued for a different email address.' });
      }
      if (reserveRes?.code === 'expired') {
        return sendJson(res, 400, { error: 'Invite link has expired.' });
      }
      if (reserveRes?.code === 'in_progress') {
        return sendJson(res, 409, { error: 'This invitation is currently being processed. Please retry shortly.' });
      }
      return sendJson(res, 400, { error: 'Invite link is invalid, expired, or already used.' });
    }
    reserved = reserveRes;
  }

  let createdUserId = null;
  let insertedOrgId = null;

  try {
    const { data: created, error: createErr } = await service.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: false,
      user_metadata: { full_name: data.fullName || '' },
      app_metadata: { role: 'interpreter' },
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message || '';
      if (reserved) {
        await cleanupProvisioning({ service, userId: null, orgId: null, reserved });
      }
      if (/already.*registered|already.*exists|duplicate/i.test(msg)) {
        return sendJson(res, 409, { error: 'Unable to complete signup with this email address.' });
      }
      throw new Error(msg || 'Unable to provision account.');
    }

    createdUserId = created.user.id;
    let assignedOrgRole = 'interpreter';

    if (reserved?.org_id) {
      const { data: orgRow, error: orgLookupErr } = await service
        .from('organizations')
        .select('id')
        .eq('id', reserved.org_id)
        .maybeSingle();

      if (orgLookupErr || !orgRow?.id) {
        await cleanupProvisioning({ service, userId: createdUserId, orgId: null, reserved });
        throw new Error(orgLookupErr?.message || 'Provisioned organization record is invalid.');
      }

      assignedOrgRole = reserved.approved_role === 'admin' ? 'admin' : 'interpreter';
      const { error: memErr } = await service.from('memberships').insert({
        org_id: orgRow.id,
        user_id: createdUserId,
        role: assignedOrgRole,
        status: 'active',
      });
      if (memErr) {
        await cleanupProvisioning({ service, userId: createdUserId, orgId: null, reserved });
        throw new Error(memErr.message);
      }
      insertedOrgId = orgRow.id;
    }

    if (reserved) {
      const delivery = await dispatchConfirmationEmail(email);
      if (!delivery.sent) {
        await cleanupProvisioning({
          service,
          userId: createdUserId,
          orgId: insertedOrgId,
          reserved,
        });
        return sendJson(res, 503, {
          ok: false,
          accountCreated: false,
          confirmationEmailSent: false,
          invitePreserved: true,
          error: `${delivery.reason} Your invitation remains active — please retry once email delivery is available.`,
        });
      }

      const { data: finRes, error: finErr } = await service.rpc('finalize_access_invite', {
        p_request_id: reserved.id,
        p_claim_token: reserved.claim_token,
        p_user_id: createdUserId,
      });
      if (finErr || !finRes?.ok) {
        await cleanupProvisioning({
          service,
          userId: createdUserId,
          orgId: insertedOrgId,
          reserved,
        });
        throw new Error(finErr?.message || 'Unable to finalize invitation redemption.');
      }

      return sendJson(res, 201, {
        ok: true,
        accountCreated: true,
        confirmationEmailSent: true,
        requiresConfirmation: true,
        user: {
          id: createdUserId,
          email,
          full_name: data.fullName || '',
          role: 'interpreter',
          org_id: insertedOrgId,
          org_role: insertedOrgId ? assignedOrgRole : null,
        },
      });
    }

    // Uninvited ordinary interpreter signup
    const { error: auditErr } = await service.from('audit_events').insert({
      actor_id: createdUserId,
      org_id: null,
      area: 'auth',
      type: 'signup',
      object_ref: null,
      result: 'ok',
    });
    if (auditErr) {
      await cleanupProvisioning({ service, userId: createdUserId, orgId: null, reserved: null });
      throw new Error(auditErr.message);
    }

    const delivery = await dispatchConfirmationEmail(email);
    return sendJson(res, 201, {
      ok: true,
      accountCreated: true,
      confirmationEmailSent: delivery.sent,
      requiresConfirmation: true,
      confirmationWarning: delivery.sent ? null : delivery.reason,
      user: {
        id: createdUserId,
        email,
        full_name: data.fullName || '',
        role: 'interpreter',
        org_id: null,
        org_role: null,
      },
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw err;
  }
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
        return await handleSupabaseSignup(data, req, res);
      }
      if (data.action === 'resend_confirmation') {
        return await handleSupabaseResend(data, req, res);
      }
      return sendJson(res, 503, { error: 'Local authentication unavailable in serverless mode; use Supabase Auth.' });
    }

    const ua = req.headers['user-agent'] || 'Browser';
    const ip = getClientIp(req);

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

    if (data.action === 'resend_confirmation') {
      return sendJson(res, 200, {
        ok: true,
        confirmationEmailSent: false,
        message: 'Local workspace accounts do not require email confirmation.',
      });
    }

    if (data.action === 'signup') {
      if (BREACHED_PASSWORDS.has(data.password.toLowerCase())) {
        return sendJson(res, 400, { error: 'This password appears in known breaches. Choose a stronger passphrase.' });
      }
      const email = data.email.toLowerCase();
      enforceLocalRateLimit(db, data.inviteToken ? `signup:invite:ip:${ip}` : `signup:public:ip:${ip}`, {
        maxRequests: data.inviteToken ? 10 : 5,
        windowMs: 3600_000,
      });
      enforceLocalRateLimit(db, `signup:email:${hashKey(email)}`, { maxRequests: 5, windowMs: 3600_000 });
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
