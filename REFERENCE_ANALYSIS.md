# Reference analysis

Scope: structure and behaviour only, from public material. Nothing was copied (code, text, images, logos, fonts, names). No authenticated area, API or app binary was accessed.

## What could actually be observed

This analysis was done from an automated build environment with a small search budget, so it is thin. It is recorded as it happened rather than padded.

| Reference | Source reached | What it showed |
|---|---|---|
| Boostlingo / Interpreter Intelligence | Search-result summaries of boostlingo.com pages and of the Interpreter Intelligence App Store listing (12 Nov 2026). Direct page fetches returned 403 or empty bodies. | Product is positioned as interpretation management and scheduling for language service providers. The App Store summary lists service types as a short enumerated list (scheduled, video remote, over the phone) and says appointments of different kinds are viewed "in a single calendar". Marketing pages group content under a Solutions menu with per-audience and per-product sub-pages. Compliance and certification wording is prominent on their marketing pages. |
| Interpreters' Help / BoothMate | Search-result summaries of interpretershelp.com/boothmate, an app directory listing and two practitioner blog posts. interpretershelp.com now redirects to boothmate.app, which returned an empty body. | A glossary tool with a companion app whose stated purpose is fast offline glossary search while working. Glossaries sync when online and stay searchable and editable offline. Glossaries can be shared with colleagues as view or edit. A migration note mentions "glossaries and jobs" as the two main record types. |
| KUDO Interpreter Assist | arXiv abstract 2201.01800 and a press-release summary. The product page URL tried returned 404. | Two functions: automatic glossary creation from documents before an assignment, and real-time term suggestions during a session. It is an AI-driven preparation and in-session aid. |
| Remoto by ProZ | Not reached. The hostname tried did not resolve and the search budget was exhausted before another query. | No observations. |

## Patterns taken forward, and where each came from

| Pattern | Origin | How VOXRELAY implements it |
|---|---|---|
| One unified calendar across assignment kinds | Observed (Boostlingo App Store summary) | Personal assignments, organization offers and availability overrides share one list and one month view (`/app/assignments`). |
| Short enumerated service types | Observed (same) | Modality is a five-value enum, shown as tabs on the home page. |
| Glossary as a first-class record, searchable offline while working | Observed (BoothMate) | Terminology module; consented device copy that stays searchable when the connection drops; session workspace reads from it. |
| Preparation tied to a job | Observed (Interpreters' Help "jobs" + KUDO preparation framing) | Each assignment has a checklist plus linked terms and resources, with computed readiness. |
| Version history on glossaries | Brief | `term_versions` table, restore from any earlier version. |
| Utility bar, mega-menu, persistent Login and Request access, two-CTA hero, tabbed service types, FAQ accordion, audience contact selector, grouped footer with legal bar and status link | Brief (could not be verified against the references from here) | `PublicShell.tsx`, `pages/Public.tsx`. |
| Left sidebar, offers with accept or decline, job record with history, weekly hours plus date overrides, audit trail filterable by area | Brief (not verifiable without signing in, which was out of bounds) | `AppShell.tsx` and the modules under `src/pages/app`. |

## Where VOXRELAY deliberately differs

- **No automated glossary generation and no real-time suggestions.** KUDO's tool does both with AI. VOXRELAY ships every automated path disabled behind a default-deny policy engine, because the brief requires a human-led product. Term import is from the interpreter's own CSV.
- **No compliance or certification wording.** The references' marketing leans on it. VOXRELAY has earned none, so the trust section says so.
- **No agency billing, call routing or call delivery.** These are central to interpretation management systems and are out of scope here.
- **Close-out is category only.** No free-text incident narrative, so conversation content cannot end up in a record.

## Not done

- Screen inventories, field sets, status models and empty, error or loading states of the reference apps were **not** inventoried: they sit behind sign-in, and the public help centres could not be fetched from this environment. The field sets and status models in VOXRELAY come from the brief.
- Before relying on this document for product decisions, repeat the exercise by hand against each vendor's public help centre and their own sign-up screens.
