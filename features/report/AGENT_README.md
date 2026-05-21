# features/report

**Purpose:** Personalized report rendering at `/report` + `/report/[token]`. Section-based reveal gated by purchase plan (`essentials` | `full_report` | `all_reports`).

**Entry:**

- `ui/ReportPage.tsx` — orchestrator.
- `ui/ReportSection.tsx`, `ui/sections/*` — section components (Welcome, CoreArchetype, Dimension, AttachmentPatterns, PracticeTendencies, etc.).
- `ui/ReportPricingModal.tsx` — paywall modal.
- `ui/ShareReportModal.tsx`, `ui/SharedViewerBanner.tsx`, `ui/ShareVerifyGate.tsx` — share flow.
- `ui/hooks/` — `useReportData`, `useSectionFeedback`, `useReportShares`, `useReportEngagementTimers`.
- `server/personalReport.ts` — personalization composer.
- `server/access.ts`, `server/planAccess.ts`, `server/shareAccess.ts`, `server/shareVerify.ts` — paywall + share access gates.
- `server/archetypeSlug.ts` — URL slug ↔ archetype name (includes legacy alias map for V8 renames).
- `server/contentGating.ts` — essentials/full/all gating logic.
- `server/emails/` — report-related email templates (essentials/full/all, share, discount + A/B variants).
- API routes inline: `app/api/report/route.ts`, `app/api/report/share/*`, `app/api/report-feedback/route.ts`.

**Belongs:** report rendering, plan-based gating, share verification, personalization.

**Does NOT belong:**

- Stripe / checkout (use `features/checkout/`).
- Pricing math (use `features/pricing/`).
- Scoring engine (use `features/scoring/`).

**Related:**

- Generated `data/report-*.ts` files (archetypes, general, practice-tendencies, summary) — regenerated via `scripts/regenerate-archetypes.js`, `scripts/convert-report-content.js`, `scripts/convert-summary-docx.js`, `scripts/generate-practice-tendencies.js`.
- Legacy archetype-slug aliases live in `server/archetypeSlug.ts` to keep old report URLs resolving after V9 rename.
