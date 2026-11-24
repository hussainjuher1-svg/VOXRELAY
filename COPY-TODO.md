# Copy & Legal Sign-Off Checklist (`COPY-TODO.md`)

Every claim currently rendered on VOXRELAY is grounded strictly in implemented code and architecture (`ARCHITECTURE.md`). The items below require legal, compliance, or executive confirmation before public commercial launch:

1. **Legal Entity & Governing Jurisdiction (`/privacy`, footer)**
   - Add official registered company name, physical mailing address, Data Protection Officer (DPO) / privacy contact email, and governing law jurisdiction.
2. **HIPAA / GDPR / Business Associate Agreement (BAA) Language (`/privacy`, `/organizations`)**
   - Current copy accurately states that VOXRELAY does not store patient identity, live audio, or transcripts, and lets operators omit protected health identifiers. Confirm with legal counsel whether to publish BAA availability or explicit non-PHI scope terms for US healthcare clinics.
3. **Support Response Targets (`/contact`, `/app/support`, `/status`)**
   - Current UI displays recorded SLA timestamps without promising specific commercial response hours (e.g., 4-hour vs. 24-hour SLA). Confirm finalized support tier response windows before publishing contractual SLAs.
4. **Data Retention & Subprocessor List (`/privacy`)**
   - Confirm final retention windows for access-request logs, email outbox records, and support ticket threads, and list production infrastructure subprocessors (hosting, Postgres, transactional email provider, optional AI provider).
5. **Commercial Plan Structure & Pricing (Optional future page)**
   - Deliberately omitted until per-seat / organization pricing tiers are approved. Do not publish placeholder pricing figures.
6. **Arabic Copy Professional Review (`src/locales/ar/common.json`)**
   - All public marketing, navigation, `/design`, `/faq`, `/privacy`, and assistant prompts are translated into natural Modern Standard Arabic with full RTL mirroring; schedule native domain-editor review for regional healthcare/legal phrasing prior to regional launch.
