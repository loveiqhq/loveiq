# features/ux-signals

**Purpose:** the UX checker Eman asked for on 2026-09-30. It covers Marcus's 22 behaviour
signals (Slack #all-loveiq, 2026-09-15), from time to first action through conversion
blockers.

- Each signal is measured on real production visits.
- A signal is shown only once its measure has been proven right on the nightly proof walks.
- Jarvis serves it as `ux_signals`.

**How a signal earns being shown:**

1. **One measure, two kinds of visit.** `logic/signals.ts` computes each signal from the
   events `track()` sends.
   - For a real visit, the events come from PostHog (`server/posthog-visits.ts`, production
     sessions only). Our own probes are kept out of PostHog by `instrumentation-client.ts`.
   - For a proof walk, they come from the same `track()` calls, heard in the walk's own
     browser through `window.__loveiqEventTap`.
2. **The walk knows the truth.**
   - A proof walk (`scripts/walkers/walk.ts --proof`) runs production's code on staging's
     database, at `loveiq-staging-git-main-loveiq.vercel.app`.
   - It plants behaviours on purpose (`scripts/walkers/plants.ts`): going back in the
     survey, tapping a disabled button, pausing, rage-tapping, jumping chapters, closing
     the paywall one of four ways, or leaving early.
   - It records what it did. A test checks that each truth rule means exactly what its
     measure means (`__tests__/scripts/proof-walks.test.ts`, "on events that are right").
3. **Proof** (`logic/proof.ts`).
   - `check-signals.ts` stores each walk's events and truth in `ux_walk_record`.
   - On every read, the measure is run again over the last 28 days of walks. A walk run
     twice in one UTC day counts once (the newest run), because its plants come from the day
     and the second run repeats the first.
   - A signal is shown only when it is right on at least 80% of at least 10 walks.
   - For a signal where most visits show nothing, it must be right on both the walks where
     the behaviour happened and those where it did not. Otherwise a measure that always
     says "nothing" would pass.

**A measure that reads a new event** must say when that event reached production, as
`recordedSince` in `logic/signals.ts`. Real visits begun before then are left out, and the
finding says so. Without it, every older visit reads as not doing what the event records:
before `cta_seen` existed, every locked report read "not seen". Only CTA visibility needs it
so far. Every other signal's events and properties have been recorded since 2026-08-28.

**Entry:** `server/report.ts` (`buildUxSignalsReport`, `renderUxSignals`), called by
`app/api/mcp/route.ts` for `ux_signals`.

**Found while building it, 2026-10-01:**

- Our probes counted as visitors in PostHog. So did their replays, which the UX scanners
  review. They are kept out now.
- A tap outside the paywall never closed it: the viewport covered the backdrop. Fixed in
  `features/report/ui/ReportPricingModal.tsx`.
- On a phone the sticky unlock bar sat over the open chapter list, so its last chapters
  could not be tapped (a proof walk could not reach "Summary"). The list is above the bar
  now (`features/report/ui/report.css`, pinned by `features/report/tests/stacking.test.ts`).
- `locked_card_price_shown` fires when a locked report loads, wherever the card sits. It
  cannot say an offer was seen, so `cta_seen` does (`features/analytics/useCtaSeen.ts`).

**Belongs:** the 22 measures, the proof, the PostHog read, the report.

**Does NOT belong:** the walks themselves (`scripts/walkers/`), the model-judged findings
(`features/ux-review/`, and the walks' judge), or the Postgres friction scoreboard
(`features/admin/server/friction-metrics.ts`).
