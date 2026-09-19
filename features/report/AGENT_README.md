# features/report

**Purpose:** Personalized report rendering at `/report` + `/report/[token]`. Section-based reveal gated by purchase plan (`essentials` | `full_report` | `core` | `all_reports`).

**Two report versions ship side by side.** V1 — the pre-2.0 report — is what every
reader gets. Report 2.0 stays in the tree behind `?v2=1`, because the in-progress
Report 3.0 work (`ui/v3/`, staging only) is built on its section components. The
switch is `showReportV2` in `ui/ReportPage.tsx`; the header comment in
`ui/v1/ReportExperienceV1.tsx` says why the revert happened and what was
deliberately left behind (the forced paywall and the urgency countdown).

**Entry:**

- `ui/ReportPage.tsx` — the shell: data fetch, modals, checkout, analytics, paywall
  trigger. Shared by both versions, and picks which one renders.
- `ui/v1/` — the restored pre-2.0 report, and the default: `ReportExperienceV1.tsx`,
  its own sidebar and mobile nav, and `v1/sections/*` for the components whose props
  Report 2.0 rewrote.
- `ui/ReportSection.tsx`, `ui/sections/*` — Report 2.0 sections, reached at `?v2=1`.
  `ui/reportNav.ts` holds its part order and the section ids it retired.
- `ui/report.css` — the whole report stylesheet, split out of `app/globals.css` by
  `5faa2a2c`. Carries BOTH versions' rules; also imported by `app/practice-preview`.
- `ui/reportPlaceholders.ts` — `{{USER_NAME}}`-style substitution, shared by both.
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
