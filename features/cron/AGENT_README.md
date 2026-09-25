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

**GitHub Actions jobs are started by Vercel's clock, and watched.** GitHub's own schedule
starts this repo's jobs 4.5 to 5.5 hours late and drops the slots that fall due meanwhile
(since its 2026-08-26 incident; an hourly cron still ran four times a day), so
`/api/cron/start-github-jobs` starts the UX verifier every hour and probe guard, survey DB
sync, health monitor and the digest audit in their morning hours, through
`workflow_dispatch` with `GITHUB_DISPATCH_TOKEN` (`server/github-jobs.ts` says when). Those
workflows have no `schedule:`, so GitHub cannot start late duplicates. The verifier and the
audit record the clock's runs with `scripts/record-cron-run.mjs <name>` (their `on_time`
input), and `server/cron-stall.ts` alerts #ops when one goes quiet: 3 h and 26 h, plus 3 h
for the clock itself. A start GitHub refuses is an error log, which reaches #prod-alerts.
The stall test counts a GitHub job only if it is scheduled (by GitHub or the clock) and
records under that name. For a job in GitHub Actions the alert names its workflow
(`GITHUB_WORKFLOW`), because the fix is usually to start it by hand, not to debug it. The
brain's jobs still use GitHub's schedule, timed to land after its delay.

**Belongs:** cron job handlers + their tests.

**Does NOT belong:**

- Email templates (invite reminders → `features/invite/emails/`; report-related → `features/report/server/emails/`).
- Stripe webhook (that's event-driven, not cron — `features/checkout/server/`).
