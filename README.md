# VOXRELAY

A calm, human-led workspace for remote medical and community interpreters: assignments, preparation with live browser microphone checks, a dark-mode session focus screen, multilingual terminology with UTF-8/UTF-16 CSV support, billing tracking, organization roles, human support tickets, an access review queue with email outbox inspector, and a grounded Ask + Research assistant. Human-led by construction: it does not interpret live speech, record, transcribe, or store patient identity.

See `ARCHITECTURE.md` for roles, schema, permission matrix, and tier policy, `AUDIT.md` for UI/UX defect ranking, `DECISIONS.md` for architecture decisions, and `QA.md` for test and verification details.

## Run

```bash
npm install
npm run dev         # Starts Vite + devApiPlugin serving all /api/* routes locally (SQLite fallback in .data/)
npm test            # Vitest: 9 suites (assistant eval, a11y, i18n/RTL, RBAC, policy, readiness, ops metrics, validation, CSV/ICS)
npm run lint        # ESLint (TypeScript, React Hooks, jsx-a11y, API & test files)
npm run build       # Type-check (tsc -b) and production Vite build
npx vercel dev      # Serves the React app and /api serverless functions together
```

### Environment

Copy `.env.example` to `.env` (`.env` and `.env.*` are ignored by Git):

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Browser, API fallback | Supabase project URL (required for frontend build) |
| `VITE_SUPABASE_ANON_KEY` | Browser, API fallback | Public anon key used for browser sign-in (required for frontend build) |
| `SUPABASE_URL` | API only | Server-side Supabase project URL (falls back to `VITE_SUPABASE_URL`) |
| `SUPABASE_ANON_KEY` | API only | Server-side Supabase anon key for confirmation email dispatch & RLS probes (falls back to `VITE_SUPABASE_ANON_KEY`) |
| `SUPABASE_SERVICE_ROLE_KEY` | API only | Server-side database and auth access (never expose to frontend; falls back to local `node:sqlite` in dev when unset) |
| `ANTHROPIC_API_KEY` | API only | Optional Anthropic model for `/api/assistant` (falls back to grounded local KB + Research synthesizer) |
| `ANTHROPIC_MODEL` | API only | Optional model override (default `claude-sonnet-4-5`) |
| `APP_ORIGIN` | API only | Canonical production website origin used to generate one-time invitation URLs (e.g. `https://your-app.vercel.app`) |
| `SESSION_SECRET` | API only | HMAC secret for local session cookies and invite tokens |

## Key Routes

- **Public**: `/`, `/how-it-works`, `/interpreters`, `/organizations`, `/privacy`, `/faq`, `/contact` (Request Access), `/status`, `/login`, `/reset-password`
- **Workspace**: `/app` (Overview), `/app/assignments`, `/app/session/:id`, `/app/terminology`, `/app/device-check`, `/app/billing`, `/app/support`, `/app/admin` (Access Review Queue & Outbox Inspector), `/app/assistant`, `/app/settings`

## Database setup & lockdown (Supabase Production)

The application uses a dedicated, server-only `voxrelay` schema. See [the schema architecture decision](docs/audits/phase-03-schema-architecture-decision.md) for trust boundaries and ordering.

For an **empty disposable local database**, the complete bootstrap is roles → `db/schema.sql` → migration `001` → migration `002` → `db/lockdown.sql`. Core schema + lockdown alone does not create the required RPCs. Direct SQL tests do not validate PostgREST's exposed-schema allow-list.

**Do not execute this bootstrap against production.** Existing installations require a reviewed transactional upgrade, schema/configuration preflight, recovery plan and explicit approval. No production migration, exposed-schema change, permission change or deployment is authorized by these instructions.

## No fake data

Nothing is seeded: no demo accounts, fake statistics, invented timestamps, or synthetic records. Every count renders from user-created records or API responses.
