# Phase 03 — Local remediation and integration verification

**Session reference date:** 2026-11-24. **Disposition:** local remediation complete within the verification limits below; STOP before production changes.

## Executive result

- Retained the dedicated `voxrelay`/server-only architecture; did not redirect queries or expose any schema.
- Prepared migration 002 using isolated, in-memory PGlite PostgreSQL-engine tests. Old-schema upgrade, transactional DDL rollback/recovery, repeated application, relationships, constraints, index and RPC metadata/privileges passed.
- Unified verified cookie/Bearer actors and their exact token; removed cookie-identity/Bearer-token mixing. Authentication outages now fail explicitly instead of reporting provider revocation success. Membership errors no longer silently become solo membership.
- Added real-client loopback HTTP protocol tests for synthetic sessions, logout scope, expiration, refresh rotation, revoked credentials and provider outage. **The HTTP provider is a simulator, not GoTrue.**
- Added the requested quieter footer row using actual existing destinations. Hero navigation is **How it works**. The supplied screenshot shows the footer, which already used that label; both hero and footer are now tested. No fabricated Terms page, certifications, badges, privacy controls or Indeed features were added.
- **Full preserved working tree: lint PASS; 33 files / 255 tests PASS; build PASS.** Existing chunk-size warning remains.
- Independently exported the selected Git index into a temporary directory and tested it without the unrelated dirty files: **lint PASS; 25 files / 164 tests PASS; build PASS**. This verifies that the selected release changes do not rely on untracked assistant/navigation/diagnostics work. That export contained no .env or production keys.

No production connection, deployment, migration, data modification, permission/configuration change, account creation or actual user-session revocation occurred in Phase 03. No paid tool/service/dependency was added. No package installation or browser download was attempted.

## 1. Database schema architecture decision

See [the detailed ADR](phase-03-schema-architecture-decision.md).

The intended boundary is browser → same-origin app API → server-verified identity/confirmation/membership/record authorization → service-role PostgREST client → `voxrelay` schema. The service role bypasses RLS, so explicit API checks remain essential. Anonymous/authenticated schema/table access stays denied; zero RLS policies is compatible with the current server-only design.

Phase 02 established that the connected project's REST allow-list is `public,graphql_public`, while the server requests `voxrelay`. SQL permissions and REST exposure are separate gates. Neither moving queries to public nor blindly granting/exposing a schema is an acceptable fix. No such change was made. A future production config packet must identify shared consumers, verify migration signatures and role ACLs, and explicitly approve the minimum profile exposure while retaining browser-role denials.

The README's incomplete two-step bootstrap was replaced with a link to the ADR, complete disposable-local ordering, and an explicit production prohibition. Earlier uncommitted README auth/assistant additions were preserved outside that documentation commit.

## 2. Migration 002 implementation and test report

### Local changes

- `db/migrations/001_access_requests_and_terms_notes.sql`: status constraint existence check now includes the target relation (`conrelid='voxrelay.access_requests'::regclass`).
- `db/migrations/002_atomic_invites_and_rate_limits.sql`: approved-role constraint guard likewise includes the relation. A same-named constraint in public can no longer suppress this schema's constraint.
- `tests/migration-upgrade-isolation.test.js`: new isolated PGlite-only old-shape upgrade/recovery test. It accepts **no external database URL**.

The five RPC bodies and intended schema design were not rewritten. The repository already modified 002 in place in earlier commits; any environment with an older applied 002 still needs definition/checksum review and potentially an approved forward migration. This work is preparation, not permission to rerun SQL in production.

### Tested object checklist

| Object/behavior | Result and evidence |
|---|---|
| review_access_request(bigint,text,text,uuid,text,timestamptz) | Present; existing DB suite exercises transactional review, audit/org rollback and repeat-review denial |
| reserve_access_invite(text,text,integer) | Present; existing DB suite exercises reservation/lease behavior |
| finalize_access_invite(bigint,uuid,uuid) | Present; existing DB suite exercises same-user idempotent finalization |
| release_access_invite(bigint,uuid) | Present; existing DB suite exercises matching-claim recovery |
| consume_rate_limit(text,integer,bigint) | Present; existing DB suite exercises limiter behavior; genuine multi-connection PostgreSQL branch **not run locally** |
| Five invitation columns | Old fixture has 16 access-request columns; upgraded table has 21 and includes org_id, approved_role, claim_token, claim_expires_at, provisioned_user_id |
| Reservation state | Status constraint includes reserved |
| Approved role | interpreter/admin check created despite same-named constraint on an unrelated public table |
| Claim index | Definition contains (id, claim_token) and non-null claim predicate |
| Relationship | org_id FK references voxrelay.organizations(id), ON DELETE SET NULL; synthetic organization deletion clears reference; orphan FK insert rejected |
| Security | Five functions SECURITY DEFINER, fixed search_path=voxrelay,pg_catalog; exact-signature privilege checks in existing suite deny PUBLIC/anon/authenticated and allow service_role |
| Ordering | Fresh schema→001→002→lockdown in existing suite; synthetic old schema→lockdown→001→002 in new suite |
| Repeated application | 002 applied twice transactionally to the isolated upgraded fixture; passed |
| Recovery | BEGIN→002→ROLLBACK leaves zero voxrelay functions; subsequent BEGIN→002→COMMIT succeeds |

Tests executed real SQL/PLpgSQL in a disposable embedded PostgreSQL engine, not a JavaScript database mock. However **PGlite is not a running native PostgreSQL 17 server** and does not establish production lock duration, network behavior, server role configuration or multi-connection concurrency. No destructive test targeted production. The existing pg test boundary still rejects application DATABASE_URL, requires explicit loopback disposable-test opt-in and refuses an existing voxrelay schema. DROP SCHEMA remains removed.

No customer rows or production backups were used. The old fixture is synthesized from repository SQL by removing only access-request 002 additions; it is not claimed to be a complete historical production dump. Existing production data/constraint preconditions and legacy approved organization-invite backfill remain unverified.

## 3. Authentication remediation report

### Server changes

`api/_lib/auth-session.js` now:

- Selects an explicitly provided Bearer credential first; otherwise uses cookie credentials. Invalid supplied credentials do not silently switch to another identity.
- Uses the cookie client's getSession to refresh when needed, then verifies that captured token through getUser(token).
- Stores the exact verified token on an internal actor, separate from the public user response.
- Bounds provider verification and membership lookup using the existing four-second timeout helper.
- Distinguishes invalid/expired provider credentials (no actor) from verification outages (HTTP 503).
- Surfaces membership lookup errors as retryable failure rather than assuming no organization.
- Allows session mutations to skip application membership lookup: a working application DB is not required to revoke an otherwise verified provider session.
- Retains local opaque-cookie lookup and expiry behavior. Unsupported Bearer strings in a local-only installation are rejected rather than accepted as local identity.

`api/_lib/supabase.js` now shares that actor through authenticateRequest; admin/assignments/ops/support/terms pass the already-verified actor instead of performing an inconsistent second Bearer-only verification. Both cookie and Bearer workspace paths require confirmed email and the service client. Existing capability, platform-admin and ownership/org filters remain.

`api/_lib/supabase-sessions.js` now reads only actor.accessToken; it never decodes a different request header or instantiates a second cookie client for session extraction. Provider signOut still uses explicit local/global scopes and errors propagate. Remote individual-session revoke remains explicitly unsupported (501); GET lists the current Supabase session only, not a fabricated inventory of other browsers.

`api/auth.js` refuses to acknowledge a credential-bearing but unverifiable signout as successful provider revocation. A truly anonymous logout remains idempotent. Provider outages return 503 without clearing cookies; a verified identity can revoke even when membership storage is unavailable.

`checkPublicAccessLock()` now treats only an explicit PostgreSQL permission-denied code (42501) as lock evidence. Schema exclusion/network/other errors yield unknown, not a false successful lockdown result. A successful anon query conservatively reports unlocked; this probe still does not prove all-table/RLS correctness.

### Client changes

- AuthContext preserves server-first logout ordering and clears its server-restored identity on SIGNED_OUT, preventing stale authenticated UI after that event.
- AppShell catches signout rejection, stays on the current page and announces a retryable failure rather than generating an unhandled promise rejection/navigation.
- Settings catches network errors as well as non-2xx revoke responses. Existing notice styling is reused. Successful current/global revocation reloads without an extra request using an already-revoked token.
- Ordinary visual appearance is unchanged by auth fixes; failure notices appear only on actual failures.

### Authentication verification evidence and limits

| Layer | Actual result |
|---|---|
| Real local SQLite sessions | 8 cookie-auth and 6 API-security tests passed, covering opaque cookie signout/expiry/specific/global revoke and authorization isolation with synthetic local accounts |
| Mocked provider/session helpers | 7 session-revocation, 3 serverless-routing and 5 readiness/confirmation tests passed |
| Simulated provider over actual HTTP | 5 tests passed with real Supabase JS/SSR clients and actual application auth functions; synthetic signed tokens, sessions A/B for one user and C for another, cookie-only authorization, expired cookie refresh, simulated refresh-token rotation, stale access/refresh denial, local/global scope and service outage |
| UI state/failure behavior | 3 auth restoration/event tests and 3 signout/revoke failure UI tests passed in jsdom |
| Existing production-flow harness | 11 tests passed, but it mocks Supabase; its name is not evidence of live production testing |
| Real GoTrue/PostgREST integration | **Not performed**; native server/container tooling unavailable |
| Independent real browser sessions | **Not performed**; A/B/C above are isolated synthetic server sessions, not browser screenshots or actual browser contexts |

The loopback provider simulator implements session existence, signed-token expiry and refresh rotation specifically to exercise application/SDK behavior. It is clearly labelled in `tests/auth-provider-protocol.test.js`. It does **not** prove production GoTrue's JWT revocation semantics, refresh reuse interval, replay handling, error mapping, email delivery or multi-browser state propagation. Phase 02's source evidence about session-aware getUser remains a hypothesis to confirm in a real isolated stack, not a substituted live test result.

### Remaining auth risks

- Timeout races bound the response but do not abort every underlying SDK operation; late cookie writes/refresh near timeout need real-provider/browser tests.
- No new test establishes the provider's ten-second refresh-reuse semantics or concurrent refresh race behavior.
- Cookie storage remains JS-readable by SSR design; XSS controls remain important. Remember-me controls storage persistence, not an absolute provider-session lifetime.
- Current-session metadata is derived from JWT iat/exp and request user-agent, not a full provider session catalog.
- A caller using another valid same-user Bearer session explicitly selects that session; no hidden cookie fallback occurs. This is intentional and needs release documentation.
- Confirmation is now consistently required for workspace access. Previously inconsistent cookie-only callers with unconfirmed email may see a new 403; this is a security-policy consistency fix, not proof that deployed accounts are confirmed.
- Existing health endpoint diagnostics and guest assistant fallback paths were not rewritten; broader readiness/availability improvements remain scoped future work.

## 4. Git integrity report

At start, the complete tracked diff (3,245 lines) and full status were captured to temporary files, and all **144 existing tracked/untracked files** were copied and hashed before edits. Hunk inventory separated auth/cookie foundations, previous assistant/navigation/diagnostics/visual work, pending first-stage fixes and the earlier hero label edit. These temporary snapshots were not added to Git.

No reset, stash, discard, force operation, branch switch, push or production deploy occurred. All work stayed on `arena/f6a5e069-voxrelay`.

Verified logical commits:

| Commit | Scope |
|---|---|
| 611e407 | Table-scoped migration guards and isolated upgrade/recovery test |
| 0437e45 | Unified verified auth pipeline plus its previously uncommitted, required SSR/cookie/context foundations and focused tests |
| 1437f08 | Footer row, existing-route links and previously requested How it works hero label |
| 368252c | Previously existing cookie/session disclosure and its navigation entry, so the footer anchor is present in a clean checkout |
| 642f3a8 | Selectively staged AppShell/Settings failure handling and dedicated UI tests, excluding unrelated layout/diagnostic changes in those files |

The auth commit intentionally includes related earlier cookie/remember-me/restoration work, package.json/lockfile's existing SSR dependency, hooks and login flow; committing only the small resolver change would have omitted its prerequisites. No unrelated assistant or Device Check changes were swept into it. The footer and AppShell/Settings changes were staged from constructed HEAD-plus-selected-delta content, leaving other edits in the working tree untouched.

To verify packaging, the selected index was exported to `/tmp/phase03-candidate-final/` without switching the repository branch or altering working files. It shared the already-installed node_modules but had no .env. Its lint, all 164 discovered tests and build passed before the UI commit. The full dirty tree's 255 tests are a separate result; the difference reflects intentionally uncommitted tests/features, not a test failure.

A baseline hash comparison found no deleted existing files. Only the declared remediation/UI/test/README files changed; prior unrelated assistant/navigation/workspace CSS, diagnostics, public-card changes and audit artifacts were preserved. Some previously dirty related files are now committed; “preserved” does not imply all earlier work remains uncommitted. Unrelated work remains dirty/untracked and is not claimed release-ready.

## 5. Integration test results

Final full-workspace commands:

```
npm run lint
npm test -- --run
npm run build
git diff --check
```

Results: **lint PASS; 33 files / 255 tests PASS; build PASS; diff whitespace check PASS**.

Database integration subset: 7 existing schema/RPC tests + 1 new upgrade/recovery test, using PGlite here. Auth/SDK loopback subset: 5 HTTP tests, synthetic provider. SQLite subset: 14 local integration/security tests. Mock/jsdom/other unit suites make up the rest; these categories are not all independent subtotals to add again.

Existing .env-configured working-tree build retains the prior bundle warning: main 719.97 kB minified / 221.11 kB gzip; workspace 142.38 / 41.88 kB. No optimization/threshold suppression was attempted. Clean exported candidate build sizes differ because it excludes unrelated dirty code and .env-driven compiled configuration; they are **not** a measured performance improvement.

No screenshots, pixel-diff, Lighthouse, computed browser font/overflow checks, real GoTrue/PostgREST smoke tests, native PostgreSQL17 multi-connection run or CI execution were performed. Browser tooling is unavailable and earlier downloads were blocked; no download was retried. The new footer uses existing color/type tokens and responsive wrapping; visual fidelity is source/test based, not browser-certified.

## 6. Remaining production blockers

Confirmed by Phase 02 metadata, **not re-queried or changed in Phase 03**:

1. Five migration-002 RPCs and five invitation columns absent; status reservation support/claim index/associated constraints absent.
2. REST exposed-schema list does not include the server-requested profile.
3. Auth redirect base/allow-list does not match the intended VOXRELAY deployment; provider/app signup-password/confirmation policy needs review.
4. Real deployed commit/environment/project ownership/shared consumers remain unverified.
5. Native PostgreSQL17 concurrency and real GoTrue/PostgREST/browser auth behavior remain acceptance gates.
6. Production data compatibility, existing approved organization-invite handling, backup/restore availability and lock/maintenance budget remain unverified.
7. Unrelated uncommitted assistant/navigation/diagnostics work still needs its own release decision. Do not deploy the whole dirty tree accidentally.

## 7. Deployment and rollback proposal — NOT executed

1. Finish real isolated-stack acceptance using synthetic identities/keys only. No paid Supabase branch is required or proposed. Review code/config diffs and choose an exact release manifest.
2. Verify effective privileges, normalized schema/function definitions and existing data preconditions using a separately authorized preflight; do not assume a migration ledger name proves matching SQL.
3. Confirm backup/recovery mechanism and rehearsal in an isolated destination. No promise of PITR/free-plan restore capability is made without checking availability.
4. Prepare a reviewed, transactional migration packet with lock/statement timeout and traffic/feature-gating plan. Do not rerun current core schema as an ALTER strategy. Legacy approved invitations require an explicit policy rather than guessed role/org backfill.
5. Under **separate production approval**, apply the reviewed forward upgrade and verify columns/FKs/checks/index/exact RPC signatures/search paths/execute ACLs. Then make only the approved REST/Auth configuration adjustments, preserving browser-role denials. A supported schema-cache refresh must be reviewed with that config change.
6. Deploy only after separate approval, using the tested release revision rather than the entire dirty workspace. Any production synthetic-account/session check also requires its own explicit authorization; never borrow real-user accounts for global revoke.

Rollback: failed transactional migration should leave previous metadata intact; this was rehearsed locally. After a committed upgrade, prefer forward correction and disable affected writes rather than dropping new columns/functions or deleting claim/provisioned-user state. A pre-002 code rollback may not understand reserved/redeemed records. Restore prior approved REST/Auth config if needed without loosening ACLs, mass logout or JWT rotation. Database restore over live data is a potentially destructive operation requiring separate approval; no restore was attempted.

## 8. Explicit production approval requirements

Approval is still required before any of the following:

- Applying 001/002 or any replacement/forward SQL migration to production.
- Production data checks beyond the current metadata-only scope, backfills, invite remediation or data modification.
- Exposing voxrelay in REST, changing search paths, ACLs/RLS/default grants/RPC privileges, or refreshing service configuration/cache through a write operation.
- Changing Auth redirect origins, signup/confirmation/password/refresh/session policy, keys or secrets.
- Creating production synthetic accounts, sending test confirmation/recovery emails, revoking any production session or rotating signing keys.
- Deploying any revision or enabling a changed production flow.
- Creating/restoring production backups, moving customer data, or performing destructive recovery.

**STOP: no production operation is authorized by this report.**
