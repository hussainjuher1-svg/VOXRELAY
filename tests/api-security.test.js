import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxrelay-sec-test-'));
const tempDbPath = path.join(tempDir, 'voxrelay-test.sqlite');

function createMockReq({ method = 'GET', url = '/', headers = {}, body = undefined } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { ...headers };
  req.query = {};
  req.socket = { remoteAddress: '127.0.0.1' };
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
  };
}

function extractCookie(res) {
  const raw = res.headers['set-cookie'];
  if (!raw) return '';
  return String(raw).split(';')[0];
}

function makeUnsignedJwt(sub = 'forged-user-id', role = 'platform_admin') {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://example.supabase.co/auth/v1',
      aud: 'authenticated',
      sub,
      email: 'attacker@example.com',
      exp: Math.floor(Date.now() / 1000) + 3600,
      user_metadata: { role },
    })
  ).toString('base64url');
  return `${header}.${payload}.`;
}

describe('API security, authorization, isolation & concurrency', () => {
  let adminHandler;
  let authHandler;
  let contactHandler;
  let assignmentsHandler;
  let termsHandler;
  let streamRoute;

  let adminCookie = '';
  let interpreterCookie = '';
  let secondInterpreterCookie = '';
  let generatedInviteToken = '';

  beforeAll(async () => {
    process.env.VOXRELAY_LOCAL_DB = tempDbPath;
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VERCEL;

    adminHandler = (await import('../api/admin.js')).default;
    authHandler = (await import('../api/auth.js')).default;
    contactHandler = (await import('../api/contact.js')).default;
    assignmentsHandler = (await import('../api/assignments.js')).default;
    termsHandler = (await import('../api/terms.js')).default;
    streamRoute = (await import('../api/_lib/core.js')).streamRoute;

    // 1. First user becomes bootstrap platform_admin
    const res1 = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        body: { action: 'signup', email: 'admin@voxrelay.test', password: 'StrongAdminPassword123!', fullName: 'Admin' },
      }),
      res1
    );
    expect(res1.statusCode).toBe(201);
    adminCookie = extractCookie(res1);

    // 2. Second user tries to request org_admin directly — server must force interpreter
    const res2 = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        body: {
          action: 'signup',
          email: 'interp1@voxrelay.test',
          password: 'StrongInterpPassword123!',
          fullName: 'Interpreter One',
          role: 'org_admin',
        },
      }),
      res2
    );
    expect(res2.statusCode).toBe(201);
    expect(res2.json().user.role).toBe('interpreter');
    interpreterCookie = extractCookie(res2);

    // 3. Third user (User B)
    const res3 = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        body: { action: 'signup', email: 'interp2@voxrelay.test', password: 'StrongInterpPassword456!', fullName: 'Interpreter Two' },
      }),
      res3
    );
    expect(res3.statusCode).toBe(201);
    secondInterpreterCookie = extractCookie(res3);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.VOXRELAY_LOCAL_DB;
  });

  it('rejects unsigned/forged JWT tokens on protected routes (Finding 2)', async () => {
    const forged = makeUnsignedJwt();
    for (const [handler, url] of [
      [adminHandler, '/api/admin'],
      [assignmentsHandler, '/api/assignments'],
      [termsHandler, '/api/terms'],
    ]) {
      const res = createMockRes();
      await handler(
        createMockReq({
          method: 'GET',
          url,
          headers: { authorization: `Bearer ${forged}` },
        }),
        res
      );
      expect(res.statusCode).toBe(401);
    }
  });

  it('blocks non-admin authenticated users from /api/admin GET and POST with 403 (Finding 1)', async () => {
    const resGet = createMockRes();
    await adminHandler(
      createMockReq({ method: 'GET', url: '/api/admin', headers: { cookie: interpreterCookie } }),
      resGet
    );
    expect(resGet.statusCode).toBe(403);

    const resPost = createMockRes();
    await adminHandler(
      createMockReq({
        method: 'POST',
        url: '/api/admin',
        headers: { cookie: interpreterCookie },
        body: { id: 'fake-id', decision: 'approve', note: '' },
      }),
      resPost
    );
    expect(resPost.statusCode).toBe(403);
  });

  it('allows platform_admin to review contact requests and enforces single-use invite tokens', async () => {
    // Submit an access request via contact endpoint
    const contactRes = createMockRes();
    await contactHandler(
      createMockReq({
        method: 'POST',
        url: '/api/contact',
        body: {
          fullName: 'Invited Org Lead',
          email: 'invited.lead@voxrelay.test',
          audience: 'organization',
          organization: 'Chattogram Medical',
          country: 'Bangladesh',
          languages: 'EN-BN',
          message: 'Requesting organization access.',
          consent: true,
        },
      }),
      contactRes
    );
    expect(contactRes.statusCode).toBe(201);
    const reqId = contactRes.json().id;

    // Admin views queue
    const listRes = createMockRes();
    await adminHandler(
      createMockReq({ method: 'GET', url: '/api/admin', headers: { cookie: adminCookie } }),
      listRes
    );
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().requests.some((r) => r.id === reqId)).toBe(true);

    // Admin approves request and generates invite link
    const approveRes = createMockRes();
    await adminHandler(
      createMockReq({
        method: 'POST',
        url: '/api/admin',
        headers: { cookie: adminCookie },
        body: { id: reqId, decision: 'approve', note: 'Verified org.' },
      }),
      approveRes
    );
    expect(approveRes.statusCode).toBe(200);
    const inviteUrl = new URL(approveRes.json().inviteUrl);
    generatedInviteToken = inviteUrl.searchParams.get('invite') || '';
    expect(generatedInviteToken.length).toBeGreaterThan(10);

    // First signup using invite token succeeds
    const signupRes1 = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        body: {
          action: 'signup',
          email: 'invited.lead@voxrelay.test',
          password: 'ValidInvitedPassword123!',
          fullName: 'Invited Lead',
          inviteToken: generatedInviteToken,
        },
      }),
      signupRes1
    );
    expect(signupRes1.statusCode).toBe(201);
    expect(signupRes1.json().user.role).toBe('org_admin');

    // Second signup reusing the same invite token must fail (400)
    const signupRes2 = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        body: {
          action: 'signup',
          email: 'attacker.reuse@voxrelay.test',
          password: 'ValidInvitedPassword123!',
          fullName: 'Attacker',
          inviteToken: generatedInviteToken,
        },
      }),
      signupRes2
    );
    expect(signupRes2.statusCode).toBe(400);
  });

  it('isolates assignments and glossary terms across users', async () => {
    const createRes = createMockRes();
    await assignmentsHandler(
      createMockReq({
        method: 'POST',
        url: '/api/assignments',
        headers: { cookie: interpreterCookie },
        body: {
          start_at: '2026-12-01T10:00:00Z',
          duration_minutes: 45,
          language_pair: 'EN-BN',
          modality: 'video_remote',
        },
      }),
      createRes
    );
    expect(createRes.statusCode).toBe(201);
    const assignmentId = createRes.json().data.id;

    // User B cannot read User A's assignment
    const getB = createMockRes();
    await assignmentsHandler(
      createMockReq({
        method: 'GET',
        url: `/api/assignments?id=${encodeURIComponent(assignmentId)}`,
        headers: { cookie: secondInterpreterCookie },
      }),
      getB
    );
    expect(getB.statusCode).toBe(404);

    // User B cannot delete User A's assignment
    const delB = createMockRes();
    await assignmentsHandler(
      createMockReq({
        method: 'DELETE',
        url: `/api/assignments?id=${encodeURIComponent(assignmentId)}`,
        headers: { cookie: secondInterpreterCookie },
      }),
      delB
    );
    expect(delB.statusCode).toBe(404);

    // User A creates a term; User B cannot delete it and does not see it
    const termCreate = createMockRes();
    await termsHandler(
      createMockReq({
        method: 'POST',
        url: '/api/terms',
        headers: { cookie: interpreterCookie },
        body: { label: 'Confidential term', source_lang: 'en', target_lang: 'bn', target_term: 'গোপন' },
      }),
      termCreate
    );
    expect(termCreate.statusCode).toBe(201);
    const termId = termCreate.json().data.id;

    await termsHandler(
      createMockReq({
        method: 'DELETE',
        url: `/api/terms?id=${encodeURIComponent(termId)}`,
        headers: { cookie: secondInterpreterCookie },
      }),
      createMockRes()
    );

    const listA = createMockRes();
    await termsHandler(
      createMockReq({ method: 'GET', url: '/api/terms', headers: { cookie: interpreterCookie } }),
      listA
    );
    expect(listA.json().data.some((t) => t.id === termId)).toBe(true);
  });

  it('creates unique assignment references under concurrent POST requests', async () => {
    const creations = await Promise.all(
      Array.from({ length: 5 }, (_, i) => {
        const res = createMockRes();
        return assignmentsHandler(
          createMockReq({
            method: 'POST',
            url: '/api/assignments',
            headers: { cookie: interpreterCookie },
            body: {
              start_at: `2026-12-0${i + 2}T09:00:00Z`,
              duration_minutes: 30,
              language_pair: 'EN-AR',
              modality: 'video_remote',
            },
          }),
          res
        ).then(() => res);
      })
    );

    const refs = creations.map((r) => {
      expect(r.statusCode).toBe(201);
      return r.json().data.ref;
    });
    expect(new Set(refs).size).toBe(5);
  });

  it('masks raw internal error details in streamRoute responses', async () => {
    const res = createMockRes();
    await streamRoute(res, async () => {
      throw new Error('ECONNREFUSED postgres://internal-host:5432/secret');
    });
    expect(res.text()).not.toContain('postgres://');
    expect(res.text()).not.toContain('ECONNREFUSED');
    expect(res.text()).toContain('Assistant stream failed. Please try again.');
  });
});
