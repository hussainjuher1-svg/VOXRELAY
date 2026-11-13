# VOXRELAY architecture

## Stack (what the repository actually runs on)

The repository was a Vite + React 19 + TypeScript + Tailwind v4 template with Vercel serverless functions and a hosted Supabase project (Postgres + Auth). That stack was kept. The brief's default (Next.js, Prisma, Auth.js, Playwright) applied only to an empty repository.

| Layer | Choice |
|---|---|
| UI | React 19, react-router, Tailwind v4 tokens in `src/index.css`, lucide icons at 1.5px |
| API | Ten Vercel functions in `api/*.js` (the operations modules share `api/ops.js`), shared code in `api/_lib/` |
| Data | Supabase Postgres through the service-role client, server side only |
| Auth | Supabase Auth: email + password, Google through the hosting platform's OAuth proxy |
| Validation | Zod (`api/_lib/validate.js`) on every request body |
| Tests | Vitest (`npm test`) |

## Roles

Every new account is an **Interpreter**. Organization roles exist only through membership: **Owner** (creates the organization), **Admin**, **Coordinator**, **Interpreter**. Roles other than Owner are granted by invitation to the email address the person signs in with. An account belongs to at most one organization.

## Workflow

`Assignment -> Preparation -> Session -> Close-out`, one record throughout.

| Status | Set when |
|---|---|
| Offered | A coordinator offers an assignment to a member |
| Scheduled | Created by hand or from .ics, or an offer is accepted |
| Preparation required | Preparation has started and readiness is incomplete |
| Ready | Every checklist item is done and a device check counts |
| Rescheduled | Start or duration changed |
| In progress | The interpreter starts the session |
| Completed | Close-out, with an exception category |
| Cancelled | Cancelled, or an offer was declined (`offer_state = declined`) |

Readiness = checklist items done + 1 if a device check counts, out of items + 1. A device check counts when it did not fail and was run for that assignment or within 24 hours before its start (`api/_lib/readiness.js`).

## Screen map

Public: `/` `/how-it-works` `/interpreters` `/organizations` `/privacy` `/about` `/contact` `/status`  
Auth: `/login` (sign in, create account, forgot password) `/reset-password` `/onboarding`  
App: `/app` Overview, `/app/assignments` (list + calendar), `/app/assignments/:id` (preparation + history), `/app/session/:id` (focus mode, dark), `/app/assignments/:id/close`, `/app/availability`, `/app/terminology`, `/app/resources`, `/app/device-check`, `/app/support`, `/app/activity`, `/app/organization` (directory, offers, support queue, policy, audit), `/app/settings`

## Data model

| Table | Purpose |
|---|---|
| `profiles` | Display name, time zone, language pairs, modalities, weekly hours, notification switches, retention, locale |
| `availability_overrides` | Per-date unavailable or custom hours |
| `assignments` | Ref, owner, optional org, start, duration, zone, pair, modality, category, status, offer state, checklist, personal note, exception category, session timestamps |
| `assignment_events` | History of each assignment (type + metadata) |
| `assignment_links` | Terms and resources linked to an assignment |
| `device_checks` | Pass or fail facts and timing figures; optional assignment link |
| `terms`, `term_versions` | Glossary entries with scope (personal or organization), label, version; snapshots of earlier versions |
| `resources`, `saved_resources` | Links with attribution, review date, version, scope, approval; per-user saved list |
| `support_requests`, `support_messages` | Requests with category, status, human_required, tier; threaded updates |
| `organizations`, `memberships`, `invitations` | Organization, active roles, pending invitations (14-day expiry) |
| `assistance_policies` | One row per saved policy version per organization |
| `audit_events` | Actor, org, area, type, object ref, result, policy version, metadata |
| `consents` | Type, subject, state, timestamp, policy version, withdrawal time |
| `access_requests` | Public contact form submissions |
| `rate_events` | Attempts for the rate limiter (keyed hash, no addresses) |

No table holds client identity, recordings, transcripts or conversation content. There is no column for them.

## Authorization

One module, `api/_lib/authz.js`, default deny. Every route calls `context(req)` (verifies the bearer token with Supabase Auth, loads the active membership) and then the checks below. Records in another organization are answered with 404, not 403.

| Capability | Owner | Admin | Coordinator | Interpreter |
|---|---|---|---|---|
| See directory, policy | yes | yes | yes | yes |
| Rename organization | yes | no | no | no |
| Invite, change roles, remove members | yes | yes (not admins) | no | no |
| Save a policy version | yes | yes | no | no |
| Organization audit view | yes | yes | no | no |
| Create offers, edit offered schedule | yes | yes | yes | no |
| Support queue: assign, reply, escalate, resolve | yes | yes | yes | no |
| Create or edit organization terms and resources | yes | yes | yes | no |
| Approve organization terms and resources | yes | yes | no | no |
| Read approved organization terms and resources | yes | yes | yes | yes |
| **Another person's personal terms, resources, checklist or notes** | **no** | **no** | **no** | **no** |
| Preparation, session, close-out of an assignment | assigned interpreter only | | | |

`serializeAssignment` strips `personal_note` and `checklist` for anyone who is not the assigned interpreter. The matrix is asserted cell by cell in `tests/authz.test.js`.

## Assistance policy (tiers)

`api/_lib/policy.js`, pure and versioned.

- **T0, T1, T2 are not defined by VOXRELAY.** They ship as `defined: false`. An owner or admin may define each one: description, permitted actions (from a fixed catalogue of four non-conversational actions), prohibited inputs, output limit, approval mode. Audit is always on. Session content, audio, client identity and personal notes are prohibited inputs at every tier and cannot be unticked.
- **Default deny.** Unknown tier, undefined tier, unlisted action, undeclared or prohibited input, zero output limit, or no provider: denied, with the reason logged.
- **No provider ships.** `api/_lib/ai-adapter.js` returns a null adapter (`enabled: false`). Stored `ai_enabled` is never read as true. Nothing in the product depends on a model.
- **If a provider were ever added**, output would be capped, labelled `unverified`, flagged `requires_confirmation` and never auto-executed.
- **T3 is human only.** `isHumanOnly` runs before anything else in `evaluate`: tier T3 in any spelling, category `needs_human_judgment`, or `human_required`. The result is a hard stop: the adapter is not called, a support request is created with status Escalated, and one metadata-only audit event is written. `sealPolicy` replaces whatever a stored policy says about T3 with a frozen constant, so no policy document, request field or flag can open it. `tests/policy.test.js` attacks this with a hostile policy and an enabled spy provider.

## Operations and documentation modules

Added on top of the existing workflow; nothing that existed was removed. All seven read and write the same records as the schedule.

| Module | Route | What it is | Computed from |
|---|---|---|---|
| OPS dashboard | `/app/ops` | Today's sessions and work queues, each a count with a link to where it is cleared | assignments, session_docs, followups, billing_records, device_checks, support_requests |
| Live session assistant | `/app/session/:id` | One-tap log of interpreter interventions beside the prepared terms. Type and time only | session_events |
| Clinical documentation workspace | `/app/documentation` | Per-session structured documentation: encounter type, interpreting mode, intervention counts, three flags, optional process note. Draft, then submitted and locked; reopening is logged | session_docs |
| Interpreter reports | `/app/reports` | Sessions and minutes by pair, modality, category and exception for a date range; CSV export; per-interpreter table for organization staff | assignments, session_docs |
| Follow-up queue | `/app/follow-ups` | Post-session tasks with type, due date, status and optional assignment link | followups |
| Quality monitoring | `/app/quality` | Six indicators as numerator/denominator, plus the sessions behind the misses. No weighting, no score, nothing about conversations | assignments, assignment_events, device_checks, session_docs, followups |
| Billing | `/app/billing` | The interpreter's own log: rate and rules, not-yet-billed sessions with computed amounts, records from invoiced to paid, CSV export. No invoices are sent and no payments are processed | billing_settings, billing_records |

New tables: `session_docs`, `session_events`, `followups`, `billing_settings`, `billing_records`. A billing record copies the minutes, rate, currency and amount at creation, so later rate changes never alter it; it also keeps the assignment reference so it survives retention deleting the assignment.

Additional access rules (in `api/_lib/authz.js`, tested in `tests/ops.test.js`):

| Record | Interpreter (owner) | Coordinator | Admin / Owner | Other organization |
|---|---|---|---|---|
| Documentation draft | read, write | no | no | no |
| Submitted documentation of an organization assignment | read, reopen | read | read | no |
| Documentation of a personal assignment | read, write | no | no | no |
| Follow-up linked to an organization assignment | full | read, progress, assign | read, progress, assign | no |
| Organization dashboard, per-interpreter report | no | yes | yes | no |
| Organization quality indicators | no | no | yes | no |
| Rates and billing records | own only | no | no | no |

### Workflows added by the audit

| Flow | Stages | Enforced by |
|---|---|---|
| Session | coordinator offers (the request and the assignment are one step) → interpreter accepts → starts → closes out | `api/assignments.js`; each stage is refused out of order |
| Documentation | draft pre-filled from the live session log → interpreter edits → submits (locked) → owner or admin approves, or returns it as a draft | `canReadDoc`, `canReviewDoc`; a reviewer can never approve their own documentation |
| Source trace | every documented line names the record it came from: timed start/end, close-out category, live-log entries (type and time), or "entered by the interpreter". Counts that differ from the log are marked edited | `eventState().entries`, `Documentation.tsx` |
| Follow-up | interpreter proposes on an organization assignment → staff approve → staff assign (to themselves or the proposer) → assignee completes. Personal follow-ups skip approval: there is nobody to approve them | `followupTransition`, `followupInitialStatus` |
| Billing | completed session → timed minutes → rule applied (rounding, minimum) → record created as invoiced → marked paid | `ops-metrics.js`, `api/ops.js` |

There is **no transcript** and **no clinician role**. Nothing in the product records or transcribes a session, by the rule in the section below, so documentation is traced to the live log and the session record rather than to a transcript, and it is approved by an owner or admin of the interpreter's organization rather than by a doctor. Clinical notes about a patient do not exist anywhere in the system.

### The assistant

There are two, and neither is a language model. No AI provider is available to this deployment, so the provider-agnostic adapter still returns the null provider and the policy engine above is unchanged.

- **Before sign-in** (`HelpWidget.tsx`, `src/lib/helpSearch.ts`): searches the site's own written content (FAQ, every section of the public pages, the module list) in the browser, then suggests up to three related written answers. Nothing typed is sent.
- **After sign-in** (`Assistant.tsx`, `POST /api/ops?resource=assistant`): matches the question to a topic by keyword in English and Arabic (`api/_lib/assistant.js`) and answers from the person's own rows. It reads only, and the question is not stored or logged.

The signed-in answer is a real stream: newline-delimited JSON, each event written the moment the server has it (`streamRoute` in `api/_lib/core.js`).

| Event | Meaning |
|---|---|
| `meta` | the topic the question was matched to |
| `step` | a read that is starting (`run`) or finished (`done`, with the rows returned). Only reads that happen are announced: `records`, `history`, `glossary`, `org` |
| `block` | one piece of the answer; text is a locale key plus variables, so the client renders it in the interface language |
| `sources` | the record sets the answer was built from, with row counts and the time they were read |
| `suggest` | up to three follow-up topics, ranked by what the person's queues actually contain |
| `done` / `error` | the stream always ends with one of these; a stream that ends without either was cut off |

- **What streams is events, not model tokens.** There is no model, so there are no tokens and no markdown to render progressively. Nothing is typed out artificially.
- **Refusals.** Questions of judgment get "Human support required" and no reads. Organization-wide questions from someone whose role does not include `ops.org.view` are refused with no reads. Requests to translate are declined, then the person's own glossary matches are shown with their labels. Each refusal writes one metadata-only audit event.
- **Recovery** (`src/lib/assistantStream.ts`). If the request fails or the stream stops before `done`, what arrived stays on screen, the status line says it is reconnecting, and the question is asked again (twice at most, waiting for the browser to come back online first). Application refusals (401, 400, 429) are not retried. Safe because the assistant only reads.
- **Presentation.** One status line holds its place from start to finish; the working indicator is held back for 250 ms so quick answers do not flicker; blocks fade in by opacity only, so nothing shifts; a new question scrolls to the top once and the answer grows beneath it. Each finished answer ends with its source line, a primary action, a secondary "Ask a person" action and the related suggestions.
- **Model instructions.** `api/_lib/assistant-prompt.js` holds the reply rules for a future model (answer first, at most three sentences, cite record references, no stock phrases, refuse out-of-role and judgment questions). It is passed on the only path that could reach a model and is unused until a provider is connected.

### Sign-in

`AuthContext` derives `loading` instead of setting it: from the instant a session exists until its profile has been requested, the app is loading, so there is no frame in which a signed-in person looks signed out. `/login` has one exit: when a session and profile exist it navigates to the page that was asked for (`src/lib/returnTo.ts`, app paths only), which also covers the Google window and the first-run setup in between. A session completed in another window is picked up when the tab regains focus.

## Privacy by construction

- The live session log and close-out accept a type or category only. Documentation is structured fields plus one capped process note.
- Quality indicators are computed from operational timestamps and statuses. Conversations are never an input.
- Free-text fields show "Do not enter confidential session content" and are capped (counted in code points). Close-out and the assistance endpoint accept no free text at all.
- Audit metadata passes through `safeMeta`, which drops anything that is not a number, a boolean or a short code.
- The audit table is append-only **in the application**: the code only inserts and selects. It is not called tamper-proof.
- The device check analyses microphone level in the browser and stores only pass or fail facts.
- .ics import reads timing only; titles and descriptions are never parsed into records.

## Internationalisation

- Strings live in `src/locales/{en,ar}/*.json`. A test fails the build if a component contains literal visible text, if a key is missing, or if Arabic and English key sets or placeholders differ.
- Layout uses logical properties only (`ms-`, `pe-`, `start-`, `border-s`, `text-start`). A test rejects physical left/right utilities. Directional icons flip with `rtl:-scale-x-100`. `<html dir lang>` follows the chosen locale.
- User content is direction-isolated: inputs use `dir="auto"`, rendered terms use `<bdi lang dir>`. IDs and clock times are isolated left-to-right (`.mono-ltr`).
- Fonts: Instrument Sans, Instrument Serif and IBM Plex Mono are self-hosted (Latin). The stacks continue with self-hosted Noto Sans Arabic, Noto Naskh Arabic, Noto Sans Hebrew and Noto Sans Devanagari, then the CJK, Thai and Indic fonts shipped with each operating system. CJK web fonts are not bundled (tens of megabytes); system fonts are used instead.
- Search key (`src/lib/text.ts`): NFKC, lower-case, strip Latin accents, Hebrew points and Arabic vowel marks, unify alef, yeh, kaf and ta marbuta forms. Indic vowel signs are kept. Matching is by substring, so unsegmented scripts work.
- CSV: UTF-8 or UTF-16 in, UTF-8 with BOM out; other encodings are refused rather than imported as mojibake.
