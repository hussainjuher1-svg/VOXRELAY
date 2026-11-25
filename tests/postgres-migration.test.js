import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';

const rootDir = process.cwd();
const schemaSql = fs.readFileSync(path.join(rootDir, 'db/schema.sql'), 'utf8');
const mig001Sql = fs.readFileSync(path.join(rootDir, 'db/migrations/001_access_requests_and_terms_notes.sql'), 'utf8');
const mig002Sql = fs.readFileSync(path.join(rootDir, 'db/migrations/002_atomic_invites_and_rate_limits.sql'), 'utf8');
const lockdownSql = fs.readFileSync(path.join(rootDir, 'db/lockdown.sql'), 'utf8');

const ROLE_PREAMBLE = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;
`;

describe('Real PostgreSQL schema, lockdown, migrations & PL/pgSQL RPCs', () => {
  const databaseUrl = process.env.DATABASE_URL || '';
  let usePool = Boolean(databaseUrl);
  let pool = null;
  let pglite = null;

  async function execSql(sql) {
    if (usePool) {
      await pool.query(sql);
    } else {
      await pglite.exec(sql);
    }
  }

  async function querySql(sql, params = []) {
    if (usePool) {
      return await pool.query(sql, params);
    }
    return await pglite.query(sql, params);
  }

  async function withPinnedClient(fn) {
    if (usePool) {
      const client = await pool.connect();
      try {
        return await fn({
          query: (sql, params = []) => client.query(sql, params),
        });
      } finally {
        client.release();
      }
    }
    return await fn({
      query: (sql, params = []) => pglite.query(sql, params),
    });
  }

  beforeAll(async () => {
    if (usePool) {
      pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
      await execSql('DROP SCHEMA IF EXISTS voxrelay CASCADE;');
    } else {
      pglite = new PGlite();
    }

    // Apply in documented deployment order: roles -> schema -> 001 -> 002 -> lockdown
    await execSql(ROLE_PREAMBLE);
    await execSql(schemaSql);
    await execSql(mig001Sql);
    await execSql(mig002Sql);
    await execSql(lockdownSql);
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (pglite) await pglite.close();
  });

  it('enforces SECURITY DEFINER, fixed search_path, and strict role privileges (service_role only)', async () => {
    const fns = [
      'voxrelay.review_access_request(bigint, text, text, uuid, text, timestamptz)',
      'voxrelay.reserve_access_invite(text, text, integer)',
      'voxrelay.finalize_access_invite(bigint, uuid, uuid)',
      'voxrelay.release_access_invite(bigint, uuid)',
      'voxrelay.consume_rate_limit(text, integer, bigint)',
    ];

    for (const sig of fns) {
      const priv = await querySql(
        `SELECT
          has_function_privilege('service_role', $1, 'EXECUTE') AS sr,
          has_function_privilege('authenticated', $1, 'EXECUTE') AS auth,
          has_function_privilege('anon', $1, 'EXECUTE') AS anon,
          has_function_privilege('public', $1, 'EXECUTE') AS pub`,
        [sig]
      );
      expect(priv.rows[0].sr).toBe(true);
      expect(priv.rows[0].auth).toBe(false);
      expect(priv.rows[0].anon).toBe(false);
      expect(priv.rows[0].pub).toBe(false);
    }

    const meta = await querySql(
      `SELECT p.proname, p.prosecdef, p.proconfig
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'voxrelay'
         AND p.proname IN ('review_access_request', 'reserve_access_invite', 'finalize_access_invite', 'release_access_invite', 'consume_rate_limit')`
    );
    expect(meta.rows.length).toBe(5);
    for (const row of meta.rows) {
      expect(row.prosecdef).toBe(true);
      expect(row.proconfig).toContain('search_path=voxrelay, pg_catalog');
    }

    // Schema usage revoked from anon & authenticated
    const schemaPriv = await querySql(
      `SELECT
        has_schema_privilege('service_role', 'voxrelay', 'USAGE') AS sr,
        has_schema_privilege('authenticated', 'voxrelay', 'USAGE') AS auth,
        has_schema_privilege('anon', 'voxrelay', 'USAGE') AS anon`
    );
    expect(schemaPriv.rows[0]).toEqual({ sr: true, auth: false, anon: false });
  });

  it('provisions organizations inside review_access_request transaction, rolls back cleanly, and rejects re-approval', async () => {
    const reviewerId = crypto.randomUUID();
    const ins = await querySql(
      `INSERT INTO voxrelay.access_requests (name, email, audience, organization, country, languages, consent, status, message)
       VALUES ('Dr. Karim', 'karim@dhaka.org', 'organization', 'Dhaka Health', 'BD', 'EN-BN', true, 'pending', 'Please approve')
       RETURNING id`
    );
    const reqId = Number(ins.rows[0].id);

    // Verify rollback on ONE pinned connection leaves zero organizations, zero approval audit events, and status='pending'
    await withPinnedClient(async (db) => {
      await db.query('BEGIN');
      const rolledBackRes = await db.query(
        `SELECT voxrelay.review_access_request($1, 'approve', 'note', $2, 'hash-rollback', now() + interval '1 day') AS res`,
        [reqId, reviewerId]
      );
      expect(rolledBackRes.rows[0].res.ok).toBe(true);
      await db.query('ROLLBACK');

      const afterRollbackReq = await db.query('SELECT status, org_id FROM voxrelay.access_requests WHERE id = $1', [reqId]);
      expect(afterRollbackReq.rows[0].status).toBe('pending');
      expect(afterRollbackReq.rows[0].org_id).toBeNull();

      const orgCountAfterRb = await db.query("SELECT COUNT(*)::int AS c FROM voxrelay.organizations WHERE name = 'Dhaka Health'");
      expect(orgCountAfterRb.rows[0].c).toBe(0);

      const auditCountAfterRb = await db.query(
        "SELECT COUNT(*)::int AS c FROM voxrelay.audit_events WHERE object_ref = $1 AND type = 'access_request_approved'",
        [String(reqId)]
      );
      expect(auditCountAfterRb.rows[0].c).toBe(0);
    });

    // Commit real approval
    const committed = await querySql(
      `SELECT voxrelay.review_access_request($1, 'approve', 'verified', $2, 'hash-dhaka-1', now() + interval '7 days') AS res`,
      [reqId, reviewerId]
    );
    const body = committed.rows[0].res;
    expect(body.ok).toBe(true);
    expect(body.status).toBe('approved');
    expect(body.approved_role).toBe('admin');
    expect(body.org_id).toBeTruthy();

    // Organization and audit_events were created transactionally
    const orgRow = await querySql('SELECT id, name FROM voxrelay.organizations WHERE id = $1', [body.org_id]);
    expect(orgRow.rows[0].name).toBe('Dhaka Health');
    const auditRow = await querySql(
      "SELECT type, result, org_id FROM voxrelay.audit_events WHERE object_ref = $1 AND type = 'access_request_approved'",
      [String(reqId)]
    );
    expect(auditRow.rows.length).toBe(1);
    expect(auditRow.rows[0].org_id).toBe(body.org_id);

    // Re-approving returns already_reviewed and creates NO second organization
    const reapprove = await querySql(
      `SELECT voxrelay.review_access_request($1, 'approve', 'dup', $2, 'hash-dhaka-2', now() + interval '7 days') AS res`,
      [reqId, reviewerId]
    );
    expect(reapprove.rows[0].res).toMatchObject({ ok: false, code: 'already_reviewed', status: 'approved' });
    const orgCountFinal = await querySql("SELECT COUNT(*)::int AS c FROM voxrelay.organizations WHERE name = 'Dhaka Health'");
    expect(orgCountFinal.rows[0].c).toBe(1);

    // Rejected organization request creates zero organizations
    const rejIns = await querySql(
      `INSERT INTO voxrelay.access_requests (name, email, audience, organization, consent, status, message)
       VALUES ('Fake Org', 'fake@nope.org', 'organization', 'Never Created Org', true, 'pending', 'test')
       RETURNING id`
    );
    const rejRes = await querySql(
      `SELECT voxrelay.review_access_request($1, 'reject', 'declined', $2, NULL, NULL) AS res`,
      [Number(rejIns.rows[0].id), reviewerId]
    );
    expect(rejRes.rows[0].res).toMatchObject({ ok: true, status: 'rejected' });
    const neverOrg = await querySql("SELECT COUNT(*)::int AS c FROM voxrelay.organizations WHERE name = 'Never Created Org'");
    expect(neverOrg.rows[0].c).toBe(0);
  });

  it('executes two-phase invite reserve/release/lease-expiry/finalize against real PostgreSQL', async () => {
    const reviewerId = crypto.randomUUID();
    const ins = await querySql(
      `INSERT INTO voxrelay.access_requests (name, email, audience, organization, consent, status, message)
       VALUES ('Nadia', 'nadia@chittagong.org', 'organization', 'Chittagong Care', true, 'pending', 'onboard')
       RETURNING id`
    );
    const reqId = Number(ins.rows[0].id);
    await querySql(
      `SELECT voxrelay.review_access_request($1, 'approve', 'ok', $2, 'hash-nadia', now() + interval '7 days')`,
      [reqId, reviewerId]
    );

    // Wrong email cannot reserve
    const wrongEmail = await querySql(`SELECT voxrelay.reserve_access_invite('hash-nadia', 'other@evil.org', 60) AS res`);
    expect(wrongEmail.rows[0].res).toMatchObject({ ok: false, code: 'email_mismatch' });

    // First reservation succeeds with claim_token, keeping invite_token_hash intact
    const res1 = await querySql(`SELECT voxrelay.reserve_access_invite('hash-nadia', 'NADIA@chittagong.org', 60) AS res`);
    expect(res1.rows[0].res.ok).toBe(true);
    const claimToken1 = res1.rows[0].res.claim_token;
    expect(claimToken1).toBeTruthy();

    // Concurrent/overlapping reservation while lease is active returns in_progress
    const res2 = await querySql(`SELECT voxrelay.reserve_access_invite('hash-nadia', 'nadia@chittagong.org', 60) AS res`);
    expect(res2.rows[0].res).toMatchObject({ ok: false, code: 'in_progress' });

    // Releasing reservation makes invitation safely retryable
    const rel = await querySql(`SELECT voxrelay.release_access_invite($1, $2::uuid) AS released`, [reqId, claimToken1]);
    expect(rel.rows[0].released).toBe(true);

    // Re-reserving succeeds; simulate expired lease -> recoverable by next attempt
    const res3 = await querySql(`SELECT voxrelay.reserve_access_invite('hash-nadia', 'nadia@chittagong.org', 60) AS res`);
    expect(res3.rows[0].res.ok).toBe(true);
    const claimToken3 = res3.rows[0].res.claim_token;
    await querySql(`UPDATE voxrelay.access_requests SET claim_expires_at = now() - interval '5 seconds' WHERE id = $1`, [reqId]);

    const res4 = await querySql(`SELECT voxrelay.reserve_access_invite('hash-nadia', 'nadia@chittagong.org', 60) AS res`);
    expect(res4.rows[0].res.ok).toBe(true);
    const claimToken4 = res4.rows[0].res.claim_token;
    expect(claimToken4).not.toBe(claimToken3);

    // Stale claim_token3 cannot finalize
    const userId = crypto.randomUUID();
    const staleFin = await querySql(`SELECT voxrelay.finalize_access_invite($1, $2::uuid, $3::uuid) AS res`, [
      reqId,
      claimToken3,
      userId,
    ]);
    expect(staleFin.rows[0].res).toMatchObject({ ok: false, code: 'lease_lost' });

    // Valid claim_token4 finalizes to redeemed + clears hash + writes audit
    const fin = await querySql(`SELECT voxrelay.finalize_access_invite($1, $2::uuid, $3::uuid) AS res`, [
      reqId,
      claimToken4,
      userId,
    ]);
    expect(fin.rows[0].res).toMatchObject({ ok: true, status: 'redeemed' });

    const finalRow = await querySql(
      'SELECT status, invite_token_hash, claim_token, provisioned_user_id FROM voxrelay.access_requests WHERE id = $1',
      [reqId]
    );
    expect(finalRow.rows[0]).toEqual({
      status: 'redeemed',
      invite_token_hash: null,
      claim_token: null,
      provisioned_user_id: userId,
    });
  });

  it('enforces consume_rate_limit and multi-connection concurrency when DATABASE_URL is configured', async () => {
    if (usePool) {
      // Simultaneous independent TCP connections racing on consume_rate_limit
      const rateKey = `pg-conn-burst-${crypto.randomUUID()}`;
      const rateBurst = await Promise.all(
        Array.from({ length: 10 }, async () => {
          const client = await pool.connect();
          try {
            const r = await client.query('SELECT voxrelay.consume_rate_limit($1, 6, 3600000) AS allowed', [rateKey]);
            return r.rows[0].allowed;
          } finally {
            client.release();
          }
        })
      );
      expect(rateBurst.filter(Boolean).length).toBe(6);
      expect(rateBurst.filter((x) => !x).length).toBe(4);

      // Simultaneous independent TCP connections racing on review_access_request
      const reviewerId = crypto.randomUUID();
      const ins = await querySql(
        `INSERT INTO voxrelay.access_requests (name, email, audience, organization, consent, status, message)
         VALUES ('Concurrent Org', 'conc@org.test', 'organization', 'Concurrent Health', true, 'pending', 'race')
         RETURNING id`
      );
      const reqId = Number(ins.rows[0].id);

      const approvalBurst = await Promise.all(
        Array.from({ length: 4 }, async (_, idx) => {
          const client = await pool.connect();
          try {
            const r = await client.query(
              `SELECT voxrelay.review_access_request($1, 'approve', 'race', $2, $3, now() + interval '7 days') AS res`,
              [reqId, reviewerId, `hash-conc-${idx}`]
            );
            return r.rows[0].res;
          } finally {
            client.release();
          }
        })
      );
      expect(approvalBurst.filter((r) => r.ok === true).length).toBe(1);
      expect(approvalBurst.filter((r) => r.code === 'already_reviewed').length).toBe(3);

      const orgCount = await querySql("SELECT COUNT(*)::int AS c FROM voxrelay.organizations WHERE name = 'Concurrent Health'");
      expect(orgCount.rows[0].c).toBe(1);
    } else {
      // Embedded PostgreSQL 17 sequential quota verification
      const key = `pglite-rate-${crypto.randomUUID()}`;
      const results = [];
      for (let i = 0; i < 8; i++) {
        const r = await querySql('SELECT voxrelay.consume_rate_limit($1, 5, 3600000) AS allowed', [key]);
        results.push(r.rows[0].allowed);
      }
      expect(results.filter(Boolean).length).toBe(5);
      expect(results.filter((x) => !x).length).toBe(3);
    }
  });
});
