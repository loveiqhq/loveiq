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
- Checkout applies the resolved `stripePromotionCodeId` as `discounts:[]` when a
  code is owned; otherwise sets `allow_promotion_codes` (they're mutually exclusive).
- `resolveNurturePromo` also re-checks expiry app-side and requires stripeId +
  percentOff + non-expired. Returns null on any miss; never throws.

So: a leaked LIQ-100 cannot unlock an arbitrary report VIA THE auto-apply (?promo=)
path — verified 2026-06-01.

## 2026-06-10: manual promo entry re-enabled (L6 control reverted)

At the product owner's request, `allow_promotion_codes` on the checkout session was
flipped back from `false` to `true` (the no-promo / unresolved-promo branch), so
staff can hand-redeem test codes (e.g. a 100%-off code) on production — the original
pre-audit behaviour. **Residual risk accepted:** with the hosted manual-entry field
open, a forwarded single-use `LIQ-xx` code could be hand-typed by the wrong person
before the intended owner redeems it (bounded by `max_redemptions: 1` + 24h/14d
expiry). The per-submission ownership check still governs the auto-apply `?promo=`
link path; it no longer prevents manual entry. This intentionally re-opens audit
finding L6.

## post_call (100%-off) grant path

`app/api/admin/submissions/[id]/grant-call-coupon/route.ts`: full guard stack
(verifyAdminSession → hasRole "editor" → CSRF → rate-limit) + one-time 409 guard
(reads existing `nurturePromoCodes.post_call.code`, returns it instead of re-minting).
Coupon id from `STRIPE_COUPON_100`; 14-day expiry. logAdminAction records it.

## Calendly webhook — REMOVED 2026-09-14

The receiver (`app/api/calendly/webhook`), `features/booking/server/calendly.ts` and the
`calendly_webhook_event` table are gone (commit 782c35c5). It never recorded a booking:
it was registered against the apex `loveiq.org`, which 308-redirects to `www` and drops
the signature headers. Do not review or reintroduce it from an older copy. What remains
is `booking_event` (234 historical rows, read and erased by the GDPR paths in
`features/admin/server/data-subject.ts`) and `insertBookingEvent` in
`features/booking/server/events.ts`, written only by the admin post-call coupon grant.

## New tables RLS

`booking_event` (and, until its removal, `calendly_webhook_event`) `ENABLE ROW LEVEL SECURITY` +
`CREATE POLICY service_role_only USING (false)` — matches resend_webhook_event /
data_subject_request_log pattern exactly. `booking_event.raw` holds full Calendly
payload (PII: invitee email/name) — service-role-only at rest; NOT yet in the
(disabled) purge cron retention list — tracked under CLAUDE.md "Postponed / TODO".
