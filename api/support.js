import crypto from 'node:crypto';
import { resolveActor } from './_lib/auth-session.js';
import { readJsonBody, sendJson } from './_lib/core.js';
import { enqueueOutboxEmail, getLocalDb, writeLocalAudit } from './_lib/local-db.js';
import { supportTicketSchema } from './_lib/validate.js';

export default async function handler(req, res) {
  const actor = await resolveActor(req);
  const db = getLocalDb();
  if (!db) return sendJson(res, 503, { error: 'Local support storage unavailable in serverless mode.' });

  if (req.method === 'GET') {
    if (!actor) return sendJson(res, 401, { error: 'Sign in to view support tickets.' });
    const tickets = db
      .prepare('SELECT * FROM support_tickets WHERE requester_id = ? ORDER BY updated_at DESC')
      .all(actor.user.id);
    const messages = db
      .prepare(
        `SELECT m.* FROM support_messages m
         JOIN support_tickets t ON t.id = m.ticket_id
         WHERE t.requester_id = ? ORDER BY m.created_at ASC`
      )
      .all(actor.user.id);
    return sendJson(res, 200, { tickets, messages });
  }

  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const parsed = supportTicketSchema.safeParse(body);
    if (!parsed.success) {
      return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid support request' });
    }

    const requesterId = actor?.user?.id || 'guest-assistant';
    const requesterEmail = actor?.user?.email || 'guest@voxrelay.local';
    const ticketId = crypto.randomUUID();
    const msgId = crypto.randomUUID();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO support_tickets (id, requester_id, requester_email, category, subject, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
    ).run(ticketId, requesterId, requesterEmail, parsed.data.category, parsed.data.subject, now, now);

    db.prepare(
      `INSERT INTO support_messages (id, ticket_id, author_id, author_role, body, created_at)
       VALUES (?, ?, ?, 'user', ?, ?)`
    ).run(msgId, ticketId, requesterId, parsed.data.body, now);

    enqueueOutboxEmail(db, {
      toEmail: requesterEmail,
      locale: 'en',
      kind: 'support_ticket',
      subject: `Support ticket opened: ${parsed.data.subject}`,
      textBody: `Ticket ${ticketId} has been logged in the human support queue.\n\nCategory: ${parsed.data.category}\nStatus: open`,
      htmlBody: `<p>Your support ticket (<strong>${parsed.data.subject}</strong>) is open in the human support queue.</p>`,
    });

    writeLocalAudit(db, {
      actorId: actor?.user?.id || null,
      area: 'support',
      type: 'ticket_opened',
      objectRef: ticketId,
      result: 'open',
    });

    return sendJson(res, 201, {
      ok: true,
      ticket: { id: ticketId, subject: parsed.data.subject, status: 'open', created_at: now },
    });
  }

  return sendJson(res, 405, { error: 'Method not allowed.' });
}
