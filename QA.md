# VOXRELAY QA Report (v7.0)

## Visual & Design Parity
- Header: terracotta `#DE4E26` circular waveform logo + `VOXRELAY`, `How it works`, `For interpreters`, `For organizations`, `Trust`, `العربية`/`EN`, `Sign in`, `#112A24` `Start free` pill.
- Homepage: exact match across all 7 attached reference bands (`#F8F4EC`, `#DE4E26`, `#F2B632`, `#184D42`, `#112A24`, `#96B5AA`) with `Instrument Serif` + `Instrument Sans` + Arabic RTL support.
- Public pages omit floating Assistant launcher; `/faq` renders populated `KB-01`..`KB-06` rows.

## Checks
- `npm test` (9 suites)
- `npm run lint`
- `npm run build`
- Live HTTP checks against `0.0.0.0:5173`
