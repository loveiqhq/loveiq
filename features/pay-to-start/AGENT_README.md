# features/pay-to-start

Pay to start the survey (Notion "RFD > Pay to start survey", Figma Report-3.0 "Pay to start >
Full Payments" `1741:3820`): a visitor pays for the survey and the full report on
`/sexual-archetype`, takes the survey, and their report opens fully unlocked. A separate,
independent journey: its own page, its own checkout, its own label in every record, and no
landing test arm.

## The journey

1. `/sexual-archetype` (`ui/landing/`): the assessment page, Facets-branded, noindex. Every
   "Unlock survey & report" posts to `POST /api/stripe/pay-to-start`.
2. The checkout route records a pending `prepaid_report_access` row (`server/entitlement.ts`)
   and sets its bearer token (`rpp_` + 32) in an httpOnly cookie (`__Host-liq_pp`, 30 days),
   then sends the browser to Stripe Checkout. The session's metadata names the row
   (`entitlementId`) and `journey: pay_to_start`, never the token.
3. The payment is confirmed exactly once (`server/confirm.ts`), by whichever comes first: the
   webhook (`features/checkout/server/fulfillment.ts` routes on `metadata.journey`), the status
   page Stripe returns to (`/sexual-archetype/checkout`, `ui/status/`), or the hourly sweep
   (`server/sweep.ts`). The first confirmation sends our email with the continue link
   (`server/emails/confirmation.ts`, `/sexual-archetype/continue?t=`), #payments, and the
   purchase to GA4 and PostHog.
4. `/survey` sees the cookie (`app/survey/page.tsx`), shows the 4-slide wizard, and its
   submit claims the entitlement (`server/claim.ts`): bind it to the submission (one payment,
   one report), then apply it (a `full_report` payment row with `metadata.journey` and
   `prepaid`, the tier). The report opens unlocked.

## Rules that are easy to break

- **The price is one setting.** `PAY_TO_START_PRICE_CENTS` (`server/offer.ts`) feeds Stripe and
  every price on the page; the page sends the price it showed and a mismatch is a 409. No
  euro amount is written in `ui/**` (`tests/no-hardcoded-price.test.ts`).
- **Copy lives in `ui/landing/payToStartContent.ts`**, verbatim from Figma; where it disagrees
  with the product (57 questions, ~15 minutes, cut chapters) it is flagged, not changed.
- **Never in a landing arm.** Visits are labelled `pay_to_start` (`proxy.ts`), the survey's
  tracker gets `journey` and no arm (`stampLandingArm(..., { arm: false })`), and the readouts
  leave claimed submissions out (`features/admin/server/experiment-readouts.ts`).
- **No token in Stripe, analytics or logs.** The status route hands the cookie to a browser
  that returns without it, for a paid unused entitlement under a week old; the session id is
  removed from the status page's address for that reason.
- **Side effects run on the first flip only** (`pending` → `succeeded`, PATCH with
  `return=representation`): a redelivered webhook or a second poll sends nothing again.
- **Refunds and disputes**: before the claim the row goes `refunded` and stops unlocking; after
  it, the payment row's refund re-locks the report as for any purchase.

## Kill switch and runbook

The `pay_to_start_checkout` system flag (admin panel) pauses the checkout; the page stays up.
Changing the price, refunds and attaching a payment by hand: `docs/runbooks/PAY_TO_START.md`.
