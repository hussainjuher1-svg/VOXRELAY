import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Stateful in-memory transactional Postgres/Supabase test harness for Vercel production routes
const state = {
  usersByToken: new Map(),
  usersById: new Map(),
  usersByEmail: new Map(),
  tables: {
    organizations: [],
    memberships: [],
    access_requests: [],
    audit_events: [],
    rate_events: [],
    assignments: [],
    assignment_events: [],
    terms: [],
    device_checks: [],
  },
  seq: {
    access_requests: 1,
    audit_events: 1,
    rate_events: 1,
  },
  faults: {
    failAuditInsert: false,
    failRateLimitRpc: false,
    failMembershipInsert: false,
  },
};

function resetHarness() {
  state.usersByToken.clear();
  state.usersById.clear();
  state.usersByEmail.clear();
  for (const k of Object.keys(state.tables)) state.tables[k] = [];
  state.seq = { access_requests: 1, audit_events: 1, rate_events: 1 };
  state.faults = { failAuditInsert: false, failRateLimitRpc: false, failMembershipInsert: false };
}

function registerAuthUser({ id = crypto.randomUUID(), email, appRole = 'interpreter', userRoleMeta = undefined, confirmed = true }) {
  const token = `tok-${crypto.randomUUID()}`;
  const user = {
    id,
    email,
    email_confirmed_at: confirmed ? new Date().toISOString() : null,
    app_metadata: { role: appRole },
    user_metadata: { full_name: email.split('@')[0], ...(userRoleMeta ? { role: userRoleMeta } : {}) },
  };
  state.usersByToken.set(token, user);
  state.usersById.set(id, user);
  state.usersByEmail.set(email.toLowerCase(), user);
  return { token, user };
}

function makeQuery(tableName) {
  const filters = [];
  let orderSpec = null;
  let limitVal = null;
  let mode = 'select';
  let insertPayload = null;
  let updatePayload = null;

  const matches = (row) =>
    filters.every(([op, col, val]) => {
      if (op === 'eq') return row[col] === val;
      if (op === 'in') return Array.isArray(val) && val.includes(row[col]);
      if (op === 'gte') return String(row[col]) >= String(val);
      return true;
    });

  const execute = async () => {
    const rows = state.tables[tableName] || [];

    if (mode === 'insert') {
      if (tableName === 'audit_events' && state.faults.failAuditInsert) {
        return { data: null, error: { message: 'simulated audit failure' } };
      }
      if (tableName === 'memberships' && state.faults.failMembershipInsert) {
        return { data: null, error: { message: 'simulated membership failure' } };
      }
      const items = Array.isArray(insertPayload) ? insertPayload : [insertPayload];
      const inserted = items.map((item) => {
        const row = { ...item };
        if (['access_requests', 'audit_events', 'rate_events'].includes(tableName)) {
          row.id = row.id ?? state.seq[tableName]++;
        } else {
          row.id = row.id ?? crypto.randomUUID();
        }
        row.created_at = row.created_at || new Date().toISOString();
        if (tableName === 'access_requests') {
          row.status = row.status || 'pending';
          row.reviewer_note = row.reviewer_note || '';
        }
        rows.push(row);
        return { ...row };
      });
      return { data: Array.isArray(insertPayload) ? inserted : inserted[0], error: null };
    }

    if (mode === 'update') {
      const updated = [];
      for (const row of rows) {
        if (matches(row)) {
          Object.assign(row, updatePayload);
          updated.push({ ...row });
        }
      }
      return { data: updated, error: null };
    }

    if (mode === 'delete') {
      const kept = [];
      for (const row of rows) {
        if (!matches(row)) kept.push(row);
      }
      state.tables[tableName] = kept;
      return { data: null, error: null };
    }

    let resRows = rows.filter(matches).map((r) => ({ ...r }));
    if (orderSpec) {
      const { col, ascending } = orderSpec;
      resRows.sort((a, b) => {
        if (a[col] === b[col]) return 0;
        const cmp = a[col] < b[col] ? -1 : 1;
        return ascending ? cmp : -cmp;
      });
    }
    if (limitVal !== null) resRows = resRows.slice(0, limitVal);
    return { data: resRows, error: null };
  };

  const builder = {
    select() {
      return builder;
    },
    insert(payload) {
      mode = 'insert';
      insertPayload = payload;
      return builder;
    },
    update(payload) {
      mode = 'update';
      updatePayload = payload;
      return builder;
    },
    delete() {
      mode = 'delete';
      return builder;
    },
    eq(col, val) {
      filters.push(['eq', col, val]);
      return builder;
    },
    in(col, vals) {
      filters.push(['in', col, vals]);
      return builder;
    },
    gte(col, val) {
      filters.push(['gte', col, val]);
      return builder;
    },
    order(col, { ascending = true } = {}) {
      orderSpec = { col, ascending };
      return builder;
    },
    limit(n) {
      limitVal = n;
      return builder;
    },
    async maybeSingle() {
      const r = await execute();
      if (r.error) return r;
      const first = Array.isArray(r.data) ? r.data[0] || null : r.data || null;
      return { data: first, error: null };
    },
    async single() {
      const r = await execute();
      if (r.error) return r;
      const first = Array.isArray(r.data) ? r.data[0] || null : r.data || null;
      if (!first) return { data: null, error: { message: 'No rows found' } };
      return { data: first, error: null };
    },
    then(resolve, reject) {
      return execute().then(resolve, reject);
    },
  };
  return builder;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      async getUser(token) {
        const user = state.usersByToken.get(token);
        if (!user) return { data: { user: null }, error: { message: 'Invalid JWT' } };
        return { data: { user }, error: null };
      },
      async resend() {
        return { data: {}, error: null };
      },
      admin: {
        async createUser({ email, email_confirm = false, user_metadata = {}, app_metadata = {} }) {
          const normalized = String(email).toLowerCase();
          if (state.usersByEmail.has(normalized)) {
            return { data: { user: null }, error: { message: 'User already registered' } };
          }
          const user = {
            id: crypto.randomUUID(),
            email: normalized,
            email_confirmed_at: email_confirm ? new Date().toISOString() : null,
            user_metadata,
            app_metadata,
          };
          state.usersById.set(user.id, user);
          state.usersByEmail.set(normalized, user);
          return { data: { user }, error: null };
        },
        async deleteUser(userId) {
          const u = state.usersById.get(userId);
          if (u) {
            state.usersById.delete(userId);
            state.usersByEmail.delete(u.email);
          }
          return { data: {}, error: null };
        },
      },
    },
    from: (tableName) => makeQuery(tableName),
    async rpc(fnName, args) {
      if (fnName === 'consume_rate_limit') {
        if (state.faults.failRateLimitRpc) {
          return { data: null, error: { message: 'rate limit db offline' } };
        }
        const since = new Date(Date.now() - Number(args.p_window_ms)).toISOString();
        const count = state.tables.rate_events.filter(
          (r) => r.key_hash === args.p_key_hash && r.created_at >= since
        ).length;
        if (count >= args.p_max_requests) return { data: false, error: null };
        state.tables.rate_events.push({
          id: state.seq.rate_events++,
          key_hash: args.p_key_hash,
          created_at: new Date().toISOString(),
        });
        return { data: true, error: null };
      }

      if (fnName === 'review_access_request') {
        const row = state.tables.access_requests.find((r) => r.id === args.p_request_id);
        if (!row) return { data: { ok: false, code: 'not_found' }, error: null };
        if (row.status !== 'pending') {
          return { data: { ok: false, code: 'already_reviewed', status: row.status }, error: null };
        }
        if (state.faults.failAuditInsert) {
          return { data: null, error: { message: 'audit transaction aborted' } };
        }
        const nextStatus = args.p_decision === 'approve' ? 'approved' : 'rejected';
        const approvedRole =
          args.p_decision === 'approve' && row.audience === 'organization' && args.p_provision_org_id
            ? 'admin'
            : 'interpreter';
        Object.assign(row, {
          status: nextStatus,
          reviewer_note: args.p_note || '',
          reviewed_by: args.p_reviewer_id,
          reviewed_at: new Date().toISOString(),
          invite_token_hash: args.p_decision === 'approve' ? args.p_invite_hash : null,
          invite_expires_at: args.p_decision === 'approve' ? args.p_invite_expires_at : null,
          org_id: args.p_decision === 'approve' ? args.p_provision_org_id : null,
          approved_role: approvedRole,
        });
        state.tables.audit_events.push({
          id: state.seq.audit_events++,
          actor_id: args.p_reviewer_id,
          org_id: row.org_id,
          area: 'admin',
          type: args.p_decision === 'approve' ? 'access_request_approved' : 'access_request_rejected',
          object_ref: String(row.id),
          result: nextStatus,
          created_at: new Date().toISOString(),
        });
        return {
          data: {
            ok: true,
            id: row.id,
            email: row.email,
            audience: row.audience,
            org_id: row.org_id,
            approved_role: approvedRole,
            status: row.status,
          },
          error: null,
        };
      }

      if (fnName === 'claim_access_invite') {
        const row = state.tables.access_requests.find((r) => r.invite_token_hash === args.p_token_hash);
        if (!row) return { data: { ok: false, code: 'invalid_or_used' }, error: null };
        if (row.status !== 'approved') return { data: { ok: false, code: 'not_approved' }, error: null };
        if (row.invite_expires_at && new Date(row.invite_expires_at).getTime() <= Date.now()) {
          return { data: { ok: false, code: 'expired' }, error: null };
        }
        if (row.email.trim().toLowerCase() !== String(args.p_email).trim().toLowerCase()) {
          return { data: { ok: false, code: 'email_mismatch' }, error: null };
        }
        row.status = 'redeemed';
        row.invite_token_hash = null;
        return {
          data: {
            ok: true,
            id: row.id,
            email: row.email,
            audience: row.audience,
            org_id: row.org_id || null,
            approved_role: row.approved_role || 'interpreter',
          },
          error: null,
        };
      }

      return { data: null, error: { message: `Unknown RPC ${fnName}` } };
    },
  }),
}));

function createReq({ method = 'GET', url = '/', headers = {}, body = undefined, ip = '203.0.113.10' } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { ...headers };
  req.query = {};
  req.socket = { remoteAddress: ip };
  if (body !== undefined) req.body = body;
  return req;
}

function createRes() {
  const headers = {};
  let raw = '';
  return {
    statusCode: 200,
    headers,
    setHeader(k, v) {
      headers[String(k).toLowerCase()] = v;
    },
    write(chunk) {
      raw += String(chunk);
    },
    end(chunk = '') {
      raw += String(chunk);
    },
    json() {
      return raw ? JSON.parse(raw) : null;
    },
  };
}

describe('Production Supabase mode (VERCEL=1): authorization, invitation lifecycle & concurrency', () => {
  let adminHandler;
  let authHandler;
  let contactHandler;
  let opsHandler;
  let assignmentsHandler;

  beforeAll(async () => {
    process.env.VERCEL = '1';
    process.env.SUPABASE_URL = 'https://prod-test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-secret-not-real';
    process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key-not-real';

    adminHandler = (await import('../api/admin.js')).default;
    authHandler = (await import('../api/auth.js')).default;
    contactHandler = (await import('../api/contact.js')).default;
    opsHandler = (await import('../api/ops.js')).default;
    assignmentsHandler = (await import('../api/assignments.js')).default;
  });

  afterAll(() => {
    delete process.env.VERCEL;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VITE_SUPABASE_ANON_KEY;
  });

  beforeEach(() => {
    resetHarness();
  });

  it('separates platform_admin from org_admin, user_metadata spoofing, and cross-org records', async () => {
    const orgAId = crypto.randomUUID();
    const orgBId = crypto.randomUUID();
    state.tables.organizations.push(
      { id: orgAId, name: 'Org A', created_by: crypto.randomUUID() },
      { id: orgBId, name: 'Org B', created_by: crypto.randomUUID() }
    );

    const platformAdmin = registerAuthUser({ email: 'padmin@voxrelay.test', appRole: 'platform_admin' });
    const spoofedUser = registerAuthUser({
      email: 'spoof@voxrelay.test',
      appRole: 'interpreter',
      userRoleMeta: 'platform_admin',
    });
    const orgAAdmin = registerAuthUser({ email: 'orga@voxrelay.test', appRole: 'interpreter' });
    const orgBAdmin = registerAuthUser({ email: 'orgb@voxrelay.test', appRole: 'interpreter' });

    state.tables.memberships.push(
      { id: crypto.randomUUID(), org_id: orgAId, user_id: orgAAdmin.user.id, role: 'admin', status: 'active' },
      { id: crypto.randomUUID(), org_id: orgBId, user_id: orgBAdmin.user.id, role: 'owner', status: 'active' }
    );

    // Seed org-scoped audit & assignment records
    const orgBAssignmentId = crypto.randomUUID();
    state.tables.assignments.push({
      id: orgBAssignmentId,
      ref: 'VR-ORGB01',
      owner_id: orgBAdmin.user.id,
      org_id: orgBId,
      start_at: '2026-12-01T10:00:00Z',
      duration_minutes: 30,
      language_pair: 'EN-AR',
      modality: 'video_remote',
      status: 'scheduled',
      checklist: [],
    });
    state.tables.audit_events.push(
      { id: state.seq.audit_events++, actor_id: orgAAdmin.user.id, org_id: orgAId, area: 'org', type: 'org_a_only', result: 'ok', created_at: new Date().toISOString() },
      { id: state.seq.audit_events++, actor_id: orgBAdmin.user.id, org_id: orgBId, area: 'org', type: 'org_b_secret', result: 'ok', created_at: new Date().toISOString() },
      { id: state.seq.audit_events++, actor_id: platformAdmin.user.id, org_id: null, area: 'admin', type: 'global_platform_event', result: 'ok', created_at: new Date().toISOString() }
    );

    // Spoofed user_metadata.role MUST NOT grant /api/admin
    const spoofRes = createRes();
    await adminHandler(createReq({ headers: { authorization: `Bearer ${spoofedUser.token}` } }), spoofRes);
    expect(spoofRes.statusCode).toBe(403);

    // Org admin MUST NOT access global /api/admin
    const orgAdminRes = createRes();
    await adminHandler(createReq({ headers: { authorization: `Bearer ${orgAAdmin.token}` } }), orgAdminRes);
    expect(orgAdminRes.statusCode).toBe(403);

    // Org owner MUST NOT access global /api/admin
    const orgOwnerRes = createRes();
    await adminHandler(createReq({ headers: { authorization: `Bearer ${orgBAdmin.token}` } }), orgOwnerRes);
    expect(orgOwnerRes.statusCode).toBe(403);

    // Platform admin CAN access global /api/admin
    const platRes = createRes();
    await adminHandler(createReq({ headers: { authorization: `Bearer ${platformAdmin.token}` } }), platRes);
    expect(platRes.statusCode).toBe(200);

    // Org A admin audit query ONLY returns Org A rows (never Org B or global platform rows)
    const orgAAuditRes = createRes();
    await opsHandler(
      createReq({ url: '/api/ops?resource=audit', headers: { authorization: `Bearer ${orgAAdmin.token}` } }),
      orgAAuditRes
    );
    expect(orgAAuditRes.statusCode).toBe(200);
    const types = orgAAuditRes.json().data.map((r) => r.type);
    expect(types).toContain('org_a_only');
    expect(types).not.toContain('org_b_secret');
    expect(types).not.toContain('global_platform_event');

    // Org A admin CANNOT read Org B assignment (404)
    const crossOrgAssign = createRes();
    await assignmentsHandler(
      createReq({
        url: `/api/assignments?id=${orgBAssignmentId}`,
        headers: { authorization: `Bearer ${orgAAdmin.token}` },
      }),
      crossOrgAssign
    );
    expect(crossOrgAssign.statusCode).toBe(404);
  });

  it('executes complete production Supabase invitation lifecycle with email binding, confirmation, and atomic concurrency', async () => {
    const platformAdmin = registerAuthUser({ email: 'padmin@voxrelay.test', appRole: 'platform_admin' });

    // 1. Contact submits organization access request
    const cRes = createRes();
    await contactHandler(
      createReq({
        method: 'POST',
        url: '/api/contact',
        ip: '198.51.100.10',
        body: {
          fullName: 'Dr. Rahman',
          email: 'rahman@clinic.org',
          audience: 'organization',
          organization: 'Chattogram Medical',
          country: 'Bangladesh',
          languages: 'EN-BN',
          message: 'Please onboard our team.',
          consent: true,
        },
      }),
      cRes
    );
    expect(cRes.statusCode).toBe(201);
    expect(cRes.json().emailDispatched).toBe(false);
    expect(state.tables.access_requests[0].country).toBe('Bangladesh');

    const reqId = state.tables.access_requests[0].id;

    // 2. Concurrent approvals on the pending request -> strictly 1 succeeds (200), 2 conflict (409)
    const approvalRace = await Promise.all(
      Array.from({ length: 3 }, () => {
        const res = createRes();
        return adminHandler(
          createReq({
            method: 'POST',
            url: '/api/admin',
            headers: { authorization: `Bearer ${platformAdmin.token}` },
            body: { id: reqId, decision: 'approve', note: 'Approved' },
          }),
          res
        ).then(() => res);
      })
    );
    const okApprovals = approvalRace.filter((r) => r.statusCode === 200);
    expect(okApprovals.length).toBe(1);
    expect(approvalRace.filter((r) => r.statusCode === 409).length).toBe(2);

    const approvalJson = okApprovals[0].json();
    expect(approvalJson.emailDispatched).toBe(false);
    expect(approvalJson.orgId).toBeTruthy();
    // Must have provisioned a real verified organization row, never using raw free-text name as ID
    expect(state.tables.organizations.some((o) => o.id === approvalJson.orgId)).toBe(true);

    const inviteToken = new URL(approvalJson.inviteUrl).searchParams.get('invite');

    // 3. Wrong email is rejected (403) without consuming invite
    const wrongEmail = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        body: {
          action: 'signup',
          email: 'intruder@evil.org',
          password: 'ValidStrongPassword123!',
          fullName: 'Intruder',
          inviteToken,
        },
      }),
      wrongEmail
    );
    expect(wrongEmail.statusCode).toBe(403);

    // 4. Concurrent redemption with invited email -> strictly 1 succeeds (201)
    const redeemRace = await Promise.all(
      Array.from({ length: 5 }, () => {
        const res = createRes();
        return authHandler(
          createReq({
            method: 'POST',
            url: '/api/auth',
            body: {
              action: 'signup',
              email: 'rahman@clinic.org',
              password: 'ValidStrongPassword123!',
              fullName: 'Dr. Rahman',
              inviteToken,
            },
          }),
          res
        ).then(() => res);
      })
    );
    const createdCalls = redeemRace.filter((r) => r.statusCode === 201);
    expect(createdCalls.length).toBe(1);
    expect(redeemRace.filter((r) => r.statusCode !== 201).length).toBe(4);

    const createdBody = createdCalls[0].json();
    expect(createdBody.requiresConfirmation).toBe(true);
    expect(createdBody.user.role).toBe('interpreter'); // never platform_admin
    expect(createdBody.user.org_id).toBe(approvalJson.orgId);
    expect(createdBody.user.org_role).toBe('admin');

    const provisionedAuthUser = state.usersByEmail.get('rahman@clinic.org');
    expect(provisionedAuthUser.email_confirmed_at).toBeNull(); // email confirmation preserved
    expect(provisionedAuthUser.app_metadata.role).toBe('interpreter');

    // 5. Reapproving a redeemed request must return 409
    const reapprove = createRes();
    await adminHandler(
      createReq({
        method: 'POST',
        url: '/api/admin',
        headers: { authorization: `Bearer ${platformAdmin.token}` },
        body: { id: reqId, decision: 'approve', note: 'Retry' },
      }),
      reapprove
    );
    expect(reapprove.statusCode).toBe(409);

    // 6. Uninvited public signup always gets ordinary interpreter role with no memberships
    const publicSignup = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        body: {
          action: 'signup',
          email: 'public.interp@voxrelay.test',
          password: 'PublicInterpPassword123!',
          fullName: 'Public Interp',
          role: 'org_admin',
        },
      }),
      publicSignup
    );
    expect(publicSignup.statusCode).toBe(201);
    expect(publicSignup.json().user.role).toBe('interpreter');
    expect(publicSignup.json().user.org_id).toBeNull();
  });

  it('enforces atomic rate limit under concurrent Supabase requests and fails closed on DB errors', async () => {
    const burst = await Promise.all(
      Array.from({ length: 10 }, (_, i) => {
        const res = createRes();
        return contactHandler(
          createReq({
            method: 'POST',
            url: '/api/contact',
            ip: '203.0.113.88',
            body: { email: `burst${i}@clinic.org`, message: 'Test', consent: true },
          }),
          res
        ).then(() => res);
      })
    );
    expect(burst.filter((r) => r.statusCode === 201).length).toBe(6);
    expect(burst.filter((r) => r.statusCode === 429).length).toBe(4);

    // DB error fails closed (503) instead of allowing request through
    state.faults.failRateLimitRpc = true;
    const failedDbRes = createRes();
    await contactHandler(
      createReq({
        method: 'POST',
        url: '/api/contact',
        ip: '203.0.113.99',
        body: { email: 'dbfail@clinic.org', message: 'Test', consent: true },
      }),
      failedDbRes
    );
    expect(failedDbRes.statusCode).toBe(503);
  });

  it('rolls back / fails closed if audit write fails during Supabase review or invite signup', async () => {
    const platformAdmin = registerAuthUser({ email: 'padmin@voxrelay.test', appRole: 'platform_admin' });
    state.tables.access_requests.push({
      id: 99,
      name: 'Audit Test',
      email: 'audit.test@clinic.org',
      audience: 'interpreter',
      status: 'pending',
    });

    state.faults.failAuditInsert = true;
    const reviewErrRes = createRes();
    await adminHandler(
      createReq({
        method: 'POST',
        url: '/api/admin',
        headers: { authorization: `Bearer ${platformAdmin.token}` },
        body: { id: 99, decision: 'reject', note: 'Test' },
      }),
      reviewErrRes
    );
    expect(reviewErrRes.statusCode).toBe(500);
    expect(state.tables.access_requests.find((r) => r.id === 99).status).toBe('pending');
    state.faults.failAuditInsert = false;

    // Also verify if audit write fails during invite signup, auth user is rolled back (deleted)
    state.faults.failAuditInsert = true;
    const signupErrRes = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        body: {
          action: 'signup',
          email: 'rollback.user@voxrelay.test',
          password: 'RollbackUserPassword123!',
          fullName: 'Rollback',
        },
      }),
      signupErrRes
    );
    expect(signupErrRes.statusCode).toBe(500);
    expect(state.usersByEmail.has('rollback.user@voxrelay.test')).toBe(false);
  });
});
