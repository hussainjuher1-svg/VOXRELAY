-- VOXRELAY database lockdown
-- Run once in the Supabase SQL Editor after db/schema.sql.
-- Blocks direct client-side PostgREST reads/writes via anon or authenticated keys,
-- while ensuring the server-side service_role retains schema/table access.

GRANT USAGE ON SCHEMA voxrelay TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA voxrelay TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA voxrelay TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA voxrelay GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA voxrelay GRANT ALL ON SEQUENCES TO service_role;

DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'profiles',
    'availability_overrides',
    'organizations',
    'memberships',
    'invitations',
    'assignments',
    'assignment_events',
    'assignment_links',
    'device_checks',
    'terms',
    'term_versions',
    'resources',
    'saved_resources',
    'support_requests',
    'support_messages',
    'assistance_policies',
    'audit_events',
    'consents',
    'access_requests',
    'rate_events',
    'session_events',
    'session_docs',
    'followups',
    'billing_settings',
    'billing_records'
  ]
  LOOP
    FOR pol IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'voxrelay' AND tablename = tbl
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON voxrelay.%I', pol.policyname, tbl);
    END LOOP;

    EXECUTE format('ALTER TABLE voxrelay.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('REVOKE ALL ON TABLE voxrelay.%I FROM anon, authenticated', tbl);
  END LOOP;
END $$;

REVOKE USAGE ON SCHEMA voxrelay FROM anon, authenticated;
