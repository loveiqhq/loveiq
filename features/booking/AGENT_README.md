# features/booking

**Purpose:** Capture the off-site call funnel for the 78h "book a call" nurture stage — Calendly bookings/cancellations and the post-call coupon — into Supabase (`booking_event`).

**Entry:**

- `server/calendly.ts` — Calendly webhook signature verification, idempotency claim (`calendly_webhook_event`), recipient correlation (utm_content → submission, email fallback), and `booking_event` inserts.
- Webhook route inline at `app/api/calendly/webhook/route.ts` (signature-authed, like Stripe/Resend).
- Tests in `tests/`.

**Data:** `booking_event` rows — `call_invite_sent` (written by the nurture cron), `call_booked` / `call_canceled` (Calendly webhook), `call_coupon_sent` (admin grant action). All surface in the admin submission timeline.

**Belongs:** Calendly webhook handling, booking correlation, `booking_event` writes/types.

**Does NOT belong:**

- The 78h email template (`features/report/server/emails/nurture/`).
- Promo-code minting / checkout (`features/checkout/server/`).
- The nurture cron itself (`app/api/cron/nurture-sequence/`).
