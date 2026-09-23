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

**Belongs:** cron job handlers + their tests.

**Does NOT belong:**

- Email templates (invite reminders → `features/invite/emails/`; report-related → `features/report/server/emails/`).
- Stripe webhook (that's event-driven, not cron — `features/checkout/server/`).
