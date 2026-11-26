import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxrelay-sec-test-'));
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
      app_metadata: { role },
    })
  ).toString('base64url');
  return `${header}.${payload}.`;
}

describe('Local SQLite API security, authorization, isolation & concurrency', () => {
  let adminHandler;
  let authHandler;
  let contactHandler;
  let assignmentsHandler;
  let termsHandler;
  let opsHandler;
  let streamRoute;
  let getLocalDb;
  let bootstrapLocalAdmin;
  let hashSecret;

  let firstUserCookie = '';
  let adminCookie = '';
  let interpreterCookie = '';
  let secondInterpreterCookie = '';
  let orgAdminCookie = '';

  beforeAll(async () => {
    process.env.VOXRELAY_LOCAL_DB = tempDbPath;
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    delete process.env.VERCEL;

    adminHandler = (await import('../api/admin.js')).default;
    authHandler = (await import('../api/auth.js')).default;
    contactHandler = (await import('../api/contact.js')).default;
    assignmentsHandler = (await import('../api/assignments.js')).default;
    termsHandler = (await import('../api/terms.js')).default;
    opsHandler = (await import('../api/ops.js')).default;
    streamRoute = (await import('../api/_lib/core.js')).streamRoute;
    ({ getLocalDb, bootstrapLocalAdmin, hashSecret } = await import('../api/_lib/local-db.js'));

    // 1. First public signup must NOT receive platform_admin (Priority 3)
    const resFirst = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        body: {
          action: 'signup',
          email: 'first.public@voxrelay.test',
          password: 'FirstPublicPassword123!',
          fullName: 'First User',
          role: 'org_admin',
        },
      }),
      resFirst
    );
    expect(resFirst.statusCode).toBe(201);
    expect(resFirst.json().user.role).toBe('interpreter');
    firstUserCookie = extractCookie(resFirst);

    // 2. Explicit controlled admin fixture bootstrap (never via public signup)
    const db = getLocalDb();
    bootstrapLocalAdmin(db, {
      email: 'platform.admin@voxrelay.test',
      password: 'PlatformAdminPassword123!',
      fullName: 'Platform Admin',
    });

    const adminSignIn = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        body: {
          action: 'signin',
          email: 'platform.admin@voxrelay.test',
          password: 'PlatformAdminPassword123!',
        },
      }),
      adminSignIn
    );
    expect(adminSignIn.statusCode).toBe(200);
    expect(adminSignIn.json().user.role).toBe('platform_admin');
    adminCookie = extractCookie(adminSignIn);

    // 3. Regular interpreters
    const resInterp1 = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        body: { action: 'signup', email: 'interp1@voxrelay.test', password: 'StrongInterpPassword123!', fullName: 'Interp 1' },
      }),
      resInterp1
    );
    expect(resInterp1.statusCode).toBe(201);
    interpreterCookie = extractCookie(resInterp1);

    const resInterp2 = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        body: { action: 'signup', email: 'interp2@voxrelay.test', password: 'StrongInterpPassword456!', fullName: 'Interp 2' },
      }),
      resInterp2
    );
    expect(resInterp2.statusCode).toBe(201);
    secondInterpreterCookie = extractCookie(resInterp2);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    delete process.env.VOXRELAY_LOCAL_DB;
  });

  it('denies first public signup from accessing /api/admin and rejects forged JWTs', async () => {
    const firstAdminAttempt = createMockRes();
    await adminHandler(
      createMockReq({ method: 'GET', url: '/api/admin', headers: { cookie: firstUserCookie } }),
      firstAdminAttempt
    );
    expect(firstAdminAttempt.statusCode).toBe(403);

    const forged = makeUnsignedJwt();
    for (const [handler, url] of [
      [adminHandler, '/api/admin'],
      [assignmentsHandler, '/api/assignments'],
      [termsHandler, '/api/terms'],
      [opsHandler, '/api/ops?resource=audit'],
    ]) {
      const res = createMockRes();
      await handler(
        createMockReq({ method: 'GET', url, headers: { authorization: `Bearer ${forged}` } }),
        res
      );
      expect(res.statusCode).toBe(401);
    }
  });

  it('blocks org_admin and interpreter from /api/admin and global audit events (Priority 1)', async () => {
    // Submit + approve org request to create a genuine org_admin user
    const contactRes = createMockRes();
    await contactHandler(
      createMockReq({
        method: 'POST',
        url: '/api/contact',
        ip: '10.0.0.1',
        body: {
          fullName: 'Org Lead',
          email: 'org.lead@voxrelay.test',
          audience: 'organization',
          organization: 'Chattogram Clinic',
          country: 'Bangladesh',
          languages: 'EN-BN',
          message: 'Org access please.',
          consent: true,
        },
      }),
      contactRes
    );
    expect(contactRes.statusCode).toBe(201);
    const reqId = contactRes.json().id;

    const approveRes = createMockRes();
    await adminHandler(
      createMockReq({
        method: 'POST',
        url: '/api/admin',
        headers: { cookie: adminCookie },
        body: { id: reqId, decision: 'approve', note: 'Verified' },
      }),
      approveRes
    );
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().orgId).toBeTruthy();
    const token = new URL(approveRes.json().inviteUrl).searchParams.get('invite');

    // Wrong email attempt must be rejected (403) and MUST NOT consume the invite
    const wrongEmailRes = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        body: {
          action: 'signup',
          email: 'wrong.person@voxrelay.test',
          password: 'ValidInvitedPassword123!',
          fullName: 'Wrong Email',
          inviteToken: token,
        },
      }),
      wrongEmailRes
    );
    expect(wrongEmailRes.statusCode).toBe(403);

    // Correct email succeeds and receives org_admin role scoped to verified org_id
    const orgSignupRes = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        body: {
          action: 'signup',
          email: 'org.lead@voxrelay.test',
          password: 'ValidInvitedPassword123!',
          fullName: 'Org Lead',
          inviteToken: token,
        },
      }),
      orgSignupRes
    );
    expect(orgSignupRes.statusCode).toBe(201);
    expect(orgSignupRes.json().user.role).toBe('org_admin');
    expect(orgSignupRes.json().user.org_id).toBe(approveRes.json().orgId);
    orgAdminCookie = extractCookie(orgSignupRes);

    // org_admin MUST NOT access global /api/admin GET or POST
    const orgAdminGet = createMockRes();
    await adminHandler(
      createMockReq({ method: 'GET', url: '/api/admin', headers: { cookie: orgAdminCookie } }),
      orgAdminGet
    );
    expect(orgAdminGet.statusCode).toBe(403);

    const orgAdminPost = createMockRes();
    await adminHandler(
      createMockReq({
        method: 'POST',
        url: '/api/admin',
        headers: { cookie: orgAdminCookie },
        body: { id: reqId, decision: 'reject', note: 'Attempt' },
      }),
      orgAdminPost
    );
    expect(orgAdminPost.statusCode).toBe(403);

    // org_admin audit query in local mode must NOT expose global platform audit rows from other users
    const orgAudit = createMockRes();
    await opsHandler(
      createMockReq({ method: 'GET', url: '/api/ops?resource=audit', headers: { cookie: orgAdminCookie } }),
      orgAudit
    );
    expect(orgAudit.statusCode).toBe(200);
    const leaked = orgAudit.json().data.some((row) => row.type === 'access_request_approved');
    expect(leaked).toBe(false);
  });

  it('rejects expired invites, reapproval of reviewed requests, and concurrent double-redemption (Priority 4)', async () => {
    // Expired invite rejection
    const c1 = createMockRes();
    await contactHandler(
      createMockReq({
        method: 'POST',
        url: '/api/contact',
        ip: '10.0.0.2',
        body: { email: 'expired@voxrelay.test', message: 'Need invite', consent: true },
      }),
      c1
    );
    const expId = c1.json().id;
    const a1 = createMockRes();
    await adminHandler(
      createMockReq({
        method: 'POST',
        url: '/api/admin',
        headers: { cookie: adminCookie },
        body: { id: expId, decision: 'approve', note: '' },
      }),
      a1
    );
    const expToken = new URL(a1.json().inviteUrl).searchParams.get('invite');

    // Reapproval of already approved request must return 409
    const reapprove = createMockRes();
    await adminHandler(
      createMockReq({
        method: 'POST',
        url: '/api/admin',
        headers: { cookie: adminCookie },
        body: { id: expId, decision: 'approve', note: 'Second attempt' },
      }),
      reapprove
    );
    expect(reapprove.statusCode).toBe(409);

    // Force expire in DB and verify signup fails cleanly with 400
    const db = getLocalDb();
    db.prepare('UPDATE access_requests SET invite_expires_at = ? WHERE id = ?').run(
      new Date(Date.now() - 60_000).toISOString(),
      expId
    );
    const expSignup = createMockRes();
    await authHandler(
      createMockReq({
        method: 'POST',
        url: '/api/auth',
        body: {
          action: 'signup',
          email: 'expired@voxrelay.test',
          password: 'ValidExpiredPassword123!',
          inviteToken: expToken,
        },
      }),
      expSignup
    );
    expect(expSignup.statusCode).toBe(400);

    // Concurrent approval race: 4 simultaneous approvals on one pending request -> strictly 1 succeeds (200), 3 conflict (409)
    const c2 = createMockRes();
    await contactHandler(
      createMockReq({
        method: 'POST',
        url: '/api/contact',
        ip: '10.0.0.3',
        body: { email: 'race.user@voxrelay.test', message: 'Race test', consent: true },
      }),
      c2
    );
    const raceReqId = c2.json().id;

    const approvalRace = await Promise.all(
      Array.from({ length: 4 }, () => {
        const res = createMockRes();
        return adminHandler(
          createMockReq({
            method: 'POST',
            url: '/api/admin',
            headers: { cookie: adminCookie },
            body: { id: raceReqId, decision: 'approve', note: 'Parallel approve' },
          }),
          res
        ).then(() => res);
      })
    );
    const approvedCalls = approvalRace.filter((r) => r.statusCode === 200);
    const conflictCalls = approvalRace.filter((r) => r.statusCode === 409);
    expect(approvedCalls.length).toBe(1);
    expect(conflictCalls.length).toBe(3);

    const raceToken = new URL(approvedCalls[0].json().inviteUrl).searchParams.get('invite');

    // Concurrent redemption race: 5 simultaneous signups with same inviteToken -> strictly 1 succeeds (201)
    const redeemRace = await Promise.all(
      Array.from({ length: 5 }, (_, idx) => {
        const res = createMockRes();
        return authHandler(
          createMockReq({
            method: 'POST',
            url: '/api/auth',
            body: {
              action: 'signup',
              email: 'race.user@voxrelay.test',
              password: 'ValidRacePassword123!',
              fullName: `Attempt ${idx}`,
              inviteToken: raceToken,
            },
          }),
          res
        ).then(() => res);
      })
    );
    expect(redeemRace.filter((r) => r.statusCode === 201).length).toBe(1);
    expect(redeemRace.filter((r) => r.statusCode !== 201).length).toBe(4);
    expect(hashSecret(raceToken)).toBeTruthy();
  });

  it('enforces atomic rate limit under concurrent contact & signup bursts (Priority 5)', async () => {
    const burst = await Promise.all(
      Array.from({ length: 10 }, (_, i) => {
        const res = createMockRes();
        return contactHandler(
          createMockReq({
            method: 'POST',
            url: '/api/contact',
            ip: '198.51.100.77',
            body: { email: `burst${i}@voxrelay.test`, message: 'Burst check', consent: true },
          }),
          res
        ).then(() => res);
      })
    );
    expect(burst.filter((r) => r.statusCode === 201).length).toBe(6);
    expect(burst.filter((r) => r.statusCode === 429).length).toBe(4);

    const signupBurst = await Promise.all(
      Array.from({ length: 8 }, (_, i) => {
        const res = createMockRes();
        return authHandler(
          createMockReq({
            method: 'POST',
            url: '/api/auth',
            ip: '198.51.100.88',
            body: {
              action: 'signup',
              email: `local.burst.${i}@voxrelay.test`,
              password: 'ValidBurstPassword123!',
              fullName: 'Burst User',
            },
          }),
          res
        ).then(() => res);
      })
    );
    expect(signupBurst.filter((r) => r.statusCode === 201).length).toBe(5);
    expect(signupBurst.filter((r) => r.statusCode === 429).length).toBe(3);
  });

  it('rolls back review transition AND organization creation if audit write fails (Priority 4)', async () => {
    const c = createMockRes();
    await contactHandler(
      createMockReq({
        method: 'POST',
        url: '/api/contact',
        ip: '10.0.0.4',
        body: {
          email: 'audit.fail@voxrelay.test',
          role: 'organization',
          organization: 'Rollback Local Clinic',
          message: 'Audit fail test',
          consent: true,
        },
      }),
      c
    );
    const reqId = c.json().id;
    const db = getLocalDb();
    db.exec(`
      CREATE TRIGGER fail_audit_insert_test BEFORE INSERT ON audit_events
      WHEN NEW.object_ref = '${reqId}'
      BEGIN
        SELECT RAISE(ABORT, 'simulated audit disk failure');
      END;
    `);

    const reviewRes = createMockRes();
    await adminHandler(
      createMockReq({
        method: 'POST',
        url: '/api/admin',
        headers: { cookie: adminCookie },
        body: { id: reqId, decision: 'approve', note: 'Should rollback' },
      }),
      reviewRes
    );
    expect(reviewRes.statusCode).toBe(500);

    // Status MUST remain 'pending' AND zero organizations created because transaction rolled back
    const row = db.prepare('SELECT status, org_id FROM access_requests WHERE id = ?').get(reqId);
    expect(row.status).toBe('pending');
    expect(row.org_id).toBeNull();
    const orgCount = db.prepare("SELECT COUNT(*) AS c FROM organizations WHERE name = 'Rollback Local Clinic'").get().c;
    expect(orgCount).toBe(0);
    db.exec('DROP TRIGGER IF EXISTS fail_audit_insert_test;');
  });

  it('preserves cross-user assignment & term isolation, unique refs, and safe streamRoute error masking', async () => {
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

    const streamRes = createMockRes();
    await streamRoute(streamRes, async () => {
      throw new Error('ECONNREFUSED postgres://internal-host:5432/secret');
    });
    expect(streamRes.text()).not.toContain('postgres://');
    expect(streamRes.text()).toContain('Assistant stream failed. Please try again.');
  });
});
