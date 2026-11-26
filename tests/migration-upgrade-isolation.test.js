import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const schema = fs.readFileSync('db/schema.sql', 'utf8');
const one = fs.readFileSync('db/migrations/001_access_requests_and_terms_notes.sql', 'utf8');
const two = fs.readFileSync('db/migrations/002_atomic_invites_and_rate_limits.sql', 'utf8');
const lockdown = fs.readFileSync('db/lockdown.sql', 'utf8');
const roles = 'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;';
// Synthetic old shape, not a dump of customer data. Remove only access-request
// 002 additions, leaving other tables/relationships intact.
const oldSchema = schema.replace(/(CREATE TABLE IF NOT EXISTS voxrelay\.access_requests \()([\s\S]*?)(\n\);)/, (_, start, body, end) => start + body
  .replace(/^ {2}(org_id|approved_role|claim_token|claim_expires_at|provisioned_user_id) .*\n/gm, '')
  .replace("'approved', 'reserved',", "'approved',") + end);

describe('isolated old-schema upgrade (PGlite only; no external URL)', () => {
  it('upgrades core+lockdown+001, reruns 002, validates columns/FK/index/RPC grants, and recovers a rolled-back DDL transaction', async () => {
    const db = new PGlite();
    try {
      await db.exec(roles + oldSchema + lockdown + one);
      // Same constraint name in another schema must not suppress our constraint.
      await db.exec("CREATE TABLE public.unrelated (role text CONSTRAINT access_requests_approved_role_check CHECK (role <> 'x'));");
      const before = await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='voxrelay' AND table_name='access_requests'");
      expect(before.rows[0].n).toBe(16);
      await db.exec('BEGIN;' + two + 'ROLLBACK;');
      expect((await db.query("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='voxrelay'")).rows[0].n).toBe(0);
      await db.exec('BEGIN;' + two + 'COMMIT;');
      await db.exec('BEGIN;' + two + 'COMMIT;');
      const cols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='voxrelay' AND table_name='access_requests'");
      expect(cols.rows).toHaveLength(21);
      for (const name of ['org_id', 'approved_role', 'claim_token', 'claim_expires_at', 'provisioned_user_id']) expect(cols.rows).toContainEqual({ column_name: name });
      const constraints = (await db.query("SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='voxrelay.access_requests'::regclass")).rows;
      expect(constraints.find((r) => r.conname === 'access_requests_status_check').def).toContain('reserved');
      expect(constraints.find((r) => r.conname === 'access_requests_org_id_fkey').def).toContain('REFERENCES voxrelay.organizations(id) ON DELETE SET NULL');
      expect(constraints.find((r) => r.conname === 'access_requests_approved_role_check').def).toContain('admin');
      const idx = (await db.query("SELECT indexdef FROM pg_indexes WHERE schemaname='voxrelay' AND indexname='idx_voxrelay_access_requests_claim'")).rows;
      expect(idx[0].indexdef).toContain('(id, claim_token) WHERE (claim_token IS NOT NULL)');
      const fns = (await db.query("SELECT p.proname, p.prosecdef, p.proconfig, has_function_privilege('service_role',p.oid,'EXECUTE') AS allowed, has_function_privilege('anon',p.oid,'EXECUTE') AS anon, has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='voxrelay'")).rows;
      expect(fns.map((r) => r.proname).sort()).toEqual(['consume_rate_limit', 'finalize_access_invite', 'release_access_invite', 'reserve_access_invite', 'review_access_request']);
      for (const f of fns) {
        expect(f.prosecdef).toBe(true);
        expect(f.proconfig).toContain('search_path=voxrelay, pg_catalog');
        expect([f.allowed, f.anon, f.authenticated]).toEqual([true, false, false]);
      }
      // Relationship behavior with synthetic rows, including delete action.
      await db.exec("INSERT INTO voxrelay.organizations(id,name,created_by) VALUES ('00000000-0000-4000-8000-000000000001','Synthetic org','00000000-0000-4000-8000-000000000002'); INSERT INTO voxrelay.access_requests(email,org_id) VALUES ('synthetic@example.test','00000000-0000-4000-8000-000000000001'); DELETE FROM voxrelay.organizations;");
      expect((await db.query('SELECT org_id FROM voxrelay.access_requests')).rows[0].org_id).toBeNull();
      await expect(db.exec("INSERT INTO voxrelay.access_requests(email,org_id) VALUES ('bad@example.test','00000000-0000-4000-8000-000000000099')")).rejects.toThrow();
    } finally { await db.close(); }
  }, 30000);
});
