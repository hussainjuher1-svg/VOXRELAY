# VOXRELAY architecture

## Stack

| Layer | Choice |
|---|---|
| UI | React 19, TypeScript, `react-router-dom`, Tailwind CSS v4 + self-hosted `@fontsource/*` tokens in `src/index.css`, `lucide-react` icons |
| API | Vercel serverless functions in `api/` (`health.js`, `status.js`, `contact.js`, `assignments.js`, `ops.js`) with shared logic in `api/_lib/` |
| Data | Supabase Postgres (`voxrelay` schema in `db/schema.sql`, locked down via `db/lockdown.sql`) accessed server-side via `SUPABASE_SERVICE_ROLE_KEY` |
| Auth | Supabase Auth (`src/context/AuthContext.tsx`, `src/pages/Auth.tsx`, verified via `api/_lib/supabase.js`) |
| Validation | Zod (`api/_lib/validate.js`) on API request payloads, plus code-point caps and `safeMeta` filtering |
| Tests | Vitest + React Testing Library (`tests/*.test.{js,ts,tsx}`) |

## Roles

Every new account starts as an **Interpreter**. Organization roles exist through active membership in `voxrelay.memberships`: **Owner**, **Admin**, **Coordinator**, and **Interpreter**. An account belongs to at most one active organization (`idx_voxrelay_membership_one_org`).

## Workflow

`Assignment -> Preparation -> Session -> Close-out`, enforced in `api/assignments.js`:

| Status | Set when |
|---|---|
| `offered` | A coordinator, admin, or owner creates an assignment for a member |
| `scheduled` | Created directly, or an offer is accepted |
| `preparation_required` | Preparation started or readiness is incomplete |
| `ready` | Every checklist item is done and a passing device check counts (`api/_lib/readiness.js`) |
| `rescheduled` | Start time or duration updated |
| `in_progress` | Assigned interpreter starts the session |
| `completed` | Close-out completed with an `exception_category` enum |
| `cancelled` | Cancelled or offer declined (`offer_state = 'declined'`) |

## Screen map

* **Public:** `/`, `/how-it-works`, `/interpreters`, `/organizations`, `/privacy`, `/about`, `/contact`, `/status`
* **Auth & onboarding:** `/login`, `/reset-password`, `/onboarding`
* **Workspace:** `/app`, `/app/ops`, `/app/assignments`, `/app/assignments/:id`, `/app/assignments/:id/close`, `/app/session/:id`, `/app/availability`, `/app/terminology`, `/app/resources`, `/app/device-check`, `/app/documentation`, `/app/follow-ups`, `/app/reports`, `/app/quality`, `/app/billing`, `/app/assistant`, `/app/support`, `/app/activity`, `/app/organization`, `/app/settings`

## Data model (`db/schema.sql`)

All 25 tables live in the `voxrelay` schema: `profiles`, `availability_overrides`, `organizations`, `memberships`, `invitations`, `assignments`, `assignment_events`, `assignment_links`, `device_checks`, `terms`, `term_versions`, `resources`, `saved_resources`, `support_requests`, `support_messages`, `assistance_policies`, `audit_events`, `consents`, `access_requests`, `rate_events`, `session_events`, `session_docs`, `followups`, `billing_settings`, and `billing_records`.

No table defines columns for client/patient identity, audio recordings, transcripts, or conversation content.

## Authorization (`api/_lib/authz.js`)

Default deny across all capabilities (`CAPABILITIES`), asserted cell by cell in `tests/authz.test.js`:

* `serializeAssignment` strips `personal_note` and `checklist` for anyone other than `owner_id`.
* `canReadDoc` keeps `draft` documentation private to the author and exposes `submitted`/`approved` org docs only to `owner`, `admin`, and `coordinator`.
* `canReviewDoc` restricts approval to `owner` and `admin` and prevents authors from approving their own documentation.
* `followupTransition` and `followupInitialStatus` enforce staff approval for organization follow-ups while letting personal follow-ups start `in_progress`.
* Cross-organization assignment lookups return `404` rather than `403`.

## Assistance policy (`api/_lib/policy.js`)

* **T0, T1, T2** ship undefined (`defined: false`).
* **Default deny:** Unknown tiers, undefined tiers, unlisted actions (`ACTION_CATALOGUE`), prohibited or undeclared inputs, zero output limits, or disabled adapters (`api/_lib/ai-adapter.js`) are denied.
* **T3 is human only:** `isHumanOnly` and `sealPolicy` ensure tier `T3`, `needs_human_judgment`, or `human_required` always short-circuit before provider checks, never invoke any adapter, and return escalation metadata. Verified with a hostile-policy test in `tests/policy.test.js`.

## Privacy, localization, and text utilities

* **No client-side telemetry:** `index.html` contains no session recording, analytics beacons, or DOM-editing scripts.
* **i18n & RTL (`src/locales/{en,ar}/common.json`, `src/lib/i18n.ts`):** `tests/i18n-rtl.test.ts` enforces EN/AR key and placeholder parity, blocks Google Fonts URLs, and forbids physical left/right CSS offsets or utilities.
* **Text / CSV / ICS (`src/lib/text.ts`):** `normalizeSearchKey` normalizes Unicode (`NFKC` -> `NFD` -> strip Latin/Hebrew/Arabic diacritics -> unify Arabic forms -> `NFC`), `decodeCsvBytes` validates UTF-8/UTF-16 encodings, `exportCsv` adds a UTF-8 BOM and neutralizes formula prefixes, and `parseIcsTimingOnly` extracts `DTSTART`/`DTEND` only.
