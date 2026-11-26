# Engineering readiness recheck — BLOCKED / NOT READY

## Execution boundary

User requested sequential genuine GoTrue, PostgREST, full-stack browser acceptance and production-readiness hardening, with halt on verification failure. The real-service track stopped at Phase 1 prerequisites. No substitute token/session/response mocks, production tests/accounts/writes/configuration changes, migrations, deployments, commits or pushes. Existing frontend env/provider settings were not assumed to describe an approved disposable target. No credential values were output.

## Status table

| Requested phase | Current status | Evidence / remaining gate |
|---|---|---|
| 1. Real GoTrue | BLOCKED at prerequisite verification | `preflight.log`: no docker/podman/gotrue/go executable on PATH, no root compose/Dockerfile, relevant local GoTrue configuration absent, no loopback listeners at 5432/55435/9999/3000. No auth schema/search_path/migration verification. |
| 2. Real PostgREST and RLS | NOT RUN, dependent on Phase 1 | postgrest absent on PATH, PGRST settings absent. No HTTP CRUD, JWT signing-key matching, exposed-table/bucket RLS or service-role bundle audit executed in this sequential run. |
| 3. Full-stack browser acceptance | NOT RUN | Genuine stack unavailable. Separate isolated public styling browser checks do NOT satisfy this phase. |
| 4. Production hardening | NOT RUN as complete phase | Build/lint executed for independent UI modification only. Secret/default-key audit, actual production bind interfaces, restart/health/pool configuration, automated backups and real restore rehearsal remain unverified. |

## Exact failure summary

```
FAIL PHASE 1 PREREQUISITE: no isolated GoTrue executable/container runtime or verified endpoint configured.
HALT: no signup, token issuance, refresh, user, logout, PostgREST writes, or production operations attempted.
HTTP statuses: NOT RUN; no real service endpoint verified. No token/session/response mocks substituted.
```

Full fresh redacted preflight output is in `preflight.log`. This reports PATH/config/listener observations, not proof that every possible binary location was searched. Prior official artifact download failures are recorded in `../phase-03-6-local-environment-recovery.md`; not repeated here. Historical native PostgreSQL17 results do not prove real Auth/REST behavior. Lack of a listener on loopback does not establish safe production port exposure.

## Separate UI verification

Cardless workspace change: lint PASS (`lint.log`), 36 files / 263 tests PASS (`tests.log`), TypeScript + Vite build PASS (`build.log`, existing >500kB chunk warning remains). These are not all real integrations: the existing suite includes mocks. Isolated public Chromium checks at 390/768/1440 passed; evidence at `../cardless-workspace/`. APIs/external requests blocked in that visual-only harness. No claim of security audit completion or deployment readiness.

## Required unblock

Supply an approved free isolated runner with official GoTrue/PostgREST binaries or a working container runtime plus access to official artifacts, and a disposable PostgreSQL17 database. Alternatively configure an explicitly approved disposable full-stack target via the secure environment, not credentials in chat. Keep it separate from production. Then rerun Phase 1, capture genuine HTTP status codes and redacted provider logs, and proceed only after each phase passes. Production operations remain separately gated.

## GitHub-hosted real-service audit (new execution path)

Workflow: `.github/workflows/readiness-audit.yml`. This bypasses the sandbox's missing Docker by using GitHub's `ubuntu-latest` Docker runner with `supabase/setup-cli@v3` and pinned CLI 2.65.5. It runs sequentially on pull requests and manual dispatch. **Added/configuration-reviewed here, not yet executed on GitHub; all four phases remain unverified until run evidence is available.** No green readiness claim from authoring a workflow.

### Run instructions

1. Push the committed current branch, `arena/f6a5e069-voxrelay`, then open/update its pull request. The `pull_request` trigger executes the audit automatically. No repository secrets or production Supabase connection are required.
2. Manual Actions buttons normally require the workflow definition on the default branch. Once available there: Actions → **Real-service readiness audit** → **Run workflow** → select the branch. CLI equivalent: `gh workflow run readiness-audit.yml --ref arena/f6a5e069-voxrelay`. Before it exists on the default branch, use the PR trigger rather than assuming dispatch will be available.
3. Follow the run with `gh run list --workflow readiness-audit.yml --branch arena/f6a5e069-voxrelay`, then `gh run watch <actual-run-id> --exit-status`. Get the ID from the list; do not substitute a guessed ID.
4. Read the job summary gate table. Download **readiness-evidence** from that run for HTTP method/path/status evidence, SQL/RLS inventory, build/test logs, browser screenshots/results, and restore results. Failure stops subsequent gates; later skipped steps are NOT passes. The job always attempts cleanup and artifact upload.
5. Review any failed endpoint/assertion from the first failed step before changing configuration or retrying. The workflow intentionally does not auto-update/commit this status file or relax security policies.

### Test scope and safety

- CLI initializes an ignored `.cache/readiness/supabase` configuration. PostgreSQL major 17 is asserted. CLI's **local-only test keys** are used only with loopback endpoints; they must never be deployed or copied to production. No GitHub production secrets are referenced. Keys exported to subsequent steps are masked; refresh/access tokens and test passwords are not written to evidence. Test emails use random example.com identities; local Inbucket handles mail. These are disposable tests, not a production default-secret audit.
- The repo schema, ordered migrations, and `db/lockdown.sql` are applied without weakening app-table policies. Auth migration presence and a session `search_path=auth` query are checked; this does not assert a production GoTrue role's configured search path. The workflow checks PG17, exposed-table RLS, policy inventory and empty/private bucket state. A future public bucket fails this strict isolated gate for review.
- **Architecture distinction:** application `voxrelay` tables deliberately deny direct browser access. Authenticated application-table denial is tested. A test-only `public.readiness_probe` with explicit `auth.uid()` owner policy exercises real PostgREST CRUD and cross-user denial. Probe CRUD is NOT proof of every application API route. No probe migration enters `db/` or production.
- Auth checks: health, signup, password token issuance, refresh token rotation, authenticated user, logout, refresh rejection and stale-user rejection. Assertions log only method/path/status, not JWT bodies. A changed provider logout semantic fails the gate rather than silently accepting stale access.
- Playwright uses actual app signup/sign-in/logout forms and protected routes against the local API, reload persistence, desktop/mobile layouts, plus browser-issued genuine-token probe CRUD. No network interception or auth/session mock. Valid flows reject console errors and 401/403/500 responses. Denial tests are scoped separately. The repository's signup/confirmation behavior may reveal a real acceptance failure; no fake confirmation bypass is provided.
- Build and lint must pass. Bundle scanning checks the actual disposable service key is absent, and rejects secret-style `VITE_` env names. Schema dump/restore is rehearsed into a separate disposable database. Dump data is not uploaded. This is NOT a complete production disaster recovery rehearsal.
- GitHub runner minute quotas depend on repository/account settings; no paid services/dependencies are introduced. This workflow cannot guarantee zero billing for an account that has enabled paid Actions overages.

### Still production-gated even if CI passes

Actual production default-secret inventory, private DB/admin port bindings, production health/restart policy, capacity/pooling load tests, scheduled off-host encrypted backup/retention, production restore RPO/RTO and final deployment approval remain separate checks. The summary explicitly does not mark those verified. No production deploy job exists.
