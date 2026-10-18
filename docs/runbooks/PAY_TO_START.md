# Pay to start: runbook

The pay-first journey on `/sexual-archetype`: a visitor pays for the survey and the full report,
takes the survey, and the report opens unlocked. How it works is in
`features/pay-to-start/AGENT_README.md`; this page is what to do with it.

## Pause it, or switch it back on

The `pay_to_start_checkout` system flag. There is no screen for it: `PATCH
/api/admin/system-flags` with an admin session, as `docs/runbooks/DISASTER_RECOVERY.md` §3
shows, with `{"key":"pay_to_start_checkout","enabled":false}`. Off: every button on the page
answers "Checkout is paused for a moment" and nothing is charged; the page stays up, so an ad
keeps landing somewhere. A checkout already open at Stripe can still be paid and is honoured.

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

- **Staging's webhook first.** Every test-mode event, from any machine or preview, goes to
  `staging.loveiq.org/api/stripe/webhook` (the only enabled test-mode endpoint). Code without
  this journey throws on its sessions, completed or merely expired, and posts "webhook
  processing failed" to #ops on every retry. So the `staging` branch must carry this code,
  and staging's database its migrations, before any test checkout.
- **Locally**: `vercel env pull` the staging project's environment (never production's), point
  the Slack webhooks and `RESEND_BASE_URL` at a local capture if you want to read what would be
  sent, and pay with `4242 4242 4242 4242`; 3-D Secure with `4000 0025 0000 3155`; a dispute
  with `4000 0000 0000 0259`. Use Chrome: Safari refuses the `Secure` `__Host-` cookies a
  local production build sets over http.
- **Use an `@loveiq.org` email** at Stripe: staging sends real email and Slack, and a team
  address marks the payment `is_test`, so it never reaches GA4, Ads or the numbers.
- **What to check after a test payment**: the `prepaid_report_access` row (succeeded, then
  `consumed_submission_id`, then `payment_id`), the `payment` row (`metadata.journey`), the
  confirmation email and its link, the 4-slide wizard, the report fully unlocked.

## A buyer who paid but cannot get in

Most of the time the link in our confirmation email is the answer: it opens the survey on any
device, or their report once they have one, when the survey was taken under the address they
paid with. Someone else's survey (a gift, a shared browser) never opens through it: the survey
taker has their own report link in the report email.

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
- `pending` for more than an hour: the payment never completed at Stripe (a checkout closes
  after an hour), or a delayed method still settles; the sweep (twice an hour) asks Stripe
  about checkouts pending under 48 hours, the 25 waiting longest each run.
- `pending` with a `consumed_submission_id`: they left checkout and took the survey. The
  checkout they left open still unlocks that report if they pay it within its hour; after
  that, their report's own paywall sells it, and a purchase from the page is a new one.

## Refunds and disputes

Refund in the Stripe dashboard as usual. The webhook does the rest. Before the survey: a full
refund turns the entitlement `refunded` and it stops unlocking (#ops `pts_refund`); a partial
refund keeps it working, as it keeps a report purchase unlocked. A payment refunded before
anything confirmed it is never unlocked: the confirmation turns it `refunded`. After the
survey: the report is re-locked like any refunded purchase (#ops `stripe_refund`). A dispute
opened voids it (`stripe_dispute_opened`); one won restores it (`stripe_dispute_resolved`).

Someone who paid twice (two tabs, a lost cookie): #ops `pts_double_payment`. Refund the second
payment; either entitlement works on its own.

## Alerts

| Channel   | Kind                           | Means                                                                       |
| --------- | ------------------------------ | --------------------------------------------------------------------------- |
| #payments | `pts_paid`                     | A payment confirmed (the line says whether the survey is done yet)          |
| #payments | `pts_claimed`                  | The survey claimed it; the report is unlocked                               |
| #ops      | `pts_checkout_failure`         | Opening checkout failed: visitors may be unable to pay                      |
| #ops      | `pts_confirmation_failed`      | A buyer's confirmation email did not go: send their continue link (above)   |
| #ops      | `pts_price_setting_invalid`    | `PAY_TO_START_PRICE_CENTS` is out of range; EUR 29 is charged               |
| #ops      | `pts_paid_without_entitlement` | Stripe says paid, but no row matches: find the buyer, attach by hand        |
| #ops      | `pts_second_paid_session`      | A second paid session for one entitlement: refund one                       |
| #ops      | `pts_double_payment`           | The same address paid twice within 48 hours                                 |
| #ops      | `pts_claim_failed`             | A survey's claim errored: check the row (a bound one the sweep retries)     |
| #ops      | `pts_apply_failed`             | Claimed but the report did not unlock: the sweep retries every run          |
| #ops      | `pts_async_payment_failed`     | A delayed payment failed (and whether a survey had claimed it)              |
| #ops      | `pts_refund`                   | A refund reached an entitlement before any survey claimed it                |
| #ops      | `stripe_dispute_opened`        | A dispute opened (before a claim, the entitlement stops unlocking)          |
| #ops      | `stripe_dispute_resolved`      | A dispute closed: won restores the entitlement or the report, lost stays so |

## Before the first ad

- Both migrations applied, staging first (`docs/runbooks/STAGING_DATABASE.md`), production with
  their ledger rows before the main deployment:
  `supabase/migrations/20261018120000_pay_to_start_entitlement.sql` and
  `supabase/migrations/20261018130000_pay_to_start_out_of_free_funnel_readouts.sql`.
- The `staging` branch carries this code (see "Staging's webhook first" above).
- Stripe → Settings → Public details: a Terms of Service URL, in test and in live mode. The
  checkout requires the terms checkbox and cannot open without it.
- The price setting matches the ad.
- A decision on how the numbers show this journey. The digests leave its visits and survey
  views out of the free funnel's, and its buyers out of the arms and the price test, but keep
  its finishers, payments and revenue in their totals, so their rates per visit read high
  while the page sells. AP-Analytics, Jarvis and the KPI week count all of it, visits too.
- Marcus's copy flags answered (questions count, minutes, chapters).
