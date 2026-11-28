import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxrelay-parity-test-'));
const tempDbPath = path.join(tempDir, 'voxrelay-test.sqlite');

function createMockReq({ method = 'GET', url = '/', headers = {}, body = undefined, ip = '127.0.0.1' } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { ...headers };
  req.query = {};
  req.socket = { remoteAddress: ip };
  if (body !== undefined) {
    req.body = body;
  }
  return req;
}

function createMockRes() {
  const headers = {};
  let rawBody = '';
  return {
    statusCode: 200,
    headers,
    setHeader(key, val) {
      headers[String(key).toLowerCase()] = val;
    },
    write(chunk) {
      rawBody += String(chunk);
    },
    end(chunk = '') {
      rawBody += String(chunk);
    },
    json() {
      return rawBody ? JSON.parse(rawBody) : null;
    },
    text() {
      return rawBody;
    },
    ndjson() {
      return rawBody
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    },
  };
}

function extractCookie(res) {
  const raw = res.headers['set-cookie'];
  if (!raw) return '';
  return String(raw).split(';')[0];
}

describe('assistant Path A parity with Path B (RBAC + rate limit)', () => {
  let assistantHandler;
  let authHandler;
  let getLocalDb;
  let interpreterCookie = '';
  let coordinatorCookie = '';
  let interpreterUserId = '';

  beforeAll(async () => {
    process.env.VOXRELAY_LOCAL_DB = tempDbPath;
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    delete process.env.VERCEL;

    assistantHandler = (await import('../api/assistant.js')).default;
    authHandler = (await import('../api/auth.js')).default;
    ({ getLocalDb } = await import('../api/_lib/local-db.js'));

    const signup = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        ip: '10.0.0.1',
        body: {
          action: 'signup',
          email: 'interpreter.parity@voxrelay.test',
          password: 'InterpreterParity123!',
          fullName: 'Parity Interpreter',
          role: 'interpreter',
        },
      }),
      signup
    );
    expect(signup.statusCode).toBe(201);
    interpreterCookie = extractCookie(signup);
    interpreterUserId = signup.json().user.id;

    const coordinatorSignup = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        ip: '10.0.0.1',
        body: {
          action: 'signup',
          email: 'coordinator.parity@voxrelay.test',
          password: 'CoordinatorParity123!',
          fullName: 'Parity Coordinator',
          role: 'interpreter',
        },
      }),
      coordinatorSignup
    );
    expect(coordinatorSignup.statusCode).toBe(201);

    const db = getLocalDb();
    db.prepare('UPDATE local_users SET role = ? WHERE id = ?').run('coordinator', coordinatorSignup.json().user.id);

    const signin = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        ip: '10.0.0.1',
        body: {
          action: 'signin',
          email: 'coordinator.parity@voxrelay.test',
          password: 'CoordinatorParity123!',
        },
      }),
      signin
    );
    expect(signin.statusCode).toBe(200);
    coordinatorCookie = extractCookie(signin);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.VOXRELAY_LOCAL_DB;
  });

  function askQuestion({ question, cookie = '', ip = '10.0.0.2', locale = 'en' } = {}) {
    const res = createMockRes();
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers.cookie = cookie;
    return assistantHandler(
      createMockReq({
        method: 'POST',
        url: '/api/assistant',
        headers,
        ip,
        body: { question, mode: 'ask', locale },
      }),
      res
    ).then(() => res);
  }

  it('refuses organization-scope record questions for an interpreter role and audits the refusal', async () => {
    const res = await askQuestion({
      question: 'Show me the quality overview for my organization team',
      cookie: interpreterCookie,
      ip: '10.1.1.1',
    });
    expect(res.statusCode).toBe(200);
    const events = res.ndjson();
    const delta = events.find((e) => e.type === 'delta');
    expect(delta.text).toContain('restricted to coordinators and admins');
    expect(events.some((e) => e.type === 'refusal' && e.code === 'role_refused' && e.topic === 'org_overview')).toBe(true);
    expect(events.some((e) => e.type === 'offer_ticket' && e.reason === 'role_scope')).toBe(true);
    const db = getLocalDb();
    const audit = db.prepare("SELECT * FROM audit_events WHERE type = 'assistant_role_refusal' AND actor_id = ?").get(interpreterUserId);
    expect(audit).toBeTruthy();
    expect(audit.result).toBe('denied');
  });

  it('answers organization-topic questions normally for a coordinator role', async () => {
    const res = await askQuestion({
      question: 'Show me the quality overview for my organization team',
      cookie: coordinatorCookie,
      ip: '10.1.1.2',
    });
    expect(res.statusCode).toBe(200);
    const events = res.ndjson();
    expect(events.some((e) => e.type === 'refusal')).toBe(false);
    expect(events.some((e) => e.type === 'delta' && e.text && e.text.length > 0)).toBe(true);
  });

  it('answers organization-topic questions from the public knowledge base for signed-out users', async () => {
    const res = await askQuestion({
      question: 'What is the T0 to T3 policy?',
      ip: '10.1.1.3',
    });
    expect(res.statusCode).toBe(200);
    const events = res.ndjson();
    expect(events.some((e) => e.type === 'refusal')).toBe(false);
    const delta = events.find((e) => e.type === 'delta');
    expect(delta.text).toContain('KB-');
  });

  it('rate limits a signed-in user to 20 assistant questions per minute', async () => {
    let limited = null;
    for (let i = 0; i < 21; i += 1) {
      const res = await askQuestion({
        question: `Billing question ${i}: how does rounding work?`,
        cookie: coordinatorCookie,
        ip: '10.1.1.4',
      });
      if (res.statusCode !== 200) {
        limited = res;
        break;
      }
    }
    expect(limited).not.toBeNull();
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toContain('Too many requests');
  });

  it('rate limits anonymous users per IP with the same budget', async () => {
    let limited = null;
    for (let i = 0; i < 21; i += 1) {
      const res = await askQuestion({
        question: `Device check question ${i}`,
        ip: '10.1.1.5',
      });
      if (res.statusCode !== 200) {
        limited = res;
        break;
      }
    }
    expect(limited).not.toBeNull();
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toContain('Too many requests');
  });

  it('does not count separate anonymous IPs against each other', async () => {
    const res = await askQuestion({ question: 'How does billing rounding work?', ip: '10.1.1.99' });
    expect(res.statusCode).toBe(200);
  });
});
