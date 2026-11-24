import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
    failCreateUser: false,
    failDeleteUser: false,
    failResendEmail: false,
    throwResendEmail: false,
    failFinalizeInvite: false,
    failReleaseInvite: false,
    leaseExpiresInMs: 120_000,
  },
  resendCalls: [],
};

function resetHarness() {
  state.usersByToken.clear();
  state.usersById.clear();
  state.usersByEmail.clear();
  for (const k of Object.keys(state.tables)) state.tables[k] = [];
  state.seq = { access_requests: 1, audit_events: 1, rate_events: 1 };
  state.faults = {
    failAuditInsert: false,
    failRateLimitRpc: false,
    failMembershipInsert: false,
    failCreateUser: false,
    failDeleteUser: false,
    failResendEmail: false,
    throwResendEmail: false,
    failFinalizeInvite: false,
    failReleaseInvite: false,
    leaseExpiresInMs: 120_000,
  };
  state.resendCalls = [];
  process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key-not-real';
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
      async resend(payload) {
        state.resendCalls.push(payload);
        if (state.faults.throwResendEmail) {
          throw new Error('network timeout sending mail');
        }
        if (state.faults.failResendEmail) {
          return { data: null, error: { message: 'SMTP rate limited' } };
        }
        return { data: {}, error: null };
      },
      admin: {
        async createUser({ email, email_confirm = false, user_metadata = {}, app_metadata = {} }) {
          if (state.faults.failCreateUser) {
            return { data: { user: null }, error: { message: 'Auth upstream temporary failure' } };
          }
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
          if (state.faults.failDeleteUser) {
            return { data: null, error: { message: 'deleteUser RPC error' } };
          }
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
        // Emulate single-transaction rollback if audit insert fails
        if (state.faults.failAuditInsert) {
          return { data: null, error: { message: 'audit transaction aborted' } };
        }

        let orgId = null;
        let approvedRole = 'interpreter';
        const nextStatus = args.p_decision === 'approve' ? 'approved' : 'rejected';

        if (args.p_decision === 'approve' && row.audience === 'organization') {
          orgId = row.org_id || crypto.randomUUID();
          if (!row.org_id) {
            state.tables.organizations.push({
              id: orgId,
              name: String(row.organization || '').trim().slice(0, 120) || `Organization #${row.id}`,
              created_by: args.p_reviewer_id,
              created_at: new Date().toISOString(),
            });
          }
          approvedRole = 'admin';
        }

        Object.assign(row, {
          status: nextStatus,
          reviewer_note: args.p_note || '',
          reviewed_by: args.p_reviewer_id,
          reviewed_at: new Date().toISOString(),
          invite_token_hash: args.p_decision === 'approve' ? args.p_invite_hash : null,
          invite_expires_at: args.p_decision === 'approve' ? args.p_invite_expires_at : null,
          org_id: orgId,
          approved_role: approvedRole,
          claim_token: null,
          claim_expires_at: null,
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

      if (fnName === 'reserve_access_invite') {
        const row = state.tables.access_requests.find((r) => r.invite_token_hash === args.p_token_hash);
        if (!row) return { data: { ok: false, code: 'invalid_or_used' }, error: null };
        if (row.status === 'redeemed') return { data: { ok: false, code: 'already_redeemed' }, error: null };
        if (row.status === 'rejected' || row.status === 'pending') {
          return { data: { ok: false, code: 'not_approved' }, error: null };
        }
        if (row.invite_expires_at && new Date(row.invite_expires_at).getTime() <= Date.now()) {
          return { data: { ok: false, code: 'expired' }, error: null };
        }
        if (row.email.trim().toLowerCase() !== String(args.p_email).trim().toLowerCase()) {
          return { data: { ok: false, code: 'email_mismatch' }, error: null };
        }
        if (row.status === 'reserved' && (!row.claim_expires_at || new Date(row.claim_expires_at).getTime() > Date.now())) {
          return { data: { ok: false, code: 'in_progress' }, error: null };
        }
        const claimToken = crypto.randomUUID();
        const claimExpiresAt = new Date(Date.now() + state.faults.leaseExpiresInMs).toISOString();
        row.status = 'reserved';
        row.claim_token = claimToken;
        row.claim_expires_at = claimExpiresAt;
        return {
          data: {
            ok: true,
            id: row.id,
            claim_token: claimToken,
            claim_expires_at: claimExpiresAt,
            email: row.email,
            audience: row.audience,
            org_id: row.org_id || null,
            approved_role: row.approved_role || 'interpreter',
          },
          error: null,
        };
      }

      if (fnName === 'finalize_access_invite') {
        if (state.faults.failFinalizeInvite || state.faults.failAuditInsert) {
          return { data: null, error: { message: 'finalize transaction aborted' } };
        }
        const row = state.tables.access_requests.find(
          (r) => r.id === args.p_request_id && r.status === 'reserved' && r.claim_token === args.p_claim_token
        );
        if (!row) return { data: { ok: false, code: 'lease_lost' }, error: null };
        row.status = 'redeemed';
        row.invite_token_hash = null;
        row.claim_token = null;
        row.claim_expires_at = null;
        row.provisioned_user_id = args.p_user_id;
        state.tables.audit_events.push({
          id: state.seq.audit_events++,
          actor_id: args.p_user_id,
          org_id: row.org_id || null,
          area: 'auth',
          type: 'invite_signup',
          object_ref: String(row.id),
          result: 'ok',
          created_at: new Date().toISOString(),
        });
        return { data: { ok: true, id: row.id, org_id: row.org_id || null, status: 'redeemed' }, error: null };
      }

      if (fnName === 'release_access_invite') {
        if (state.faults.failReleaseInvite) {
          return { data: null, error: { message: 'release RPC offline' } };
        }
        const row = state.tables.access_requests.find(
          (r) => r.id === args.p_request_id && r.status === 'reserved' && r.claim_token === args.p_claim_token
        );
        if (!row) return { data: false, error: null };
        row.status = 'approved';
        row.claim_token = null;
        row.claim_expires_at = null;
        return { data: true, error: null };
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

describe('Production Supabase mode (VERCEL=1): reliability, two-phase invites, rate limits & concurrency', () => {
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

  async function seedAndApproveOrgInvite({ email = 'rahman@clinic.org', orgName = 'Chattogram Medical', adminToken }) {
    const cRes = createRes();
    await contactHandler(
      createReq({
        method: 'POST',
        url: '/api/contact',
        ip: '198.51.100.10',
        body: {
          fullName: 'Dr. Rahman',
          email,
          audience: 'organization',
          organization: orgName,
          country: 'Bangladesh',
          languages: 'EN-BN',
          message: 'Onboard clinic',
          consent: true,
        },
      }),
      cRes
    );
    expect(cRes.statusCode).toBe(201);
    const reqId = state.tables.access_requests[state.tables.access_requests.length - 1].id;

    const approveRes = createRes();
    await adminHandler(
      createReq({
        method: 'POST',
        url: '/api/admin',
        headers: { authorization: `Bearer ${adminToken}` },
        body: { id: reqId, decision: 'approve', note: 'Approved' },
      }),
      approveRes
    );
    expect(approveRes.statusCode).toBe(200);
    const inviteToken = new URL(approveRes.json().inviteUrl).searchParams.get('invite');
    return { reqId, inviteToken, orgId: approveRes.json().orgId };
  }

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

    const spoofRes = createRes();
    await adminHandler(createReq({ headers: { authorization: `Bearer ${spoofedUser.token}` } }), spoofRes);
    expect(spoofRes.statusCode).toBe(403);

    const orgAdminRes = createRes();
    await adminHandler(createReq({ headers: { authorization: `Bearer ${orgAAdmin.token}` } }), orgAdminRes);
    expect(orgAdminRes.statusCode).toBe(403);

    const orgOwnerRes = createRes();
    await adminHandler(createReq({ headers: { authorization: `Bearer ${orgBAdmin.token}` } }), orgOwnerRes);
    expect(orgOwnerRes.statusCode).toBe(403);

    const platRes = createRes();
    await adminHandler(createReq({ headers: { authorization: `Bearer ${platformAdmin.token}` } }), platRes);
    expect(platRes.statusCode).toBe(200);

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

  it('Scenario 1-6: preserves invitation on createUser/duplicate/membership/finalize failures, cleans up Auth+membership, surfaces cleanup errors, and succeeds on retry', async () => {
    const platformAdmin = registerAuthUser({ email: 'padmin@voxrelay.test', appRole: 'platform_admin' });
    const { reqId, inviteToken, orgId } = await seedAndApproveOrgInvite({
      email: 'retry.lead@clinic.org',
      orgName: 'Retry Clinic',
      adminToken: platformAdmin.token,
    });

    // 1. Supabase Auth createUser failure does NOT burn the invitation
    state.faults.failCreateUser = true;
    const f1 = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        ip: '198.51.100.21',
        body: { action: 'signup', email: 'retry.lead@clinic.org', password: 'ValidStrongPassword123!', inviteToken },
      }),
      f1
    );
    expect(f1.statusCode).toBe(500);
    expect(state.tables.access_requests.find((r) => r.id === reqId).status).toBe('approved');
    state.faults.failCreateUser = false;

    // 2. Membership insertion failure deletes Auth user, releases reservation, leaves 0 memberships
    state.faults.failMembershipInsert = true;
    const f2 = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        ip: '198.51.100.22',
        body: { action: 'signup', email: 'retry.lead@clinic.org', password: 'ValidStrongPassword123!', inviteToken },
      }),
      f2
    );
    expect(f2.statusCode).toBe(500);
    expect(state.usersByEmail.has('retry.lead@clinic.org')).toBe(false);
    expect(state.tables.memberships.length).toBe(0);
    expect(state.tables.access_requests.find((r) => r.id === reqId).status).toBe('approved');
    state.faults.failMembershipInsert = false;

    // 3. Finalize / audit failure AFTER membership insertion cleans up BOTH membership AND Auth user + releases reservation
    state.faults.failFinalizeInvite = true;
    const f3 = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        ip: '198.51.100.23',
        body: { action: 'signup', email: 'retry.lead@clinic.org', password: 'ValidStrongPassword123!', inviteToken },
      }),
      f3
    );
    expect(f3.statusCode).toBe(500);
    expect(state.usersByEmail.has('retry.lead@clinic.org')).toBe(false);
    expect(state.tables.memberships.length).toBe(0); // zero orphan memberships!
    expect(state.tables.access_requests.find((r) => r.id === reqId).status).toBe('approved');
    state.faults.failFinalizeInvite = false;

    // 4. Cleanup failure itself is explicitly reported (never swallowed)
    state.faults.failMembershipInsert = true;
    state.faults.failDeleteUser = true;
    const f4 = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        ip: '198.51.100.24',
        body: { action: 'signup', email: 'retry.lead@clinic.org', password: 'ValidStrongPassword123!', inviteToken },
      }),
      f4
    );
    expect(f4.statusCode).toBe(500);
    expect(f4.json().error).toMatch(/rollback cleanup was incomplete/i);
    state.faults.failMembershipInsert = false;
    state.faults.failDeleteUser = false;
    // Reset stale user from simulated deleteUser failure before testing final retry
    state.usersByEmail.delete('retry.lead@clinic.org');
    // Force release reservation from simulated deleteUser failure
    state.tables.access_requests.find((r) => r.id === reqId).status = 'approved';

    // 5. Valid invitation succeeds on retry after all recoverable failures!
    const ok = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        ip: '198.51.100.25',
        body: { action: 'signup', email: 'retry.lead@clinic.org', password: 'ValidStrongPassword123!', inviteToken },
      }),
      ok
    );
    expect(ok.statusCode).toBe(201);
    expect(ok.json().accountCreated).toBe(true);
    expect(ok.json().confirmationEmailSent).toBe(true);
    expect(ok.json().user.org_id).toBe(orgId);
    expect(ok.json().user.org_role).toBe('admin');
    expect(state.tables.memberships.length).toBe(1);
    expect(state.tables.access_requests.find((r) => r.id === reqId).status).toBe('redeemed');
  });

  it('Scenario 2 & 7-8: handles duplicate-email 409 safely, prevents concurrent invite redemption, and recovers expired reservation leases', async () => {
    const platformAdmin = registerAuthUser({ email: 'padmin@voxrelay.test', appRole: 'platform_admin' });

    // Duplicate email pre-existing: 409 preserves invitation status as approved
    registerAuthUser({ email: 'existing@clinic.org', appRole: 'interpreter' });
    const dupInvite = await seedAndApproveOrgInvite({
      email: 'existing@clinic.org',
      orgName: 'Dup Clinic',
      adminToken: platformAdmin.token,
    });
    const dupRes = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        ip: '198.51.100.30',
        body: {
          action: 'signup',
          email: 'existing@clinic.org',
          password: 'ValidStrongPassword123!',
          inviteToken: dupInvite.inviteToken,
        },
      }),
      dupRes
    );
    expect(dupRes.statusCode).toBe(409);
    expect(state.tables.access_requests.find((r) => r.id === dupInvite.reqId).status).toBe('approved');

    // Concurrent invite redemption -> strictly 1 succeeds (201)
    const concInvite = await seedAndApproveOrgInvite({
      email: 'conc.user@clinic.org',
      orgName: 'Concurrent Clinic',
      adminToken: platformAdmin.token,
    });
    const race = await Promise.all(
      Array.from({ length: 5 }, (_, idx) => {
        const res = createRes();
        return authHandler(
          createReq({
            method: 'POST',
            url: '/api/auth',
            ip: `198.51.100.${40 + idx}`,
            body: {
              action: 'signup',
              email: 'conc.user@clinic.org',
              password: 'ValidStrongPassword123!',
              inviteToken: concInvite.inviteToken,
            },
          }),
          res
        ).then(() => res);
      })
    );
    expect(race.filter((r) => r.statusCode === 201).length).toBe(1);
    expect(race.filter((r) => r.statusCode !== 201).length).toBe(4);
    expect(state.tables.memberships.filter((m) => m.org_id === concInvite.orgId).length).toBe(1);

    // Expired reservation lease recovery
    const leaseInvite = await seedAndApproveOrgInvite({
      email: 'lease.recover@clinic.org',
      orgName: 'Lease Recovery Clinic',
      adminToken: platformAdmin.token,
    });
    const reqObj = state.tables.access_requests.find((r) => r.id === leaseInvite.reqId);
    reqObj.status = 'reserved';
    reqObj.claim_token = crypto.randomUUID();
    reqObj.claim_expires_at = new Date(Date.now() - 5000).toISOString();

    const recovered = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        ip: '198.51.100.50',
        body: {
          action: 'signup',
          email: 'lease.recover@clinic.org',
          password: 'ValidStrongPassword123!',
          inviteToken: leaseInvite.inviteToken,
        },
      }),
      recovered
    );
    expect(recovered.statusCode).toBe(201);
    expect(state.tables.access_requests.find((r) => r.id === leaseInvite.reqId).status).toBe('redeemed');
  });

  it('Scenario 9-11: concurrent approvals create strictly 1 org, and rejected or audit-failed reviews leave zero orphan orgs', async () => {
    const platformAdmin = registerAuthUser({ email: 'padmin@voxrelay.test', appRole: 'platform_admin' });

    // 1. Concurrent organization approvals -> 1 winner, 1 organization
    state.tables.access_requests.push({
      id: 101,
      name: 'Race Org',
      email: 'raceorg@clinic.org',
      audience: 'organization',
      organization: 'Race Medical',
      status: 'pending',
    });
    const approvalRace = await Promise.all(
      Array.from({ length: 3 }, () => {
        const res = createRes();
        return adminHandler(
          createReq({
            method: 'POST',
            url: '/api/admin',
            headers: { authorization: `Bearer ${platformAdmin.token}` },
            body: { id: 101, decision: 'approve', note: 'Approved' },
          }),
          res
        ).then(() => res);
      })
    );
    expect(approvalRace.filter((r) => r.statusCode === 200).length).toBe(1);
    expect(approvalRace.filter((r) => r.statusCode === 409).length).toBe(2);
    expect(state.tables.organizations.filter((o) => o.name === 'Race Medical').length).toBe(1);

    // 2. Audit failure on organization approval leaves ZERO orphan organizations
    state.tables.access_requests.push({
      id: 102,
      name: 'Rollback Org',
      email: 'rborg@clinic.org',
      audience: 'organization',
      organization: 'Rollback Medical',
      status: 'pending',
    });
    state.faults.failAuditInsert = true;
    const failRev = createRes();
    await adminHandler(
      createReq({
        method: 'POST',
        url: '/api/admin',
        headers: { authorization: `Bearer ${platformAdmin.token}` },
        body: { id: 102, decision: 'approve', note: 'Approve' },
      }),
      failRev
    );
    expect(failRev.statusCode).toBe(500);
    expect(state.tables.organizations.filter((o) => o.name === 'Rollback Medical').length).toBe(0);
    expect(state.tables.access_requests.find((r) => r.id === 102).status).toBe('pending');
    state.faults.failAuditInsert = false;

    // 3. Rejected organization request never creates an organization
    state.tables.access_requests.push({
      id: 103,
      name: 'Rejected Org',
      email: 'rejorg@clinic.org',
      audience: 'organization',
      organization: 'Rejected Medical',
      status: 'pending',
    });
    const rejRes = createRes();
    await adminHandler(
      createReq({
        method: 'POST',
        url: '/api/admin',
        headers: { authorization: `Bearer ${platformAdmin.token}` },
        body: { id: 103, decision: 'reject', note: 'Not eligible' },
      }),
      rejRes
    );
    expect(rejRes.statusCode).toBe(200);
    expect(state.tables.organizations.filter((o) => o.name === 'Rejected Medical').length).toBe(0);
  });

  it('Scenario 12: enforces atomic rate limits on public signup, contact, and fails closed on DB error', async () => {
    const signupBurst = await Promise.all(
      Array.from({ length: 8 }, (_, i) => {
        const res = createRes();
        return authHandler(
          createReq({
            method: 'POST',
            url: '/api/auth',
            ip: '198.51.100.77',
            body: {
              action: 'signup',
              email: `burst.signup.${i}@clinic.org`,
              password: 'ValidStrongPassword123!',
              fullName: 'Burst User',
            },
          }),
          res
        ).then(() => res);
      })
    );
    expect(signupBurst.filter((r) => r.statusCode === 201).length).toBe(5);
    expect(signupBurst.filter((r) => r.statusCode === 429).length).toBe(3);

    // DB rate limiter error fails closed (503) before creating any user
    state.faults.failRateLimitRpc = true;
    const failedDbRes = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        ip: '198.51.100.99',
        body: {
          action: 'signup',
          email: 'dbfail.signup@clinic.org',
          password: 'ValidStrongPassword123!',
        },
      }),
      failedDbRes
    );
    expect(failedDbRes.statusCode).toBe(503);
    expect(state.usersByEmail.has('dbfail.signup@clinic.org')).toBe(false);
  });

  it('Scenario 13: reports confirmation email failures truthfully, preserves invites on dispatch error, and supports safe resend_confirmation', async () => {
    const platformAdmin = registerAuthUser({ email: 'padmin@voxrelay.test', appRole: 'platform_admin' });
    const { reqId, inviteToken, orgId } = await seedAndApproveOrgInvite({
      email: 'mailfail.invite@clinic.org',
      orgName: 'Mail Fail Clinic',
      adminToken: platformAdmin.token,
    });

    // Missing anonKey on invited signup -> rolls back user+membership & preserves invite (503)
    delete process.env.VITE_SUPABASE_ANON_KEY;
    const noKeyRes = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        ip: '198.51.100.120',
        body: {
          action: 'signup',
          email: 'mailfail.invite@clinic.org',
          password: 'ValidStrongPassword123!',
          inviteToken,
        },
      }),
      noKeyRes
    );
    expect(noKeyRes.statusCode).toBe(503);
    expect(noKeyRes.json().accountCreated).toBe(false);
    expect(noKeyRes.json().confirmationEmailSent).toBe(false);
    expect(noKeyRes.json().invitePreserved).toBe(true);
    expect(state.usersByEmail.has('mailfail.invite@clinic.org')).toBe(false);
    expect(state.tables.memberships.filter((m) => m.org_id === orgId).length).toBe(0);
    expect(state.tables.access_requests.find((r) => r.id === reqId).status).toBe('approved');
    process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key-not-real';

    // Uninvited signup when resend() returns an error -> truthful accountCreated=true, confirmationEmailSent=false
    state.faults.failResendEmail = true;
    const uninvitedRes = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        ip: '198.51.100.121',
        body: {
          action: 'signup',
          email: 'unconfirmed.interp@clinic.org',
          password: 'ValidStrongPassword123!',
        },
      }),
      uninvitedRes
    );
    expect(uninvitedRes.statusCode).toBe(201);
    expect(uninvitedRes.json().accountCreated).toBe(true);
    expect(uninvitedRes.json().confirmationEmailSent).toBe(false);
    expect(uninvitedRes.json().confirmationWarning).toBeTruthy();

    // Retry via action='resend_confirmation' recovers without creating a duplicate account
    state.faults.failResendEmail = false;
    const userCountBefore = state.usersByEmail.size;
    const resendOk = createRes();
    await authHandler(
      createReq({
        method: 'POST',
        url: '/api/auth',
        ip: '198.51.100.122',
        body: {
          action: 'resend_confirmation',
          email: 'unconfirmed.interp@clinic.org',
        },
      }),
      resendOk
    );
    expect(resendOk.statusCode).toBe(200);
    expect(resendOk.json().confirmationEmailSent).toBe(true);
    expect(state.usersByEmail.size).toBe(userCountBefore);
  });
});
