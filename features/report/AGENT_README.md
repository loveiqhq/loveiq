# features/report

**Purpose:** Personalized report rendering at `/report` + `/report/[token]`. Section-based reveal gated by purchase plan (`essentials` | `full_report` | `core` | `all_reports`).

**Report 3.0 (V4) is what every reader gets** since it launched (2026-10-06): Report 2.0's
section components with the redesigned ones in `ui/v3/` swapped in. The older versions stay
reachable by name: V1, the pre-2.0 report and the default until then, at `?v4=0`, and
Report 2.0 at `?v2=1`. The switches are `isV4` and `showReportV2` in `ui/ReportPage.tsx`;
the header comment in `ui/v1/ReportExperienceV1.tsx` says why V1 was restored on
2026-09-12 and what was deliberately left behind (the forced paywall and the urgency
countdown).

**Entry:**

- `ui/ReportPage.tsx` — the shell: data fetch, modals, checkout, analytics, paywall
  trigger. Shared by both versions, and picks which one renders.
- `ui/v1/` — the restored pre-2.0 report (`?v4=0`): `ReportExperienceV1.tsx`,
  its own sidebar and mobile nav, and `v1/sections/*` for the components whose props
  Report 2.0 rewrote.
- `ui/ReportSection.tsx`, `ui/sections/*` — Report 2.0 sections, reached at `?v2=1`.
  `ui/reportNav.ts` holds its part order and the section ids it retired.
- `ui/report.css` — the whole report stylesheet, split out of `app/globals.css` by
  `5faa2a2c`. Carries BOTH versions' rules; also imported by `app/practice-preview`.
- `ui/reportPlaceholders.ts` — `{{USER_NAME}}`-style substitution, shared by both.
- `ui/ReportPricingModal.tsx` + `ui/paygate.css` — the Pricing 3.0 paygate (Figma 842:584 phone, 963:6 desktop).
- `ui/unlockAnchor.ts` — returns a buyer to the spot they paid from, through Stripe's success and cancel URLs.
- `ui/ShareReportModal.tsx`, `ui/SharedViewerBanner.tsx`, `ui/ShareVerifyGate.tsx` — share flow.
- `ui/hooks/` — `useReportData`, `useSectionFeedback` (a thumb saves the rating at once; the
  message is optional), `useReportShares`, `useReportEngagementTimers`, `useRevealOnView` (2.0's
  chart reveals) and `useChapterOpen` (false while a V4 chapter is closed or still opening, so
  the reveals inside wait for it).
- `feedbackSections.ts` — the section ids `app/api/report-feedback/route.ts` accepts: the
  report's sections plus the ids only the page rates.
- `server/personalReport.ts` — personalization composer.
- `server/access.ts`, `server/planAccess.ts`, `server/shareAccess.ts`, `server/shareVerify.ts` — paywall + share access gates.
- `server/archetypeSlug.ts` — URL slug ↔ archetype name (includes legacy alias map for V8 renames).
- `server/contentGating.ts` — essentials/full/all gating logic.
- `server/emails/` — report-related email templates (essentials/full/all, share, discount + A/B variants).
- API routes inline: `app/api/report/route.ts`, `app/api/report/share/*`, `app/api/report-feedback/route.ts`.

**Report V4's chapter copy is paid copy, one record per archetype.** The four designed
chapters (Typical Beliefs, Accelerators & Brakes, Challenges in Partnerships, Fantasy vs.
Reality) live in `data/report3-typical-beliefs.ts`, `data/report3-accelerators.ts`,
`data/report3-partnership.ts` and `data/report3-fantasy.ts`. Each module's `build*` runs on the
server and hands the chapter down as props, already split at the paywall. Spark Seeker's copy is
hand-set in those modules from Figma.

Every other archetype's copy is in `data/report3-copy/<slug>.ts`, one file per archetype holding
all four chapters. They were transcribed from Sanjin's Google Docs on 2026-10-01; each file's
header lists its doc ids. `data/report3-copy/index.ts` merges the files in by display name.

- **Paywall cuts.** Each record's `cuts` are read off the docs' "Paywall" comments. A cut a record
  omits takes Spark Seeker's (Figma's).
- **Client imports.** The whole folder counts as paid:
  `__tests__/security/premium-content-bundle.test.ts` rejects a runtime import of any path under
  `@/data/report3-copy` from a client file. `import type` is fine.
- **Tests.**
  - `tests/v4CopyFiles0110.test.ts` checks each file on its own.
  - `tests/v4CopyArchetypes0110.test.ts` checks every archetype's merged chapters, and
    `tests/v4ChaptersRender0110.test.tsx` draws them.
  - `tests/sparkViewsPinned0110.test.ts` pins Spark Seeker's views byte for byte.

**Belongs:** report rendering, plan-based gating, share verification, personalization.

**Does NOT belong:**

- Stripe / checkout (use `features/checkout/`).
- Pricing math (use `features/pricing/`).
- Scoring engine (use `features/scoring/`).

**Related:**

- Generated `data/report-*.ts` files (archetypes, general, practice-tendencies, summary) — regenerated via `scripts/regenerate-archetypes.js`, `scripts/convert-report-content.js`, `scripts/convert-summary-docx.js`, `scripts/generate-practice-tendencies.js`.
- Legacy archetype-slug aliases live in `server/archetypeSlug.ts` to keep old report URLs resolving after V9 rename.
