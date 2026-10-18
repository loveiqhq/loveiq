# Pay to start: runbook

The pay-first journey on `/sexual-archetype`: a visitor pays for the survey and the full report,
takes the survey, and the report opens unlocked. How it works is in
`features/pay-to-start/AGENT_README.md`; this page is what to do with it.

## Pause it, or switch it back on

Admin panel → System flags → `pay_to_start_checkout`. Off: every button on the page answers
"Checkout is paused for a moment" and nothing is charged; the page stays up, so an ad keeps
landing somewhere. A checkout already open at Stripe can still be paid and is honoured.

The page also refuses to sell while the survey is closed or `survey_submissions` is off.

## Change the price

1. Set `PAY_TO_START_PRICE_CENTS` on the Vercel project (cents, 500 to 9900; 2900 is EUR 29).
   A value outside the range is ignored (EUR 29 is charged) and alerts #ops
   (`pts_price_setting_invalid`).
2. Redeploy: Vercel applies an environment change to new deployments only.
3. The ad's copy must say the same price (the search ad names it).

Every price on the page, Stripe's line item and the confirmation email follow the setting. A
visitor with the page open from before the change gets a reload on their next click, never the
old price. Each entitlement records the price it was sold at (`list_price_cents`), so a price
test is read per price.

## Test it

- **Locally**: `vercel env pull` the staging project's environment into `.env.local` (never
  production's), then `stripe listen --forward-to localhost:<port>/api/stripe/webhook` and use
  the printed `whsec_...`. Pay with `4242 4242 4242 4242`; 3-D Secure with
  `4000 0025 0000 3155`; a dispute with `4000 0000 0000 0259`.
- **Use an `@loveiq.org` email** at Stripe: staging sends real email and Slack, and a team
  address marks the payment `is_test`, so it never reaches GA4, Ads or the numbers.
- **What to check after a test payment**: the `prepaid_report_access` row (succeeded, then
  `consumed_submission_id`, then `payment_id`), the `payment` row (`metadata.journey`), the
  confirmation email and its link, the 4-slide wizard, the report fully unlocked.

## A buyer who paid but cannot get in

Most of the time the link in our confirmation email ("Start my survey") is the answer: it
opens the survey on any device, or their report once they have one.

If the email is lost, find their row by the address Stripe took:

```sql
select id, status, prepaid_token, consumed_submission_id, payment_id, paid_at
from prepaid_report_access
where customer_email = '<their email>' and offer is not null
order by created_at desc;
```

- `succeeded`, not consumed: send **only to that address**
  `https://www.loveiq.org/sexual-archetype/continue?t=<prepaid_token>`. The token opens a paid
  survey; never paste it anywhere else.
- `succeeded` and consumed: their report is the one the submission's token opens.
- `pending` for more than an hour: the payment never completed at Stripe (or settles later);
  the hourly sweep asks Stripe about every pending checkout under 48 hours old.

## Refunds and disputes

Refund in the Stripe dashboard as usual. The webhook does the rest: before the survey the
entitlement turns `refunded` and stops unlocking; after it, the report is re-locked like any
refunded purchase. A dispute behaves the same way while open, and a won dispute restores
access. #ops gets a `pts_refund` line.

Someone who paid twice (two tabs, a lost cookie): #ops `pts_double_payment`. Refund the second
payment; either entitlement works on its own.

## Alerts

| Channel   | Kind                           | Means                                                                   |
| --------- | ------------------------------ | ----------------------------------------------------------------------- |
| #payments | `pts_paid`                     | A payment confirmed (survey not taken yet)                              |
| #payments | `pts_claimed`                  | The survey claimed it; the report is unlocked                           |
| #ops      | `pts_checkout_failure`         | Opening checkout failed: visitors may be unable to pay                  |
| #ops      | `pts_price_setting_invalid`    | `PAY_TO_START_PRICE_CENTS` is out of range; EUR 29 is charged           |
| #ops      | `pts_paid_without_entitlement` | Stripe says paid, but no row matches: find the buyer, attach by hand    |
| #ops      | `pts_second_paid_session`      | A second paid session for one entitlement: refund one                   |
| #ops      | `pts_double_payment`           | The same address paid twice within 48 hours                             |
| #ops      | `pts_claim_failed`             | A survey's claim errored: check the row (a bound one the sweep retries) |
| #ops      | `pts_apply_failed`             | Claimed but the report did not unlock: the sweep retries every run      |
| #ops      | `pts_async_payment_failed`     | A delayed payment failed after a survey had claimed it                  |
| #ops      | `pts_refund`                   | A refund or dispute reached an entitlement before or after its claim    |

## Before the first ad

- `supabase/migrations/20261018120000_pay_to_start_entitlement.sql` applied to the database
  the deployment uses (staging first, `docs/runbooks/STAGING_DATABASE.md`; production with
  its ledger row before the main deployment).
- Stripe → Settings → Public details: a Terms of Service URL, in test and in live mode. The
  checkout requires the terms checkbox and cannot open without it.
- The price setting matches the ad.
- The SQL readouts checked against a staging purchase with Eman, so none counts the journey
  in a landing or pricing arm.
- Marcus's copy flags answered (questions count, minutes, chapters).
