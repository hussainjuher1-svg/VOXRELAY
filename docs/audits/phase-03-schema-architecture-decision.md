# ADR — Dedicated VOXRELAY schema, server-only authorization

Status: accepted for local remediation; production changes require separate approval.

## Decision

Retain `voxrelay` as the application schema. Retain the server-side service-role Supabase client. Do not redirect queries to public, create permissive public RPC wrappers, grant browser roles access, or change any live exposed-schema configuration during Phase 03.

Production's `public,graphql_public` REST allow-list and the application's `voxrelay` profile are separate configuration layers that do not agree. Creating a SQL schema or granting service_role USAGE does not expose it in PostgREST. Service-role RLS bypass does not bypass that allow-list. This is the intended architecture, not a request to expose the schema now.

## Trust boundary

Browser → same-origin VOXRELAY API → verified Auth actor + confirmation + active membership/capability/record ownership checks → server service-role PostgREST client → voxrelay.

The service role bypasses RLS: application checks must therefore be enforced before privileged queries. Browser anon/authenticated schema and table privileges remain denied; zero RLS policies is compatible with this server-only design. RPCs are SECURITY DEFINER with fixed `voxrelay,pg_catalog` search paths and exact-signature EXECUTE grants to service_role, excluding PUBLIC/anon/authenticated. Table privileges do not imply function privileges. Migration-owner default grants must be reviewed per owner.

## Local implementations

- SQLite development mode is a separate implementation, not a replica of Supabase/PostgreSQL Auth or REST.
- Direct PGlite/pg tests verify database behavior; they bypass PostgREST schema selection.
- Loopback HTTP protocol tests exercise real Supabase JS/SSR clients and application auth against a synthetic provider simulator. They do not replace GoTrue/PostgREST acceptance.
- A full compatible stack should use free PostgreSQL 17, GoTrue matching production's observed release, PostgREST and a local mail sink with synthetic keys/accounts only. No Docker/native PostgreSQL/GoTrue executables were available here; no untested compose file is presented as a working stack.

## Bootstrap/upgrade ordering

Empty disposable database: roles → core schema → 001 → 002 → lockdown, inside an isolated test boundary. Existing core+lockdown+001: reviewed transactional 002, preserving lockdown. Current core schema embeds the newer table fields but not the five RPCs/claim index: schema+lockdown alone is insufficient.

002 is prepared locally, not applied to production. Existing approved-role/status constraint guards in 001/002 now scope their existence checks to the correct table. The repository previously revised 002 in place; an installation that already ran an older version needs a reviewed forward migration/checksum policy rather than assuming the ledger proves definition parity.

## Future production gate

Before changing an exposed-schema list: confirm project ownership/shared consumers and deployed application target; verify the exact migration objects and grants; review backup/restore availability and maintenance lock budget; rehearse off production. If later approved, expose only the required profile without granting browser access and verify effective permissions plus session-aware authorization. Neither the SQL change nor the REST change alone resolves both blockers.

No production connection, SQL, configuration or permission operation was performed for this ADR.
