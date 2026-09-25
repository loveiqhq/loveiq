# features/cron

**Purpose:** Scheduled background jobs. Run by Vercel Cron with bearer-token auth (`CRON_SECRET`).

**Entry:** Routes inline at `app/api/cron/<job>/route.ts`. Tests in `tests/`.

**`vercel.json` is the source of truth for WHICH of them run** — a route on disk is not a
scheduled job, and the difference has hidden a dead job before. 28 routes exist; 22 are
scheduled:

- _Product & ops_ — invite-reminders, survey-paused, nurture-sequence,
  payment-fulfillment-sweep, anomaly-watcher, security-storm-detector, conversion-digest,
  funnel-digest, file-invoices, journey-backfill, ux-review
- _Company brain_ — brain-fast, brain-ingest, brain-drive, brain-gmail, brain-notion,
  brain-calendar, brain-mine, brain-brief, brain-clarity, brain-evidence, brain-reconcile

**Six routes exist but are NOT scheduled**, and none of them is a fault: `purge-old-data`
is deliberately off (see CLAUDE.md, "Postponed / TODO"), and `chapter-nudge`,
`deep-engagement-alert`, `product-digest`, `tech-digest` and `table-size-digest` were
retired without deleting the code. Check `vercel.json` before assuming one of these runs;
`cron_run` shows their last real execution was July 2026.

**GitHub Actions jobs are watched too, if they record their runs.** GitHub starts this
repo's scheduled runs 4.5 to 5.5 hours after their cron time and drops some (from
2026-09-14 the UX verifier ran 4-6 times a day on an 8-a-day cron; see
docs/runbooks/COMPANY_BRAIN.md for the measurement). A job that is never started cannot
report its own absence, so `ux-review-verify.yml` and `ux-digest-audit.yml` end with
`scripts/record-cron-run.mjs <name>` on scheduled runs, and `server/cron-stall.ts`
alerts #ops when one goes quiet (6 h and 26 h). The stall test counts a GitHub job only if its
workflow both has a schedule and records under that name. For a job GitHub starts, the
alert names its workflow (`GITHUB_WORKFLOW`), because the fix is usually to start it by
hand, not to debug it.

**Belongs:** cron job handlers + their tests.

**Does NOT belong:**

- Email templates (invite reminders → `features/invite/emails/`; report-related → `features/report/server/emails/`).
- Stripe webhook (that's event-driven, not cron — `features/checkout/server/`).
