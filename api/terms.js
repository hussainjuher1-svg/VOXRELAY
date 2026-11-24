import crypto from 'node:crypto';
import { resolveActor } from './_lib/auth-session.js';
import { readJsonBody, sendJson } from './_lib/core.js';
import { getLocalDb } from './_lib/local-db.js';
import { termCreateSchema } from './_lib/validate.js';

export default async function handler(req, res) {
  const actor = await resolveActor(req);
  if (!actor) return sendJson(res, 401, { error: 'Sign in to manage terminology.' });
  const db = getLocalDb();
  if (!db) return sendJson(res, 503, { error: 'Local glossary storage unavailable in serverless mode.' });

  if (req.method === 'GET') {
    const rows = db.prepare('SELECT * FROM terms WHERE owner_id = ? ORDER BY created_at DESC').all(actor.user.id);
    return sendJson(res, 200, { data: rows });
  }

  if (req.method === 'POST') {
    const body = await readJsonBody(req);
    const items = Array.isArray(body?.terms) ? body.terms : [body];
    const created = [];
    for (const item of items.slice(0, 50)) {
      const parsed = termCreateSchema.safeParse(item);
      if (!parsed.success) {
        return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid term' });
      }
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO terms (id, owner_id, label, source_lang, target_lang, target_term, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        actor.user.id,
        parsed.data.label,
        parsed.data.source_lang,
        parsed.data.target_lang,
        parsed.data.target_term,
        parsed.data.notes,
        now
      );
      created.push(db.prepare('SELECT * FROM terms WHERE id = ?').get(id));
    }
    return sendJson(res, 201, { data: created.length === 1 ? created[0] : created });
  }

  if (req.method === 'DELETE') {
    const url = new URL(req.url, 'http://localhost');
    const id = url.searchParams.get('id');
    if (!id) return sendJson(res, 400, { error: 'Term ID is required.' });
    db.prepare('DELETE FROM terms WHERE id = ? AND owner_id = ?').run(id, actor.user.id);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: 'Method not allowed.' });
}
