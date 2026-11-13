# VOXRELAY

A workspace for remote medical interpreters: assignments, availability, preparation with a real device check, a session focus screen, close-out, terminology in any script, resources, support, an activity log, and an organization side with roles, offers, a support queue, policy configuration and an audit view. On top of that sits an operations and documentation layer: OPS dashboard, live session assistant, clinical documentation workspace, interpreter reports, follow-up queue, quality monitoring, billing, and a records assistant. Human-led: it does not interpret, record, transcribe or translate.

See `ARCHITECTURE.md` for roles, data model, permission matrix and tier policy, and `REFERENCE_ANALYSIS.md` for what was (and was not) learned from the reference products.

## Run

```bash
npm install
npx vercel dev      # serves the React app and the /api functions together
npm test            # Vitest: policy engine, RBAC matrix, validation, rate limiting, metrics, assistant stream and recovery, text/CSV/ICS, i18n and RTL guards
npm run build       # type-check and production build
```

`npm run dev` starts the front end only; the `/api` routes need `vercel dev` or a deployment.

### End-to-end acceptance runs

Both run against a deployment with real accounts and create real records in them. Nothing is mocked.

```bash
# HTTP API: session flow, documentation and review, follow-ups, billing, access rules, dashboard totals, assistant stream
E2E_BASE=https://your-deployment E2E_OWNER=owner@x:pw E2E_INTERPRETER=a@x:pw E2E_OTHER=b@x:pw npm run e2e:api
# Browser (Playwright; first run `npx playwright install chromium`): sign-in return, assistant, recovery, pages, right-to-left, mobile, console
E2E_BASE=https://your-deployment E2E_INTERPRETER=a@x:pw npm run e2e:browser
```

The three accounts must exist, be verified and belong to no organization before `e2e:api`. Add `E2E_DELETE_ACCOUNTS=1` to remove them afterwards.

### Environment

| Variable | Used by | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `VITE_SUPABASE_URL` | API, browser | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | API only | Server-side database and auth access. Never shipped to the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `VITE_SUPABASE_ANON_KEY` | Browser, status probe | Public key, used only for sign-in |
| `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_AUTH_PROXY` | Browser | Google sign-in. If either is missing the Google button is shown disabled with a note. |

No secrets are committed. `.env` and `vercel.json` hold only the public values provided by the host.

### Google sign-in setup

1. Google Cloud Console → APIs & Services → Credentials → create an OAuth 2.0 Client ID (Web application).
2. Add the authorised redirect URI: the value of `VITE_GOOGLE_AUTH_PROXY` (on this deployment `https://designarena.ai/auth/apps/google/callback`). If you run your own Supabase project instead, enable the Google provider in Supabase Auth and use `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Put the client ID in `VITE_GOOGLE_CLIENT_ID`. The client secret stays with whichever service performs the code exchange (the proxy or Supabase), not in this repository.

## Before real data: lock the database

**Required.** On the hosted project this was deployed to, the public browser key can still read and write tables directly, which bypasses every permission check in the API. Per-table deny policies were created with the available tooling but had no effect. Run `db/lockdown.sql` once in the Supabase SQL editor. It drops existing policies, enables row-level security and revokes table access from the public roles. The app keeps working because the API uses the service-role key.

`/status` shows the result live ("Direct database access with the public key: Locked / Open"), and the app shows a warning banner while it is open.

## Stated limits

These differ from the original brief. They are listed so nobody assumes otherwise.

| Brief | This build |
|---|---|
| Next.js, Prisma, Auth.js | The existing Vite + Vercel functions + Supabase stack was kept. |
| Argon2id, own reset tokens, session list with revoke, httpOnly cookies, CSRF tokens | Passwords, reset links and sessions are handled by Supabase Auth (bcrypt, single-use expiring links, bearer tokens kept in browser storage). There are no auth cookies, so there is no CSRF token. Per-device session listing is not available; "sign out other devices" and "sign out everywhere" are. |
| Verification link before access | The API refuses unverified accounts, but this Supabase project is set to auto-confirm new email addresses, so no verification email is sent. Turn on "Confirm email" in Supabase Auth to enforce it. Links then depend on the project's Site URL and redirect allow-list. |
| 12+ character passwords | Enforced in the sign-up, reset and change-password forms. Supabase's own minimum is a project setting; raise it to 12 there as well. |
| Auth rate limiting with backoff | Supabase Auth applies its own limits. The sign-in form adds a client-side wait after repeated failures (a courtesy, not a control). The API has a database-backed limiter with backoff on the public contact form, support creation and the assistance endpoint. |
| CSP and secure headers | CSP is a meta tag added at build time and allows inline scripts and styles (the host injects an inline script). `nosniff`, `Referrer-Policy` and `Permissions-Policy` are set in `vercel.json`. No `frame-ancestors`, because the host previews the app in a frame. |
| Playwright end-to-end and axe | End-to-end runs exist (`tests/e2e`) and were run against the deployment, but they are not part of `npm test` because they need real accounts. Email verification and the Google window are not automated. Accessibility was built to WCAG 2.2 AA patterns but has not been audited with axe or assistive technology. |
| AI assistant | **No language model is connected**: none is available to this deployment and no API key can be supplied. The assistant is a keyword-routed lookup over the signed-in person's own records (and, before sign-in, over the site's written pages). Its answer is a real server stream of progress and answer events with sources and follow-up suggestions, and it reconnects after a dropped connection. It does not stream model tokens or markdown, because there is no model; the reply rules for one are written (`api/_lib/assistant-prompt.js`) but unused. |
| Transcripts and clinical notes | None. Nothing records or transcribes a session, so there is no transcript to draft notes from and no patient note for a doctor to approve. Documentation describes how the session was interpreted, is traced line by line to the live log and the session record, and is approved by an owner or admin of the interpreter's organization. There is no clinician role. |
| Billing | A log the interpreter keeps: computed amounts, invoiced/paid tracking, CSV export. No invoices are sent, no payments are processed, and there is no organization-side billing. |
| Clinical documentation | Structured documentation of how a session was interpreted. It is not a patient record and has no field for patient identity or for what was said. |
| Quality monitoring | Six operational indicators from timestamps and statuses. No conversation is monitored and there is no reviewer scoring. |
| Glossaries with files | Terms support CSV import and export, links and version history. Binary file attachments are not implemented. |
| Offline use | With consent, terms and the current session's prepared terms are kept in the browser and remain searchable if the connection drops while the app is open. There is no service worker, so the app does not start offline. |
| Notifications | In-app only ("Needs attention"). No email or push is sent, including for invitations. |
| Arabic | Complete interface translation with mirrored layout. The Arabic text was machine-assisted and has not been reviewed by a professional translator; Settings says so. |
| Support | Requests from organization members go to that organization's queue. A solo interpreter's requests are stored but nobody is assigned to answer them; the app says this in plain words. Contact-form requests are stored in `access_requests` with no in-app inbox. |
| Retention | Applied when the app loads, not by a scheduled job. |

## No fake data

Nothing is seeded: no users, assignments, terms, resources, documentation, follow-ups, billing records, logos, statistics or testimonials. Every number on screen is computed from rows the signed-in user or their organization created. Tests build their fixtures in memory.
