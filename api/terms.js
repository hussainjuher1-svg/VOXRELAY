import crypto from 'node:crypto';
import { resolveActor } from './_lib/auth-session.js';
import { HttpError } from './_lib/authz.js';
import { readJsonBody, sendJson } from './_lib/core.js';
import { getLocalDb } from './_lib/local-db.js';
import { authenticateRequest } from './_lib/supabase.js';
import { termCreateSchema } from './_lib/validate.js';

export default async function handler(req, res) {
  try {
    const actor = await resolveActor(req);
    const db = actor?.mode === 'local' ? actor.db : getLocalDb();

    if (db) {
      if (!actor) return sendJson(res, 401, { error: 'Sign in to manage terminology.' });
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
        const id = req.query?.id || url.searchParams.get('id');
        if (!id) return sendJson(res, 400, { error: 'Term ID is required.' });
        db.prepare('DELETE FROM terms WHERE id = ? AND owner_id = ?').run(id, actor.user.id);
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 405, { error: 'Method not allowed.' });
    }

    const ctx = await authenticateRequest(req);
    const url = new URL(req.url, 'http://localhost');
    const id = req.query?.id || url.searchParams.get('id');

    if (req.method === 'GET') {
      const { data, error } = await ctx.supabase
        .from('terms')
        .select('*')
        .eq('owner_id', ctx.userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return sendJson(res, 200, { data: data || [] });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const items = Array.isArray(body?.terms) ? body.terms : [body];
      const rowsToInsert = [];
      for (const item of items.slice(0, 50)) {
        const parsed = termCreateSchema.safeParse(item);
        if (!parsed.success) {
          return sendJson(res, 400, { error: parsed.error.issues[0]?.message || 'Invalid term' });
        }
        rowsToInsert.push({
          scope: 'personal',
          owner_id: ctx.userId,
          label: parsed.data.label,
          source_lang: parsed.data.source_lang,
          target_lang: parsed.data.target_lang,
          target_term: parsed.data.target_term,
        });
      }
      const { data: created, error } = await ctx.supabase.from('terms').insert(rowsToInsert).select('*');
      if (error) throw new Error(error.message);
      return sendJson(res, 201, { data: created.length === 1 ? created[0] : created });
    }

    if (req.method === 'DELETE') {
      if (!id) return sendJson(res, 400, { error: 'Term ID is required.' });
      const { error } = await ctx.supabase.from('terms').delete().eq('id', id).eq('owner_id', ctx.userId);
      if (error) throw new Error(error.message);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    return sendJson(res, 500, { error: 'Terminology request failed.' });
  }
}
