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
- `logic/paywallSelector.ts` — `FIRST_PAYWALL_SELECTOR`, where the page reports "paywall reached":
  the first chapter's "Unlock Full Chapter" wall, or the fold that holds it. Part II's Summary
  gate does not count (Fatih, 16.10).
- `logic/guidedTour.ts` + `ui/hooks/useGuidedTour.ts` + `ui/v3/V4GuidedTour.tsx` — the guided
  tour (see "The guided tour" below).
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
- `logic/initialUnlock.ts` — the initial unlock (€1.99, Marcus 19.10): a succeeded payment with
  the plan key `initial`. It is no plan and no tier. `getReportAccessPlanForSubmission` reports
  it as `initialUnlock`, and `/api/report` then opens the `summary` gate for the reader's own
  archetype: the Core Archetype card and the Summary in full, nothing else. The pay screens keep
  selling, with €10 off the full report. Preview it with `&plan=initial`.
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

**The slimmed report (2026-10-16).** Readers found V4 too long (Mark's PostHog review, 13.10), so
it says less. Copy follows Sanjin's four `Slimmed_*` Google Docs, layout the Figma section "Report -
Slimmed" (`1665:3278` in the Report 3.0 file), behaviour Mark's clickable prototype.

- **Part I and II.** Shorter welcome copy and one-line archetype descriptions. The archetype
  card's dimensions and the Summary are half-locked on the server (`data/report3-archetype-card.ts`,
  `data/report3-summary.ts`, both on the premium-content bundle guard), behind the Summary's gate.
- **Typical Beliefs, Accelerators & Brakes, Challenges in Partnerships.** A short universal
  opening, then sections whose heading rows fold them away (`ui/v3/V4Section.tsx`). Long copy
  shows six or seven lines under "Show all" (`ui/v3/V4Fold.tsx`). Where a locked reader's free
  copy ends, a few lines fade out into "Unlock Full Chapter" (`ui/v3/V4UnlockSample.tsx`, laid
  out by `ui/v3/V4Passage.tsx`) instead of a blurred passage and a card. The server sends that
  sample and nothing past it (`toSample` in `server/gatedCopy.ts`); the walls stay where each
  archetype's cuts put them. Fantasy vs. Reality is unchanged.
- **Chapters.** Core Insecurities, Confidence Level and Arousal Style are out of V4
  (`V4_REMOVED_CHAPTERS` in `ui/v3/reportV3Nav.ts`), and a V4 request is sent none of their copy.
  The chapter count the wizard and the premium card print is derived (`REPORT_V4_CHAPTER_COUNT`).
- **Reading time.** Every chapter head reads "Reading time: ~N min.", counted on the server from
  the chapter's full copy (`server/chapterReadingTimes.ts`: words over 225, rounded, the rate the
  designed articles' eyebrows were set at) and sent as `chapterReadingTimes`.
- **Analytics.** `report_viewed` and `report_chapter_stats` carry `report_layout: "v4_slim"`
  (`features/analytics/reportLayout.ts`).
- **Tests.** `tests/v4Slim1610.test.tsx`, `tests/v4SlimRoutes1610.test.ts`,
  `tests/v4SlimChapters1610.test.tsx` and `tests/chapterReadingTimes1610.test.tsx`.

**The guided tour (2026-10-17).** A click-through tour on a V4 report's first open in a browser
(Figma `1713:1071` › "Guided tour in context" `1755:1275`, Ready for Dev 16.10; behaviour from
Mark's prototype, tab "Guided tour"; Notion "Add the guided tooltip into the report").

- **Stops.** The chapter menu (the pill below 1280px, the sidebar from there, whose copy says "on
  the left"), Typical Beliefs' first "Show All", its chapter toggle, its "Try This" header and,
  for a reader who has not paid for the report on screen, the first locked chapter's lock
  (Power Orientation). Essentials buyers count as paid (Fatih, 17.10). Copy in
  `ui/v3/guidedTourContent.ts`, Title Case; what each stop points at in
  `ui/v3/guidedTourAnchors.ts`.
- **When.** Owners and previews, never a shared view, a probe (the persona walks' cookie) or a
  checkout return. It waits for any open window, the cookie banner's answer and its controls,
  and gives way to a reader who has already scrolled. Remembered once started in
  `localStorage["loveiq-report-tour-v1:<submission id>"]` (`guidedTourKey`), once per report so a
  reader meets it again on their next one; a preview's in `sessionStorage`, for the tab only.
  "Replay the Tour" ends the chapter menu, below its list (the walks count the list's rows).
- **While it runs.** A layer of its own on `<body>` (z-index 78, `ui/v3/guidedTour.css`) draws the
  dim with a hole and the bubble; the report under it is inert, without the shell's blur. The
  page is held without the body lock (which would stop the tour's own scrolling): the root's
  overflow, Lenis stopped, swipes cancelled. `shared/ui/guided-tour-state.ts` tells the
  scroll-driven signals the scrolling is the tour's: the plans pop-up trigger, the paywall ping,
  chapter time, `cta_seen`, scroll depth and Typical Beliefs' midline rows stand down without
  letting go, and the leave offer is off.
- **Analytics.** `tour_started`, `tour_step_viewed {n, id}`, `tour_back {to}`,
  `tour_skipped {at, source}`, `tour_completed` and `tour_replayed` go to PostHog; a first run's
  start and outcome, and each replay, are also stored (`analytics_event`, the submission
  timeline).
- **Tests.** `tests/guidedTour.test.ts`, `tests/guidedTourAnchors.test.ts`,
  `tests/V4GuidedTour.test.tsx`, `tests/hooks/useGuidedTour.test.tsx`, the tour block of
  `tests/ReportPage.test.tsx`, and `e2e/report-guided-tour.spec.ts`. The other report e2e specs
  start as a browser that has seen it (`mockReport` seeds the key).

**Belongs:** report rendering, plan-based gating, share verification, personalization.

**Does NOT belong:**

- Stripe / checkout (use `features/checkout/`).
- Pricing math (use `features/pricing/`).
- Scoring engine (use `features/scoring/`).

**Related:**

- Generated `data/report-*.ts` files (archetypes, general, practice-tendencies, summary) — regenerated via `scripts/regenerate-archetypes.js`, `scripts/convert-report-content.js`, `scripts/convert-summary-docx.js`, `scripts/generate-practice-tendencies.js`.
- Legacy archetype-slug aliases live in `server/archetypeSlug.ts` to keep old report URLs resolving after V9 rename.
