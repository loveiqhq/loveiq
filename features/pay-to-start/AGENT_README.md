# features/pay-to-start

Pay to start the survey (Notion "RFD > Pay to start survey", Figma Report-3.0 `1468:720`): a
visitor pays before the survey, takes it, and their report opens as the offer says. Two offers,
each with its own page (`logic/offer.ts`, Marcus 19.10):

- `full`, EUR 29.99 on `/sexual-archetype` ("Full Payments" `1741:3820`): the full report, fully
  unlocked.
- `pre`, EUR 1.99 on `/sexual-archetype/initial` ("Pre-Payments" `1741:5587`): the initial
  report, pre-unlocked. Its payment's plan is `initial` (`features/report/logic/initialUnlock.ts`):
  the Core Archetype card and Summary in full, and EUR 10 off the full report.

A separate, independent journey: its own pages, its own checkout, its own label in every
record, and no landing test arm.

## The journey

1. `/sexual-archetype` or `/sexual-archetype/initial` (`ui/landing/`): the assessment page,
   noindex, under the LoveIQ site's own header (LoveIQ-branded until the new brand is ready,
   Marcus 18.10). Every "Unlock …" button posts its page's offer to
   `POST /api/stripe/pay-to-start`.
2. The checkout route records a pending `prepaid_report_access` row (`server/entitlement.ts`)
   and sets its bearer token (`rpp_` + 32) in an httpOnly cookie (`__Host-liq_pp`, 30 days;
   production reads no other name), then sends the browser to Stripe Checkout, which closes
   an unpaid session after an hour. The session's metadata names the row (`entitlementId`),
   `journey: pay_to_start` and the visitor's anonymous PostHog id, never the token.
3. The payment is confirmed exactly once (`server/confirm.ts`), by whichever comes first: the
   webhook (`features/checkout/server/fulfillment.ts` routes on `metadata.journey`), the status
   page Stripe returns to (`/sexual-archetype/checkout`, with `&offer=pre` for the initial
   report, `ui/status/`), or the sweep (twice an
   hour, `server/sweep.ts`). The first confirmation sends our email with the continue link
   (`server/emails/confirmation.ts`, `/sexual-archetype/continue?t=`; "your report is
   unlocked" when the survey was finished first), #payments, and the purchase to GA4 and
   PostHog.
4. `/survey` sees the cookie (`app/survey/page.tsx`); its submit claims the entitlement
   (`server/claim.ts`): bind it to the submission (one payment, one report), then apply it
   (a payment row with the offer's plan, `metadata.journey` and `prepaid`; the full report's
   tier, none for `initial`). The reply says unlocked, and the reader gets the 4-slide wizard
   and their report.

## Rules that are easy to break

- **The price is one setting.** `PAY_TO_START_PRICE_CENTS` (`server/offer.ts`) feeds Stripe and
  every price on the full report's page; the page sends the price it showed and a mismatch is
  a 409. The initial report's EUR 1.99 is fixed in `logic/offer.ts`. No euro amount is written
  in `ui/**` (`tests/no-hardcoded-price.test.ts`).
- **A token is sold again only for its own offer.** A browser that paid either offer goes to
  its survey; an open session of the other offer is closed and a new row starts, so one
  browser never pays for both by accident.
- **Copy lives in `ui/landing/payToStartContent.ts`**, verbatim from Figma; where it disagrees
  with the product (57 questions, ~15 minutes, cut chapters) it is flagged, not changed. The
  initial report's page is the same page: what it says otherwise is `PTS_INITIAL`
  (`PTS_OFFER_COPY` picks per offer), where the lines its frames kept from the full report's,
  and that EUR 1.99 does not buy, are corrected and flagged. It has no "One price" band, so its
  one price card is `#price`: under the film below 1280, beside the column from there.
- **The header is the site's, pointed at this page's price.** `ui/landing/PtsHeader.tsx` mounts
  `WNavSection` with its button on `#price` (the One price section), never the free survey, and
  counts every press as `pts_nav_click`, never the landing test's `cta_click`. Its other links
  leave for the site's pages, whose "Start test now" is the free survey: `pts_nav_click` says how
  many go.
- **Fly-ins never hold back the way to pay.** The page reuses the landing's reveal
  (`animate-on-scroll` + `ScrollAnimator`, the hero `animate-on-load`; `PTS_REVEAL` in
  `ui/landing/ptsStyles.ts`), but never on or around a price, a checkout button, a status line,
  the price card or the sticky bar (`tests/landing.test.tsx` holds this). Under reduced motion
  the page has no fade at all (`.pts-page`, `app/globals.css`).
- **Never in a landing arm or the free funnel's numbers.** Visits are labelled
  `pay_to_start` (`proxy.ts`), so are a buyer's survey steps (`app/api/funnel-event`), the
  survey's tracker gets `journey` and no arm (`stampLandingArm(..., { arm: false })`). The
  experiment readouts leave claimed submissions out (`features/admin/server/experiment-readouts.ts`,
  and in SQL `pay_to_start_submission()`, 20261018130000), and the digests' visit counts and
  wizard funnels leave the page's visits and the 4-slide wizard out; its finishers, payments
  and revenue stay in the digests' totals. AP-Analytics, Jarvis and the KPI week still show
  the journey mixed in: how all of them should show it is an open decision.
- **A purchase never opens someone else's report.** The continue link and the checkout route
  open a used purchase's report only when the survey was taken under the address Stripe took
  (`server/reportLink.ts`); the status route never sends a report's address, because a
  checkout session id is no secret (it is the purchase's transaction id in GA4, Ads and
  PostHog). Its cookie handover is for a browser back without the cookie within two hours of
  paying (a wallet that finished elsewhere).
- **Side effects run on the first flip only** (`pending` → `succeeded`, PATCH with
  `return=representation`): a redelivered webhook or a second poll sends nothing again. If
  the function dies after the flip they are lost (at most once), never doubled.
- **Refunds and disputes**: before the claim a full refund or an opened dispute turns the row
  `refunded` and stops it unlocking (a partial refund keeps it working, as for a report
  purchase); a payment refunded before anything confirmed it is turned `refunded` at
  confirmation. After the claim, the payment row's refund re-locks the report as for any
  purchase, and the entitlement's status follows.
- **An unpaid claim clears the cookie.** A visitor who left checkout and then took the survey
  has their pending row bound to it: the checkout left open still unlocks that report if it
  is paid within its hour. A later purchase in that browser starts fresh, so it can never pay
  for that survey (a shared device, or a report already bought from its own paywall).

## Kill switch and runbook

The `pay_to_start_checkout` system flag pauses the checkout; the page stays up. There is no
screen for it: `PATCH /api/admin/system-flags` (`docs/runbooks/DISASTER_RECOVERY.md` §3).
Changing the price, refunds and attaching a payment by hand: `docs/runbooks/PAY_TO_START.md`.
