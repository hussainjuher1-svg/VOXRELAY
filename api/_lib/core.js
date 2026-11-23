import crypto from 'node:crypto';
import { HttpError } from './authz.js';

export function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function readJsonBody(req, maxBytes = 256 * 1024) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new HttpError(413, 'Request payload too large.');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

export function hashKey(raw) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || 'voxrelay-local-salt';
  return crypto.createHmac('sha256', secret).update(String(raw)).digest('hex');
}

export async function enforceRateLimit(supabase, bucketKey, { maxRequests = 15, windowMs = 60_000 } = {}) {
  if (!supabase) return;
  const keyHash = hashKey(bucketKey);
  const since = new Date(Date.now() - windowMs).toISOString();

  const { count } = await supabase
    .from('rate_events')
    .select('id', { count: 'exact', head: true })
    .eq('key_hash', keyHash)
    .gte('created_at', since);

  if ((count || 0) >= maxRequests) {
    throw new HttpError(429, 'Too many requests. Please wait a moment and try again.');
  }

  await supabase.from('rate_events').insert({ key_hash: keyHash });
}

export function streamRoute(res, handler) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  const emit = (obj) => {
    res.write(`${JSON.stringify(obj)}\n`);
  };

  return Promise.resolve(handler(emit))
    .then(() => {
      emit({ type: 'done' });
      res.end();
    })
    .catch((err) => {
      emit({ type: 'error', message: err?.message || 'Stream interrupted.' });
      res.end();
    });
}
