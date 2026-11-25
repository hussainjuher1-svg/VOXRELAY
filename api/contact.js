import crypto from 'node:crypto';
import { HttpError } from './_lib/authz.js';
import { enforceLocalRateLimit, enforceRateLimit, readJsonBody, sendJson } from './_lib/core.js';
import { buildAccessConfirmationEmail } from './_lib/email-templates.js';
import { enqueueOutboxEmail, getLocalDb, writeLocalAudit } from './_lib/local-db.js';
import { getServiceClient } from './_lib/supabase.js';
import { contactRequestSchema } from './_lib/validate.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const raw = await readJsonBody(req);
    const parsed = contactRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid request' });
    }

    // Honeypot check: silently accept bots without storing
    if (parsed.data.website && parsed.data.website.trim().length > 0) {
      return sendJson(res, 201, { ok: true, id: 'accepted' });
    }

    const fullName = (parsed.data.fullName || parsed.data.name || '').trim();
    const { email, audience, organization, country, languages, message, consent, locale } = parsed.data;
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';

    const service = getServiceClient();
    if (service) {
      await enforceRateLimit(service, `contact:${ip}`, { maxRequests: 6, windowMs: 3600_000 });
      const { error } = await service.from('access_requests').insert({
        name: fullName,
        email,
        audience,
        organization: organization || '',
        country: country || '',
        languages: languages || '',
        consent: Boolean(consent),
        status: 'pending',
        message,
      });
      if (error) {
        throw new Error(error.message);
      }
      return sendJson(res, 201, {
        ok: true,
        storage: 'supabase',
        emailDispatched: false,
        message: 'Request recorded in the review queue.',
      });
    }

    const db = getLocalDb();
    if (!db) {
      return sendJson(res, 503, { error: 'Contact service is not configured yet.' });
    }

    // Atomic local SQLite rate limit (6 per hour per IP)
    enforceLocalRateLimit(db, `contact:${ip}`, { maxRequests: 6, windowMs: 3600_000 });

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO access_requests (id, full_name, work_email, role, organization, country, languages, message, consent, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).run(id, fullName, email, audience, organization || '', country || '', languages || '', message, consent ? 1 : 0, now);

    const confirmation = buildAccessConfirmationEmail({ locale, fullName, email, role: audience });
    enqueueOutboxEmail(db, {
      toEmail: email,
      locale,
      kind: 'access_confirmation',
      ...confirmation,
    });

    enqueueOutboxEmail(db, {
      toEmail: 'ops-review@voxrelay.local',
      locale: 'en',
      kind: 'admin_notice',
      subject: `New VOXRELAY access request (${audience})`,
      textBody: `Requester: ${fullName || 'Unspecified'} <${email}>\nOrganization: ${organization || 'None'}\nCountry: ${country || 'Unspecified'}\nLanguages: ${languages || 'Unspecified'}\n\nReview in /app/admin.`,
      htmlBody: `<p>New access request from <strong>${fullName || email}</strong> (${audience}). Open <code>/app/admin</code> to review.</p>`,
    });

    writeLocalAudit(db, { area: 'access', type: 'access_request_created', objectRef: id, result: 'pending' });

    return sendJson(res, 201, {
      ok: true,
      id,
      storage: 'local_sqlite',
      message: 'Your access request has been recorded and a confirmation email was queued.',
    });
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    return sendJson(res, 500, { error: 'Unable to record request right now.' });
  }
}
