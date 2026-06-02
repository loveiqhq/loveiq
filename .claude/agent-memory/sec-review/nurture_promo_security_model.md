---
name: nurture-promo-security-model
description: How nurture/post-call promo codes (LIQ-50/75/100) are scoped per-user and why a leaked code can't unlock an arbitrary report
metadata:
  type: project
---

# Nurture + post-call promo code security model

The primary defence against a leaked `LIQ-(50|75|100)-XXXXXXXX` code is APP-LAYER
submission scoping, NOT Stripe-side restrictions.

**Why:** Stripe codes are minted with `max_redemptions: 1` + expiry, but NOT
customer-restricted (avoids a per-recipient Stripe Customer create). So the only
thing binding a code to its intended user is `resolveNurturePromo`.

**How it works:**

- Codes are stored on `report_price_quote.metadata.nurturePromoCodes[stage].code`
  for the ISSUING submission's full_report quote.
- `app/api/stripe/checkout-session/route.ts` calls `resolveNurturePromo({ reportToken, userCode })`
  — resolves submission from the CALLER's `reportToken`/`reportSessionId`, then
  looks for the code only among THAT submission's quotes. A code redeemed against
  a different report token misses → falls through to no-promo (never 400).
- Checkout applies the resolved `stripePromotionCodeId` as `discounts:[]` and sets
  `allow_promotion_codes` only when NO promo (they're mutually exclusive — manual
  code entry is OFF when a code is pre-applied, so a forwarded email code can't be
  typed into someone else's checkout).
- `resolveNurturePromo` also re-checks expiry app-side and requires stripeId +
  percentOff + non-expired. Returns null on any miss; never throws.

So: a leaked LIQ-100 cannot unlock an arbitrary report — verified 2026-06-01.

## post_call (100%-off) grant path

`app/api/admin/submissions/[id]/grant-call-coupon/route.ts`: full guard stack
(verifyAdminSession → hasRole "editor" → CSRF → rate-limit) + one-time 409 guard
(reads existing `nurturePromoCodes.post_call.code`, returns it instead of re-minting).
Coupon id from `STRIPE_COUPON_100`; 14-day expiry. logAdminAction records it.

## Calendly webhook

`features/booking/server/calendly.ts` `verifyCalendlySignature`: HMAC-SHA256 over
`${t}.${rawBody}`, header `t=,v1=`, 180s timestamp tolerance, length-check then
`timingSafeEqual`, fail-closed (401), 503 when `CALENDLY_WEBHOOK_SECRET` unset.
Reads rawBody via `request.text()` BEFORE JSON.parse (correct). No CSRF/rate-limit
by design (same posture as Stripe/Resend webhooks). Idempotency via
`calendly_webhook_event` UNIQUE(event_key), fails OPEN on Supabase error.

## New tables RLS

`booking_event` + `calendly_webhook_event` both `ENABLE ROW LEVEL SECURITY` +
`CREATE POLICY service_role_only USING (false)` — matches resend_webhook_event /
data_subject_request_log pattern exactly. `booking_event.raw` holds full Calendly
payload (PII: invitee email/name) — service-role-only at rest; NOT yet in the
(disabled) purge cron retention list — tracked under CLAUDE.md "Postponed / TODO".
