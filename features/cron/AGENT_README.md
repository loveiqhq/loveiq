# features/cron

**Purpose:** Scheduled background jobs. Run by Vercel Cron with bearer-token auth (`CRON_SECRET`).

**Entry:** Routes still inline at `app/api/cron/{invite-reminders,payment-fulfillment-sweep,report-discount-email,survey-paused}/route.ts`. Tests in `tests/`.

**Belongs:** cron job handlers + their tests.

**Does NOT belong:**

- Email templates (invite reminders → `features/invite/emails/`; report discount → `lib/emails/report-discount.ts` → `features/report/server/emails/` after Phase 3c).
- Stripe webhook (that's event-driven, not cron — `features/checkout/server/`).
