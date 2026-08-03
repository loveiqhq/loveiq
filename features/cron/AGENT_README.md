# features/cron

**Purpose:** Scheduled background jobs. Run by Vercel Cron with bearer-token auth (`CRON_SECRET`).

**Entry:** Routes inline at `app/api/cron/<job>/route.ts` (13 jobs: invite-reminders, survey-paused, nurture-sequence, chapter-nudge, payment-fulfillment-sweep, deep-engagement-alert, anomaly-watcher, security-storm-detector, funnel-digest, product-digest, tech-digest, table-size-digest, purge-old-data). Tests in `tests/`.

**Belongs:** cron job handlers + their tests.

**Does NOT belong:**

- Email templates (invite reminders → `features/invite/emails/`; report-related → `features/report/server/emails/`).
- Stripe webhook (that's event-driven, not cron — `features/checkout/server/`).
