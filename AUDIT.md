# VOXRELAY UI/UX & Engineering Audit

Recorded against the live application (`/` , `/contact`, `/login`, `/app/*`) and attached user screenshots (`image-1.png` through `image-4.png`).

## Defect Ranking

### P0 — Critical Functional & Layout Bugs
1. **Contact / Request Access blocked in local/sandbox runtime (`image-2.png`)**: Submitting `/contact` returned `503 Contact service is not configured yet.` when `SUPABASE_SERVICE_ROLE_KEY` was unset or unreachable, preventing real end-to-end access requests.
2. **Hero H1 horizontal clipping on narrow viewports (`image-3.png`)**: `"Make room for the work that matters."` clipped horizontally on the right edge (`"Make room for the work th"`), caused by rigid `max-width` / `clamp()` sizing without `overflow-wrap` and `overflow-x: clip` container safety.
3. **No real workspace persistence without external Supabase egress**: Creating assignments, saving glossary terms, creating support tickets, and reviewing access requests had no local relational fallback.

### P1 — High-Impact UX & Design Defects
4. **2007-style native `<select>` dropdown (`image-1.png`)**: Browser OS default gray dropdown list clashed with the editorial surface and lacked keyboard/custom styling consistency.
5. **Assistant pill acting as a static link billboard (`image-4.png`)**: Floating bottom pill overlapped content and only rendered 5 static links instead of a real Q&A + grounded knowledge-base + deep research assistant sheet.
6. **Weak typographic hierarchy & structural preview**: Hero preview used placeholder `"14:00 UTC"` text, weak visual depth, and missing interactive tabs/motion/dark-mode tokens.
7. **Desktop header & sidebar organization**: Header lacked scroll condensation and rich panel structure; workspace screens lacked unified empty/loading/error states and `Cmd+K` quick jump.

### P2 — Polish, Hardening & Completeness
8. **Missing admin approval queue & email outbox inspector**: No UI to review access requests, issue one-time invite tokens, or inspect generated EN/AR transactional emails locally.
9. **Missing FAQ route/section backed by the same KB**, custom 404 page, `robots.txt` / `sitemap.xml`, and structured `DECISIONS.md` / `QA.md`.
