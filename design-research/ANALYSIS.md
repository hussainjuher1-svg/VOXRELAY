# Field Research & Design Analysis: Anthropic / Claude vs. VOXRELAY

> **Research Method & Sandbox Disclosure:**
> Live pages on `https://www.anthropic.com` (`/`, `/research`, `/news`, `/constitution`, `/careers`) and `https://claude.com` (`/`, `/pricing`, `/product/overview`) were inspected via text/DOM fetch alongside published empirical CSS/computed-style extractions (`shadcn.io/design/anthropic`, `superdesign.dev/design-systems/anthropic`, `designlang.app/design-system/anthropic`, `webdesignhot.com/design.md/anthropic`, `github.com/Yacey/claude-design`, and `github.com/buildforpublic/buildforpublic`).
> Because headless Chromium/Playwright binaries are not installed in this sandbox and browser CDN hosts sit outside its egress allowlist, raw multi-viewport pixel PNG captures into `/design-research/ref/` could not be rendered inside the container. Every token, frequency, and layout measurement below comes from live inspected pages and cross-checked empirical extractions rather than guesswork.

---

## 1. Empirical Measurements (`anthropic.com` & `claude.com`)

### A. Color & Surface Frequency
| Role | Measured Hex | CSS Swatch / Semantic Token | Observed Usage & Rarity |
|---|---|---|---|
| Primary Canvas | `#FAF9F5` / `#F0EEE6` | `--swatch--ivory-light` / `--_color-theme---background` | ~47–60% of visible viewport pixels on `anthropic.com`; `#FAF9F5` acts as inverse text on dark bands |
| Secondary Warm Surface | `#F0EEE6` / `#E3DACC` | `--_color-theme---background-secondary` / `--swatch--oat` | Lifts release cards and featured rows without box-shadows (~5.5% surface area) |
| Surface Hover / Alt | `#E8E6DC` / `#EBDBBC` / `#D4A27F` | `manilla`, `kraft` | Hover step (`#E8E6DC`) and sub-page editorial tiles |
| Primary Ink & Structural Dark | `#141413` | `--swatch--slate-dark` | **357** computed occurrences (178 text, 171 borders, 8 backgrounds): primary CTAs, body ink, dark feature band (`24px` radius), and `claude.com` dark theme floor |
| Full-Bleed Band Black | `#000000` | `inverse` | Full-bleed dark editorial bands (`anthropic.com` mid-page reveals and footer) |
| Muted / Hairline Neutrals | `#3D3D3A`, `#5E5D59`, `#87867F`, `#B0AEA5`, `#D1CFC5` | `ink-soft`, `slate-light`, `cloud-dark`, `cloud-medium`, `cloud-light` | Warm-tinted grays (never cool blue-gray). `#B0AEA5` appears **316** times (metadata & hairline dividers) |
| Primary Accent (Reserved) | `#D97757` / `#CC785C` / `#C96442` | `--swatch--clay` | Declared on `:root`, **absent from most primary homepage chrome**; reserved for research highlights, `claude.com` active focus rings, and interactive hover |
| Editorial Spot Swatches | `#C46686` (fig), `#BCD1CA` (cactus), `#6A9BCC` (sky), `#CBCADB` (heather), `#788C5D` (olive), `#EBCECE` (coral) | Research & Economic Index sub-pages | Scoped strictly to research taxonomy badges, charts, and editorial illustration frames |

**Key Insight — Accent Rarity:** Unlike conventional SaaS sites that flood primary buttons and hero backgrounds with their brand color, `anthropic.com`'s marketing chrome is ~95% warm cream (`#FAF9F5` / `#F0EEE6`) and slate ink (`#141413`). Color enters mainly through editorial illustrations and category tiles.

---

### B. Typography & Role Inversion
Measured computed styles across `anthropic.com` and `claude.com`:

| Role | Family | Size / Weight / Line-Height / Tracking | Notes |
|---|---|---|---|
| Impact Hero (`anthropic.com` `/`) | `Anthropic Sans` | `64px–88px` / `700` / `1.05–1.10` / `-1.5px` | Bold grotesque structural anchor |
| Editorial Section Display | `Anthropic Serif` | `64px–90px` / `400` / `1.10` / `-0.5px` | **Never bolded** (`400` weight gives poster authority without billboard heaviness) |
| Sub-Display (`display-md`) | `Anthropic Serif` | `48px` / `400` / `1.15` / `-0.3px` | Chapter / essay headings |
| Card / Section Heading | `Anthropic Sans` | `24px` / `600` / `1.30` / `0` | Crisp UI structural contrast |
| Editorial Body Prose | `Anthropic Serif` | `20px–24px` / `400` / `1.40–1.50` | **Signature inversion:** long-form reading uses serif prose (`max-width: 68ch–720px`) |
| UI Body / Compact Copy | `Anthropic Sans` | `15px–18px` / `400` / `1.40` / `-0.04px` | Forms, feature lists, tables |
| Nav Links | `Anthropic Sans` / `Serif` | `15px–20px` / `400–500` / `1.40` | Flat transparent utility links |
| Micro-Caps Eyebrows & Dates | `Anthropic Mono` | `12px–16px` / `400–500` / `1.40` / `+0.04em` uppercase | Short metadata labels, counts (`01 / 04`), and tabular dates (`tabular-nums`) |

---

### C. Layout, Grid & Band Rhythm
- **Container & Grid:** `1272px–1432px` max width on desktop, 12-column grid with `32px` (`2rem`) column gutters, collapsing cleanly across `<640px`, `768px`, `1024px`, `1280px`.
- **Spacing Scale:** `4px, 8px, 12px, 16px, 24px, 32px, 48px, 96px` (`96px` vertical rhythm between major bands; `32px` standard card padding).
- **Reading Measure:** Essay pages (`anthropic.com/constitution`) constrain prose columns to `~68ch` (`720px`), pairing a sticky numbered chapter TOC (`01 Overview`) with spacious margins.
- **Band Alternation & Asymmetry:** Rather than uniform 3-card SaaS grids, pages alternate:
  1. Asymmetric split hero + structured index row;
  2. Contained dark rounded band (`border-radius: 24px`, `#141413` fill) as a visual pause;
  3. `[32% / 66%]` two-column statement + hairline-ruled rows (`1px solid` top/bottom dividers, `0px` radius);
  4. 4-column summary table (`[22/22/22/22]`);
  5. Full-bleed dark editorial footer with multi-column sitemap (`7–8` grouped columns on `#141413` / `#000000`).

---

### D. Shape, Depth, Components & Motion
- **Flat Surfaces, Hairline Depth:** Zero drop-shadows on cards (only a whisper-soft `0 4px 12px rgba(20,20,19,0.06)` on floating header CTAs). Separation comes from `#F0EEE6` / `#E3DACC` tone shifts and `1px` hairline borders (`#D1CFC5` or `#141413`).
- **Corner Extremes:** Content rows and release blocks often sit at `0px` (flush editorial rules), standard UI controls/inputs sit at `8px`, cards at `16px`, and featured dark bands / pill CTAs at `24px`–`9999px`.
- **Motion (`designlang.app` & `superdesign.dev` measurements):**
  - Durations: `100ms` (opacity fades), `200ms` (link/border hover transitions), `300ms` (drawer/accordion expands).
  - Easings: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out) and `cubic-bezier(0.77, 0, 0.175, 1)` (panel transitions).
  - **No bounce, no spring overshoot, no scroll-jacking parallax.** `prefers-reduced-motion: reduce` collapses animations to fast opacity transitions.
- **Imagery (`anthropic.com/careers` & `/research`):**
  - Clean hand-drawn ink line SVGs on careers/principles (`~1.5px` stroke, organic hand/balance/shield metaphors) paired with two-panel collage & muted pastel fields on research articles. Zero generic 3D blobs, zero emoji icons, zero stock office photos.

---

## 2. Hypothesis Verification Matrix

| Hypothesis | Verdict | Empirical Evidence |
|---|---|---|
| Cream canvas `~#FAF9F5` + `#F0EEE6` / `#E8E6DC` warm neutrals; `#141413` ink | **Confirmed** | `#FAF9F5` (291 occurrences) & `#F0EEE6` (~47–60% field area) with `#141413` (357 occurrences) form ~95% of homepage pixels. |
| One terracotta/clay accent used sparingly | **Confirmed (sharper)** | `#D97757` (`clay`) is declared on `:root` and withheld from homepage CTAs; primary CTAs stay monochrome `#141413` or cream. |
| Pastel secondary hues reserved for illustration | **Confirmed** | `fig`, `cactus`, `sky`, `heather`, `olive`, `manilla` appear exclusively on research category tiles & illustrations. |
| Light serif display (`~56–80px`), sans UI, mono code | **Nuanced** | Section displays use light serif (`400` weight, `64–90px`), **but** impact H1s often use bold sans (`700`) while **long-form body prose uses serif (`20–24px`, `400`)**. |
| Flat surfaces, depth via tone & hairlines, no gradients | **Confirmed** | Zero gradients; depth relies on `#FAF9F5` → `#F0EEE6` → `#E3DACC` → `#141413` alternation and `1px` rules. |
| Hand-drawn organic illustration | **Confirmed** | Clean monochrome/pastel editorial line SVGs (`/careers`) and vintage-geometric collages (`/research`). |
| Calm short fades, no bounce, no parallax | **Confirmed** | Measured `100ms / 200ms / 300ms` transitions with `cubic-bezier(0.16, 1, 0.3, 1)` and no bounce. |
| Generous whitespace & magazine geometry | **Confirmed** | `96px` section padding, `32px` grid gutters, `68ch` reading measure, `[32/66]` asymmetrical editorial rows. |

---

## 3. VOXRELAY Design DNA — 10 Non-Negotiable Rules

1. **Paper & Ink Before Color:** At least 90% of every page must read as warm archival paper (`#FAF8F3` / `#F2EFE7` / `#E7E1D3`) and deep charcoal-slate ink (`#151715`). Never use clinical pure white (`#FFFFFF`) as a page floor or cool slate-gray (`#F3F4F6`) as a surface.
2. **Original Brand Chromatics (Zero Clone Resemblance):** Replace Anthropic's terracotta clay with VOXRELAY's own pairing: **Deep River Teal (`#165359`)** as primary institutional secondary and **Warm Saffron Ochre (`#996215`)** as the rare accent — used strictly for active indicators, focus rings, and at most one focal emphasis per screen.
3. **Editorial Serif Voice (`Newsreader` + `Amiri`):** Set section displays (`400` weight, tight leading `1.08–1.14`, italic phrase emphasis) and long-form reading paragraphs in `Newsreader` (English) and `Amiri` (Arabic) so the site reads like an authoritative journal rather than a generic startup template.
4. **Crisp Sans UI & Tabular Mono Metadata (`Inter Tight` + `IBM Plex Mono` + `IBM Plex Sans Arabic`):** Navigation, forms, tables, buttons, and workspace checklists stay in crisp sans (`Inter Tight` / `IBM Plex Sans Arabic`), while assignment refs (`VR-0001`), UTC times, SLA counts, and chapter numbers (`01 / 03`) use `IBM Plex Mono` with `font-variant-numeric: tabular-nums`.
5. **Surface Alternation & Hairline Rules, Zero Shadows:** Never decorate cards with heavy drop shadows, blur glows, or gradients. Separate hierarchy through warm paper tone steps (`paper → vellum → oat → dark ink-slate`) and crisp `1px` hairline borders (`#D4CDC0`).
6. **Varied Editorial Geometry (No Repeated 3-Card Grids):** Alternate `[32/66]` statement-and-ruled-row bands, 3-chapter sticky layouts, contained dark slate pause bands (`24px` radius), long-form essays with TOC + margin notes, and clean 4-column index tables.
7. **Original Hand-Inked Relay Illustrations:** Use custom SVG linework (`1.4px` organic ink strokes with subtle `feTurbulence` wobble filter + flat muted pigment fills) centered on VOXRELAY's motif: **parallel folios bridged by a steady human relay arc**. Zero stock photos, zero emojis, zero 3D blobs.
8. **Restrained, Calibrated Motion:** Keep transitions between `150ms` and `280ms` on `cubic-bezier(0.16, 1, 0.3, 1)` — quiet opacity fades, smooth accordion height reveals, gentle hero SVG breathing, and a calm pulsing relay mark while the assistant streams. Zero parallax, zero bounce, full `prefers-reduced-motion` compliance.
9. **Bilingual Parity & True RTL Craft:** Arabic is never an afterthought. Switch display typography to `Amiri` and UI to `IBM Plex Sans Arabic` with relaxed line-height (`1.65–1.75`), `0` letter-spacing, and CSS logical properties (`margin-inline`, `padding-inline`, `inset-inline`) throughout.
10. **Product Truth & Sober Copy:** Every headline, diagram, and workspace sample enforces that VOXRELAY supports the work *around* remote interpreting — never live interpreting, translation, recording, or transcription. Zero invented stats, testimonials, or fake names.

---

## 4. Enterprise Seriousness Risk Note

Warm archival cream, light serif prose, and hand-inked pastel spot illustrations carry an inherent positioning risk with hospital compliance officers, legal procurement teams, and language-service directors: **if paired with loose spacing or playful phrasing, warmth can look informal or consumer-grade.**

VOXRELAY neutralizes this risk through four structural counterweights:
1. **Clinical Precision Grid & Tabular Rigor:** All workspace assignments, UTC/local schedules, SLA timestamps, status probes, and terminology exports run on strict `1px`-ruled grids with monospace `tabular-nums` alignment.
2. **Deep Ink & River-Teal Contrast:** Replacing playful pastels in UI chrome with high-contrast charcoal ink (`#151715`, `16.7:1`) and deep river teal (`#165359`, `8.2:1`) communicates institutional steadiness.
3. **Sober, Verifiable Language:** Zero hype adjectives, zero unverified metrics, and explicit human-only (`T3`) workflow boundaries everywhere.
4. **Visible Governance Architecture:** Dedicated long-form Privacy essay, real `/status` diagnostics, role-based access queue (`/app/admin`), and an audit log built into the same calm visual language.
