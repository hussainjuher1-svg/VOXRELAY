# Engineering & Design Decisions (`DECISIONS.md`)

1. **Dual-Mode Persistence (`Supabase Postgres` + `node:sqlite`)**
   - Production deployments on Vercel use Supabase Postgres (`db/schema.sql`) via `SUPABASE_SERVICE_ROLE_KEY`.
   - Local development and sandbox environments without Supabase service-role credentials or outbound database egress automatically persist to a real relational SQLite database (`.data/voxrelay.sqlite` via Node 22 built-in `node:sqlite`), keeping Vercel serverless read-only filesystem behavior untouched (`process.env.VERCEL` disables local file writes).
   - Every access request, email outbox item, user session, assignment, glossary term, support ticket, and audit event is stored in real SQL tables with zero fake in-memory stubs.

2. **Accessible Primitives & Custom Controls**
   - Replaced native `<select>` controls with `@radix-ui/react-select`, modals/sheets with `@radix-ui/react-dialog`, tabs with `@radix-ui/react-tabs`, and tooltips with `@radix-ui/react-tooltip`.
   - Added a `Cmd+K` / `Ctrl+K` command palette and `Cmd+/` assistant shortcut.

3. **Typography, RTL & Motion**
   - Self-hosted `@fontsource/fraunces` (editorial display serif, italic used for one emphasis phrase per heading), `@fontsource/inter-tight` (UI & body), `@fontsource/ibm-plex-mono` (small eyebrows & references), and `@fontsource/ibm-plex-sans-arabic` + `@fontsource/readex-pro` for native Arabic (`line-height: 1.75`, zero letter-spacing).
   - Motion powered by `motion/react` using transform/opacity only, honoring `prefers-reduced-motion`, without scroll-jacking.

4. **Grounded Assistant (Ask + Research Modes)**
   - Uses a single provider abstraction (`api/_lib/assistant-engine.js`) supporting `ANTHROPIC_API_KEY` when configured and a deterministic, grounded BM25/section-scoring knowledge-base synthesizer + research brief builder when offline or unconfigured.
   - Always enforces PII redaction, zero live translation/interpreting, zero recording/transcription, citations on every KB answer, explicit user confirmation before saving research terms, and 1-click escalation to a human support ticket.
