# VoxRelay

## Infrastructure for the humans between languages.

A professional workspace for remote medical and community interpreters. It supports preparation, device readiness and operational follow-through—without taking over the interpretation.

[Architecture](ARCHITECTURE.md) · [Decisions](DECISIONS.md) · [Quality](QA.md) · [Known debts](AUDIT.md) · [Trust boundaries](#trust-boundaries)

## For buyers, in three lines

- **Human interpretation stays human.** The current product has no live machine-interpretation, session-recording or transcription workflow.
- **Workspace data goes through server APIs.** The intended production boundary combines API authorization with a dedicated, locked-down database schema; deployment configuration must be verified separately.
- **Operational counts should be traceable to records.** Normal application startup does not seed demo accounts or operational records. Test fixtures and curated reference content are not live customer activity.

> **Scope of this document:** a code-backed product and architecture overview, not a certification, service-level agreement or proof of a particular production deployment. Capabilities and controls must be checked against the exact revision and configuration under review.

## The problem

Interpreters may have to assemble their working day from email threads, personal glossaries, calendar invitations and billing notes. Fragmented preparation is especially consequential in medical and community work, where a language barrier already makes communication harder.

VoxRelay takes a specific position: improve the interpreter's working environment without replacing the interpreter. Assignments, terminology, device checks and billing belong in the workspace. Clinical dialogue and patient identity do not.

That is a product boundary—not a claim that software can prevent every inappropriate use of a free-text field.

## Product boundaries and evidence

These are the intended boundaries of the current implementation. Evidence is available in the repository; operational assurances still require deployment review.

| ID | Boundary | Implementation and evidence | Important limit |
|---|---|---|---|
| G1 | No live machine interpretation | No current speech-to-speech interpretation workflow; [decisions](DECISIONS.md), assistant refusal tests | A future change requires renewed review; absence today is not a permanent technical impossibility |
| G2 | Local device media checks | Browser microphone analysis and camera preview in the device-check workflow; [QA](QA.md) | Readiness metadata can be saved. Inspect browser network traffic to verify media handling in the deployed revision |
| G3 | No dedicated patient-identity records | Workspace schema has no dedicated patient-identity entity; input schemas constrain accepted fields | Free text can still contain sensitive information. Validation/redaction is not comprehensive PHI detection |
| G4 | No intended direct browser workspace-data access | Server API path, dedicated `voxrelay` schema and [database lockdown](db/lockdown.sql) | PostgREST exposed-schema settings must also be reviewed; SQL alone does not prove API exposure |
| G5 | API authorization plus database restrictions | Server capability checks, RBAC tests, RLS and revoked client-role table privileges | The privileged server service role bypasses RLS. Lockdown blocks direct client access, not every possible server authorization bug |
| G6 | No seeded operational demo data | Empty bootstrap; readiness and operations-metric tests | Tests use synthetic fixtures; the assistant contains curated examples. Neither is evidence of real customer usage |
| G7 | Human-controlled interpretation and change approval | Support-ticket workflow and documented production review process | Ticket creation does not establish staffing, response hours or a support SLA; those require a separate agreement |

## The product

The workspace follows the interpreter's working day:

```text
PREPARE                   CHECK                  INTERPRET              CLOSE
Assignments + calendar    Microphone levels      Session focus          Billing records
Terminology + CSV         Camera preview         Low-distraction view   Human-support tickets
Grounded guidance         Readiness checks                              Operational overview
```

| Surface | Route | Purpose |
|---|---|---|
| Overview | `/app` | Operational summary from available workspace records |
| Assignments | `/app/assignments` | Upcoming work and calendar export |
| Terminology | `/app/terminology` | Multilingual glossaries and UTF-8/UTF-16 CSV handling |
| Ask + Research | `/app/assistant` | Grounded preparation/help from curated reference material, not live interpretation or clinical advice |
| Device check | `/app/device-check` | Browser permission, microphone and camera readiness checks |
| Session focus | `/app/session/:id` | Deliberately low-distraction operational view |
| Billing | `/app/billing` | Work and billing records; not payment processing |
| Support | `/app/support` | Ticket submission and history for human follow-up |
| Access & Outbox | `/app/admin` | Authorized access review; local-mode outbox inspection. Hosted-mode visibility differs |
| Settings | `/app/settings` | Profile, organization and preference controls |

Route availability and actions depend on authentication and permissions. A URL listed here is not an entitlement or authorization rule.

**Public routes:** `/` · `/how-it-works` · `/interpreters` · `/organizations` · `/privacy` · `/faq` · `/contact` · `/status` · `/login` · `/reset-password`

### Assistant: deterministic, not model-backed

The current assistant uses local, deterministic logic and curated reference material. No paid model provider is required or supported by the current execution path. Older references to optional Anthropic integration do not describe the current implementation.

The workspace slide-over uses [`src/lib/strictAssistant.ts`](src/lib/strictAssistant.ts): typed workspace context, document references and allowlisted navigation. Supported exact commands are `/help`, `/device-check`, `/import-ics` and `/t3-policy`. Unknown commands do not fall through to keyword matching. Actions require a click and navigate; they do not import files, run checks or create records.

The separate `/api/assistant` path provides grounded Ask/Research responses. References can point to internal product guidance; they are not necessarily independent clinical sources or live web research. Neither assistant is a medical, legal or live translation service. Navigation rules are not an authorization boundary—APIs must still authorize the requested operation.

## Architecture

### Trust boundaries

```text
UNTRUSTED: Browser · React + Vite
  Public auth configuration; browser-managed authentication state
  No service-role credentials; no intended direct workspace-table access
                          | HTTPS · cookie or verified Bearer authentication
                          v
TRUSTED: /api/* · server-side handlers
  Authenticate → authorize → validate → execute
  Audit on implemented workflows
  Holds server credentials; must enforce ownership and organization scope
                          |
                          v
Postgres · dedicated voxrelay schema
  RLS + revoked client-role access + reviewed API exposure configuration
  Privileged service role remains a high-trust credential
```

This is the intended security model, not a claim that every handler has been formally proven to follow an identical sequence. See [ARCHITECTURE.md](ARCHITECTURE.md) for roles and policy, and the tests for exercised cases.

### One codebase, two runtimes

| Concern | Local development | Hosted configuration |
|---|---|---|
| API host | Vite `devApiPlugin` | Vercel serverless functions |
| Database | Built-in `node:sqlite`, normally in `.data/` | Supabase Postgres |
| Authentication | Local server-owned session | Supabase Auth with server verification |
| Assistant | Deterministic reference/help logic | Same non-model execution approach |

Shared routes do **not** mean storage backends are identical or that every local feature has hosted parity. Both paths need integration testing. Production must not rely on the development database fallback.

### Authentication and cookies

- **Local mode:** `voxrelay_session` is an opaque random token backed by a server-side hashed session record—not an HMAC-signed browser identity payload. The cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` in production. Remember-me selects browser-session or persistent storage with server-side expiry limits.
- **Supabase mode:** `@supabase/ssr` browser-managed auth cookies are JavaScript-readable so the browser client can refresh authentication. They are not `HttpOnly`. Server APIs verify the user and use trusted role information; verified Bearer tokens are also supported.
- **Preferences:** language/theme use browser local storage. The application does not intentionally add advertising or analytics cookies. This is not a substitute for a deployment-specific cookie inventory.
- **Secrets:** `VITE_` values are public. Never put privileged credentials in them. A stolen browser auth session still carries risk even when direct table access is blocked.

### Failure behaviour

| Condition | Expected behaviour / limit |
|---|---|
| Microphone permission denied | Explain permission/readiness problems rather than assume usable audio |
| New account with no records | Show empty states, not invented activity |
| Invalid API input | Schema validation and bounded parsing return controlled errors on covered routes |
| Support write fails | Hardening work adds atomic ticket/message creation; see migration dependency below |
| Assistant cannot handle a request | Grounded help/refusal rather than live interpretation; deterministic rules are not infallible |
| Missing hosted credentials | Some development paths can use SQLite; this is not an approved production recovery strategy |

## Security and privacy

### Data inventory

| Intended stored data | Not an intended product data category |
|---|---|
| Account identity, organization membership and roles | Patient names, identifiers and demographics |
| Assignments, glossary entries and billing records | Consultation audio, recordings and transcripts |
| Support messages, access requests and operational audit records | Clinical dialogue and case files |
| Outbox records where implemented | Payment-card or bank-account details |

**Residual risk:** users can type patient details into notes, terminology, support messages or other free-text fields. The absence of dedicated patient columns does not make PHI storage impossible. Do not enter patient information. A deployment serving regulated workflows needs its own privacy, retention, access and incident-response review.

### Threat model summary

| Threat | Control | Residual risk / verification |
|---|---|---|
| Public anon key or modified browser | Server-only table permissions and API authorization | Verify PostgREST exposure separately; public does not mean unrestricted |
| Cross-user or cross-organization access | Server ownership/membership/capability checks | Service-role calls are privileged; API bugs remain significant |
| Privilege escalation | Trusted server role context and role/capability tests | Tests cover implemented cases, not every possible attack |
| Leaked service credentials | Keep secrets server-side and out of browser configuration | Requires secret scanning, access control and rotation procedures |
| Forged/replayed invitations | Token hashing, expiry and acceptance controls in the relevant runtime | Review exact token/origin behaviour; do not assume all invitations are HMAC-signed |
| Unexpected email | Local outbox inspection and configured provider visibility | A queued record is not delivery proof; hosted admin view is not a complete email ledger |
| Sensitive free text | Field limits, privacy guidance and limited assistant redaction | Not comprehensive DLP or a guarantee against PHI collection |

### Providers and data exposure

These are configuration-dependent integrations, not a complete contractual subprocessor register.

| Provider | Role when configured | Potential exposure |
|---|---|---|
| Supabase | Hosted database and authentication | Account/workspace records and auth events |
| Vercel | Hosted frontend and serverless execution | Requests and data processed by handlers; configured logs |
| Resend / configured email transport | Optional application email; auth email follows auth-provider configuration | Recipients, message bodies and links |

No current assistant model provider is required. Confirm actual vendors, regions, retention, logging, agreements and subprocessors for the deployment being procured. Do not infer residency from the schema name or hosting platform.

### Compliance posture

VoxRelay is intended to keep clinical content out of its workflow. It makes **no HIPAA, GDPR, SOC 2, ISO 27001 or other certification claim** here. This repository does not establish a BAA/DPA, retention schedule, incident-response commitment, uptime promise or independent penetration-test result.

For procurement, request deployment-specific evidence: data-flow and region inventory, access review, backup/restore evidence, secret management, retention/deletion policy, monitoring, incident ownership, support terms and applicable agreements. Tests and architecture documentation support that review; they do not replace it.

## Answers for procurement

**Does it record or transcribe consultations?**

The current product has no session-recording/transcription workflow. Device checks use browser media APIs locally; verify the deployed build and network behaviour.

**Can it replace interpreters?**

No. Its scope is operational support around human interpretation.

**Where does our data live?**

In the configured database and processing services. Hosted mode uses Supabase and Vercel; local development uses SQLite. Exact region, backup locations and retention require deployment-specific confirmation.

**Is AI required?**

No. The current assistants are deterministic and do not call a model provider.

**Can we audit it?**

The repository exposes architecture, SQL, tests and known-debt documents. Authorized administrators can review supported access/outbox surfaces, but these are not a complete immutable audit trail of every action or delivered email.

**What does a new account show?**

Empty operational states until real work is created. Curated guidance is reference content, not customer activity.

## Engineering and evidence

### Quality checks

```bash
npm run lint       # ESLint: application, API and test files
npm test           # Vitest regression suite
npm run build      # tsc -b, then Vite production build
```

The current hardening workspace also adds `npm run typecheck` for standalone `tsc -b` checking. The app TypeScript project does not fully typecheck server JavaScript.

The CI workflow runs lint, tests and build on its configured triggers. Whether these checks are **required to merge** depends on repository branch-protection settings; this README does not assert those settings are enforced.

| Coverage area | What it exercises |
|---|---|
| Assistant | Grounding, references, refusals and navigation constraints |
| Authorization and tier policy | Role/capability allow and deny cases |
| Input boundaries | Malformed payloads, schema constraints and temporal validation |
| Accessibility and RTL | Tested labels, keyboard interactions, direction and layout behaviour |
| CSV / calendar | Encoding and export/import cases |
| Readiness and operations | Record-derived metrics and readiness logic |
| SQL / API integration | Disposable-database permissions, migrations and failure paths |

See [QA.md](QA.md) for method, [AUDIT.md](AUDIT.md) for recorded debts and [readiness evidence](docs/audits/readiness-recheck/README.md) for a revision-specific check. Historical green checks are not a guarantee about a later commit or a production deployment. No traffic-capacity benchmark or exhaustive security certification is claimed.

## Running locally

Use a current supported **Node.js 22 LTS** release with built-in `node:sqlite` and npm. The development stack uses Vite 7; the older Node 22.5 minimum is not sufficient for that toolchain.

```bash
git clone https://github.com/hussainjuher1-svg/VOXRELAY.git
cd VOXRELAY
cp .env.example .env
npm ci
npm run dev
```

Configure `.env` for the mode being tested. Local SQLite development does not require a hosted database account; testing hosted authentication and provider integrations does. The local API plugin serves `/api/*` alongside the app. `npx vercel dev` is an optional hosted-topology development tool, not a production deployment command.

### Configuration

Treat every `VITE_` variable as public browser configuration—not as a secret-protection mechanism. Production needs reviewed server credentials and origin settings.

| Variable | Exposure | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Public | Hosted browser-auth project URL |
| `VITE_SUPABASE_ANON_KEY` | Public | Browser auth key; must not grant workspace-table access |
| `SUPABASE_URL` | Server | Server project URL; falls back to public URL |
| `SUPABASE_ANON_KEY` | Server configuration, non-privileged key | Auth/probes; falls back to public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | Privileged server database/auth operations; required for hosted data access |
| `SESSION_SECRET` | **Secret** | Local token hashing and related security helpers; set a strong independent production value |
| `APP_ORIGIN` | Server | Canonical site origin used for invitation URL generation and relevant origin checks |
| `RESEND_API_KEY` | **Secret, optional** | Configured outbound email provider |
| `EMAIL_FROM` | Server | Outbound sender; verify provider/domain configuration |

Generate a secret locally; do not paste it into issues, documentation or chat:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### Database and migration safety

For an **empty disposable test database only**, the existing baseline sequence is:

```text
roles → db/schema.sql → migration 001 → migration 002 → db/lockdown.sql
```

Core schema plus lockdown alone is insufficient: migrations supply required RPCs. Direct SQL tests do not validate PostgREST's exposed-schema allow-list.

**Pending hardening dependency:** this working branch contains additional, separately uncommitted hardening work for migration `003_support_atomicity_and_query_indexes.sql`. The updated remote support handler requires that migration **before handler deployment**. The baseline sequence above alone is not sufficient for that updated handler. Publish and review the SQL, handler and tests together; review index-build locking before a live rollout. This README-only publication does not ship those changes.

**Never bootstrap an existing production installation.** Live changes require schema/configuration preflight, a reviewed upgrade, a written recovery plan and explicit human approval. Nothing here authorizes a production migration, schema-exposure change, permission change or deployment.

### Release review

1. Review the exact code revision, migration dependencies and known debts.
2. Separate preview and production credentials; do not share production data with disposable tests.
3. Verify origin, auth cookies, database permissions and exposed schemas.
4. Review recovery, backups, email configuration and operational ownership.
5. Obtain explicit approval before any production operation.
6. Verify critical journeys after an approved release: status, sign-in, access/invitation flow, authorization denials and assistant refusals.

## Principles

1. **Minimize collection.** Before protecting data, ask whether the product needs it.
2. **Separate trust boundaries.** Browser restrictions do not replace server authorization; database lockdown does not excuse privileged API bugs.
3. **Prefer honest emptiness.** Missing activity is not a reason to invent it.
4. **Protect attention.** Session tooling should support the interpreter, not compete with the speakers.
5. **Keep humans accountable.** Interpretation, support commitments and production approval belong to people.

**Security disclosures:** report vulnerabilities privately to the maintainers rather than posting sensitive details in public issues. A dedicated published reporting channel and response policy should be confirmed before procurement.

**License:** no open-source license is granted by this README. All rights reserved unless a separate license is published. Source visibility is not permission to reuse or redistribute.
