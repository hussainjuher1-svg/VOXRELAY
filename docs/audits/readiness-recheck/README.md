# Engineering readiness — real-service CI verified; production go-live conditional

## Passing verification

- **PR:** https://github.com/hussainjuher1-svg/VOXRELAY/pull/8
- **Passing run:** https://github.com/hussainjuher1-svg/VOXRELAY/actions/runs/45806329206
- **Verified commit:** `1367db32d83a1909093e253490a144bfa8d7939f`
- **Result:** `completed / success`; all sequential verification gates, evidence publication, artifact upload and disposable-service cleanup succeeded.
- **Execution:** GitHub `ubuntu-latest`, real Docker services started by `supabase/setup-cli@v3`, CLI 2.65.5, PostgreSQL 17.6, Playwright 1.65.1 / Chromium; no GoTrue/PostgREST startup attempted in the coding sandbox.
- **Scope:** real disposable services and synthetic test identities only. No production credentials, data, configuration, permissions, migrations, user sessions or deployment were touched. No visual/design changes were committed for this audit work.

## Updated audit status table

| Pending engineering item | Status | Exact verified scope |
|---|---|---|
| Real GoTrue integration | **Verified** | Real signup, email delivery to local Mailpit, confirmation link, password JWT/refresh issuance, rotation, authenticated `/user`, logout and revoked-credential rejection. |
| Real PostgREST integration | **Verified** | Genuine GoTrue JWTs accepted; locked application table denied; anon restrictions, `auth.uid()` owner CRUD, cross-user read isolation and forged-owner insert rejection through real PostgREST. |
| Full browser acceptance | **Verified for the defined CI acceptance suite** | Real app signup, confirmation link, explicit sign-in, reload/session persistence, anonymous protected-route redirects, mobile drawer open/close, logout, re-login and browser-issued PostgREST CRUD at 390px and 1440px. Both contexts passed with zero collected valid-flow errors. Not certification of every app feature, browser engine or physical device. |
| Production deployment readiness | **Established for the tested CI release gates; production go-live conditional** | Lint/tests/build passed; actual disposable service key absent from client build; forbidden frontend secret env names absent; actual Auth/public/application schema dump restored into a separate disposable database with 25 app tables. Live production security/configuration/backup gates below remain unverified and must not be labelled complete. |

**A green disposable-stack run is not a claim that an uninspected production environment is configured safely. No production deploy job exists.**

## Exact successful HTTP evidence

See [passing-http.json](github-evidence/passing-http.json) and [original successful-run annotations](github-evidence/passing-run-45806329206-annotations.json).

| Request / assertion | Observed result |
|---|---|
| `GET /auth/v1/health` | **200** |
| `POST /auth/v1/signup` (two independent accounts) | **200**, **200** |
| Actual email verification links | **303**, **303** |
| Password grant (both accounts) | **200**, **200**; real access/refresh tokens issued, never substituted |
| Refresh grant | **200**; new refresh token differs |
| `GET /auth/v1/user` with real current token | **200**; expected user ID |
| Authenticated read of locked `voxrelay.profiles` | **403** |
| Anon probe read | **200**, empty result (no unintended row disclosure) |
| Anon probe insert | **401** |
| Owner probe create/read/update/delete | **201 / 200 / 200 / 200** |
| Other-user filtered read | **200**, empty result |
| Other-user forged-owner insert | **403** |
| `POST /auth/v1/logout` | **204** |
| Revoked refresh-token grant | **400** |
| `GET /auth/v1/user` with stale logged-out token | **403** |

Architecture matters: repository `db/lockdown.sql` intentionally revokes browser access to app tables. Those policies were preserved. Owner CRUD is tested on the explicitly disposable `public.readiness_probe`, not by reopening app tables. Application/API-wide CRUD authorization is not implied by the probe test.

## Database / browser / security evidence

- [Run metadata with exact step results](github-evidence/passing-run-45806329206.json).
- [Database assertions](github-evidence/passing-database.json): PostgreSQL **17.6**, **71** applied Auth migrations, session `search_path=auth` verified, **25 app tables plus the one disposable probe** all RLS-enabled, `storage.objects` RLS enabled, **zero storage buckets**, one explicit owner policy on the probe. Locked app tables rely on revoked browser grants/default-deny RLS, not permissive browser policies. Session search-path verification is not a claim about production GoTrue role settings.
- [Browser assertions](github-evidence/passing-browser.json): **390px PASS**, **1440px PASS**, each recording CRUD `[201,200,200,200]` and `errors: []`. Valid flows collect uncaught page errors, console errors and HTTP 401/403/500 responses; deliberate denial checks are scoped separately. Confirmation follows actual local mail, then the app's explicit sign-in instruction. There is no token/session mock or request interception.
- [Hardening assertions](github-evidence/passing-hardening.json): actual test service key absent from all `dist` files; secret-style `VITE_` env names absent; restore completed into `readiness_restore` with **25 application tables**. The real Auth schema is included in the dump; no stub Auth function is used. Restore does not overwrite the running test database. This proves schema/data replay completed, not production-scale integrity, off-host backups or RPO/RTO.
- Complete runner test/build logs, browser screenshots, SQL/policy inventory and redacted diagnostic logs are in the successful run's **readiness-evidence** artifact (7-day retention). Download them before expiry. Small credential-free assertions are also published in Checks annotations and preserved here because this sandbox cannot follow GitHub log/artifact redirects to the external storage hosts.
- Lint, existing test suite and TypeScript/Vite build gates all succeeded in the run. The existing suite includes unit mocks; it is separate from genuine Auth/REST/browser acceptance. A build gate pass does not imply a zero-warning bundle or Lighthouse certification.

## Failures investigated and fixes pushed

Every failure stopped later gates. No RLS policy or app-table permission was loosened to obtain success.

| Failure | Diagnosis / clean fix |
|---|---|
| Startup 503; PostgREST `schema "voxrelay" does not exist` | Added only an empty `voxrelay` schema bootstrap migration to the disposable CLI configuration, before PostgREST startup; then apply repository schema/migrations/lockdown unchanged. Commit `0e4d059`. |
| Database `ECONNREFUSED` on default `::1:5432` / `127.0.0.1:5432` | `GITHUB_ENV` exports are unavailable in the same step. Read CLI's actual disposable DB URL for that step and enforce loopback. Commit `5eaa5fe`. |
| Playwright 1.56.1 unsupported on `ubuntu26.04-x64` | Update test-only Playwright pin to **1.65.1**; retain `ubuntu-latest`. Commit `d75d7f0`. |
| Signed-out `/app/assignments` failed to redirect | Commit the existing engineering-only `RequireWorkspaceSession` guard and its focused tests; waits for restoration, preserves sanitized return route, and redirects unauthenticated users. APIs still independently authorize. Commit `d5016b6`. |
| Browser signup identity absent from GoTrue | Dev server had used SQLite local-auth mode. Set **`VERCEL=1` only for the CI frontend process** to use the existing production/Supabase auth path. Configured Supabase sign-in now directly uses real browser Auth instead of intentionally requesting a server 503 fallback. Commit `e1fba6d`. |
| Confirmation inbox lookup timed out | Support current Mailpit API as well as legacy Inbucket. Confirmation remains enabled; retrieve and follow actual local email links rather than admin-confirming or mocking tokens. Commit `1108b5c`. |
| Test expected automatic post-email login | Product copy instructs users to confirm and then sign in. Follow that actual flow explicitly; exercise drawer open/close on mobile. Commit `6a624a7`. |
| Restore `schema "public" already exists` | Drop only the empty default `public` schema in the newly created disposable restore database, then replay the unmodified dump with `ON_ERROR_STOP=1`. Commit `1367db3`. |
| Log/artifact redirects inaccessible from this sandbox; annotations truncated | Add redacted short failure annotations and compact credential-free assertion annotations. Drop progress-bar noise and mask JWT/URL token values before diagnostics/artifact publication. Full evidence stays available in GitHub. |

Representative failed-run annotations are retained under [github-evidence/](github-evidence/). The initial `d609d88` was pushed, and all fixes were committed and pushed to the same branch/PR. No merge, production operation or visual-file commit was performed.

## Exact run / rerun instructions

1. The open [PR #8](https://github.com/hussainjuher1-svg/VOXRELAY/pull/8) automatically runs **Real-service readiness audit** on branch pushes. The successful run above needs no further manual trigger.
2. To repeat that exact run from the PR: **Checks → Real-service readiness audit → Details → Re-run jobs**. CLI: `gh run rerun 45806329206`, then `gh run watch 45806329206 --exit-status`. A rerun may change the run attempt; inspect the attempt being reviewed.
3. Manual dispatch normally requires the workflow to exist on the default branch. Once available there: **Actions → Real-service readiness audit → Run workflow → select `arena/f6a5e069-voxrelay`**. CLI equivalent: `gh workflow run readiness-audit.yml --ref arena/f6a5e069-voxrelay`. Until then, use the existing PR trigger or rerun controls; do not merge solely to make a dispatch button appear.
4. List fresh runs with `gh run list --workflow readiness-audit.yml --branch arena/f6a5e069-voxrelay`; use the actual returned run ID with `gh run watch <run-id> --exit-status`.
5. Read the job summary gate table and download **readiness-evidence**. Skipped gates are not passes. Setup or dependency errors are verification failures, not grounds to disable checks.

No production repository secrets are needed. CLI local-only disposable keys must never be deployed. Local mail is captured by Mailpit; external delivery is not tested. The local mail-send limit is raised only inside the ephemeral test configuration to permit synthetic confirmation emails; production limits are untouched. Runner-minute availability/billing follows the repository's GitHub plan/settings; no paid service or subscription was added.

## Remaining manual production checklist — required before go-live

- [ ] Approve an exact release commit, reviewed migrations and rollback/forward-recovery plan. Keep deployment as a separate explicit authorization.
- [ ] Inventory actual production secrets securely. Confirm unique high-entropy values, no example/default credentials, and rotate anything default, exposed or due under the rotation policy. Never copy CLI test keys to production or put secrets in chat/logs.
- [ ] Verify **production** `service_role`/signing secrets are server-only in hosting configuration, real deployed client bundles, source maps and logs. CI tested only its disposable key and build.
- [ ] Compare production schema/migrations, exposed PostgREST schemas, grants, RLS policies, storage buckets and JWT signing/JWKS settings with the reviewed release. The test probe must not exist in production. Explicitly review any allowed public bucket.
- [ ] Verify production Auth site URL and callback allowlist, HTTPS/cookie settings, SMTP credentials/delivery, email confirmation/reset flows and rate limits. Test safely with separately approved smoke identities; local Mailpit does not certify real email delivery.
- [ ] Confirm PostgreSQL **5432** and Studio/admin endpoints are private/firewalled—not publicly reachable on `0.0.0.0`. Validate gateway/TLS exposure from the deployed environment.
- [ ] Verify production health/readiness checks, restart policy, alerting, connection-pool configuration and load/capacity limits. Disposable CLI defaults are not a production operations audit.
- [ ] Confirm a recent successful **live production backup**, encryption, off-host storage, retention and scheduled backup alerts. Rehearse an isolated restore of an approved production backup; verify data integrity and measured RPO/RTO. A CI restore of synthetic data is not this check.
- [ ] Complete release-specific application/API authorization journeys beyond the owner probe, supported-browser/device accessibility testing and a final approved deployment smoke test.

**Go/no-go:** tested real-service CI gates established. Production go-live remains conditional on the manual checklist and explicit deployment approval; production remains untouched.
