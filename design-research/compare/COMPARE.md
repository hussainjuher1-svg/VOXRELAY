# VOXRELAY Enterprise Cool-Slate Design Review

## Implemented Enterprise System (`v3.0`)

1. **Color Discipline:** Replaced warm beige/cream surfaces with Cool Slate (`#F8FAFC`), crisp white data/card surfaces (`#FFFFFF`), Carbon Navy navigation/boundary bands (`#0B0F19`), Enterprise Cobalt primary actions (`#2563EB`), and crisp `#E2E8F0` / `#CBD5E1` hairlines.
2. **Typography & Zero-Italic Rule:** Strictly upright `Inter Tight` (EN), `IBM Plex Sans Arabic` (AR), and `IBM Plex Mono` (`tabular-nums` for IDs, specs, durations). Serif and italic styles are completely removed (`font-style: normal` across all selectors).
3. **Sharp Geometry:** Standardized radii to `4px` / `6px` / `8px` (`--radius-sm` / `--radius-md` / `--radius-lg`), replacing `999px` pill bloat.
4. **Grounded Content & Layout Integrity:**
   - Fixed `KB-01..KB-03` card field mapping (`entry.title[locale]`, `entry.summary[locale]`, `entry.href`) so every specification card and FAQ row renders full bilingual content.
   - Replaced marketing placeholder rows in the interactive workspace preview with explicit `.ics` field-sanitization rules (`start_at`, `duration_min`, discarded `summary`).
   - Docked `AssistantTrigger` directly into the header (`PublicShell.tsx`) and Carbon sidebar (`AppShell.tsx`), eliminating the floating bottom-right launcher that overlapped footer text.
