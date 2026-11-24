import crypto from 'node:crypto';
import { resolveActor } from './_lib/auth-session.js';
import { HttpError } from './_lib/authz.js';
import { readJsonBody, sendJson } from './_lib/core.js';
import { enqueueOutboxEmail, getLocalDb, writeLocalAudit } from './_lib/local-db.js';
import { authenticateRequest } from './_lib/supabase.js';
import { supportTicketSchema } from './_lib/validate.js';

export default async function handler(req, res) {
  try {
    const actor = await resolveActor(req);
    const db = actor?.mode === 'local' ? actor.db : getLocalDb();

    if (db) {
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

    const ctx = await authenticateRequest(req);

    if (req.method === 'GET') {
      const { data: tickets, error } = await ctx.supabase
        .from('support_requests')
        .select('*')
        .eq('requester_id', ctx.userId)
        .order('updated_at', { ascending: false });
      if (error) throw new Error(error.message);
      const ids = (tickets || []).map((t) => t.id);
      const { data: messages } = ids.length
        ? await ctx.supabase.from('support_messages').select('*').in('request_id', ids).order('created_at', { ascending: true })
        : { data: [] };
      return sendJson(res, 200, { tickets: tickets || [], messages: messages || [] });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const parsed = supportTicketSchema.safeParse(body);
      if (!parsed.success) {
        return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid support request' });
      }
      const { data: created, error } = await ctx.supabase
        .from('support_requests')
        .insert({
          requester_id: ctx.userId,
          org_id: ctx.membership?.org_id || null,
          category: parsed.data.category,
          status: 'open',
          human_required: parsed.data.category === 'boundary_escalation',
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      await ctx.supabase.from('support_messages').insert({
        request_id: created.id,
        author_id: ctx.userId,
        body: `${parsed.data.subject}\n\n${parsed.data.body}`,
      });

      return sendJson(res, 201, {
        ok: true,
        ticket: { ...created, subject: parsed.data.subject },
      });
    }

    return sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    return sendJson(res, 500, { error: 'Support request failed.' });
  }
}
