# VoxRelay — Enterprise Feature Specification

Spec version 1.0 — 2026-11-24.
**Core rule:** No fake data — every number on screen is measured live in the user's browser or fetched from a real API.

## Implementation Status Matrix

| Area | Status | Notes |
|---|---|---|
| Policy engine (`T0–T3`) | ✅ Implemented & tested | `api/_lib/policy.js`, `tests/policy.test.js` |
| Authorization (RBAC & scoping) | ✅ Implemented & tested | `api/_lib/authz.js`, `tests/authz.test.js` |
| Readiness scoring (0–100 + Voice/Video/Full) | ✅ Implemented & tested | `api/_lib/readiness.js`, `src/lib/diagnostics.ts`, `tests/readiness.test.js` |
| Real device & environment probes | ✅ Implemented | Browser/OS/WebGL/CPU/Display/Storage/Codec/WebRTC/Mic dB+clipping/Camera FPS/Speaker tone/Screen-share in `src/lib/diagnostics.ts` & `DeviceCheckPage` |
| Live network diagnostics | ✅ Implemented | Sequenced RTT median/p95, jitter, packet loss %, up/down throughput via `/api/health` & `/api/ops?resource=network_probe` |
| Auth, lockout, session manager & password strength | ✅ Implemented | 12+ chars, breached-list check, live strength meter, 15-min lockout after 5 failures, per-session & revoke-all manager in `SettingsPage` |
| Immutable audit log & GDPR export | ✅ Implemented | `/api/ops?resource=audit` (CSV export in Admin), `/api/ops?resource=gdpr_export` (full JSON export in Settings) |
| Assistant & Knowledge Base | ✅ Implemented & eval-tested | `api/_lib/assistant-engine.js`, `api/_lib/kb.js`, `tests/assistant-eval.test.js` |
| i18n + RTL (`EN` / `BN` / `AR`) | ✅ Implemented & tested | `src/locales/{en,bn,ar}/common.json`, `tests/i18n-rtl.test.ts` |
| Accessibility & contrast (≥ 4.5:1) | ✅ Implemented & tested | `tests/landing-a11y.test.tsx`, compact `.vx-stage-card` |
| Ops metrics, `/api/health` & `/api/ready` | ✅ Implemented & tested | `api/health.js`, `api/ready.js`, `tests/ops-metrics.test.js` |
| Input validation & security headers | ✅ Implemented & tested | `api/_lib/validate.js`, `api/_lib/core.js`, `tests/validate.test.js` |
| Email outbox & templates | ✅ Implemented | `api/_lib/email-templates.js`, `AdminReviewPage` outbox queue |
| Enterprise SSO (SAML/OIDC/SCIM), MFA, Slack, Scheduled digests | 🗺️ Roadmap (Tier 2) | Requires customer IdP & outbound webhook credentials |
