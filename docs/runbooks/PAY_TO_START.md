# Pay to start: runbook

The pay-first journey, two offers on two pages (Marcus, 19.10): `/sexual-archetype` sells the
survey and the full report (EUR 29.99), `/sexual-archetype/initial` the survey and the initial
report (EUR 1.99: the Core Archetype in full, and EUR 10 off the full report). A visitor pays,
takes the survey, and the report opens unlocked or pre-unlocked. How it works is in
`features/pay-to-start/AGENT_README.md`; this page is what to do with it.

## Pause it, or switch it back on

The `pay_to_start_checkout` system flag. There is no screen for it: `PATCH
/api/admin/system-flags` with an admin session, as `docs/runbooks/DISASTER_RECOVERY.md` §3
shows, with `{"key":"pay_to_start_checkout","enabled":false}`. Off: every button on the page
answers "Checkout is paused for a moment" and nothing is charged; the page stays up, so an ad
keeps landing somewhere. A checkout already open at Stripe can still be paid and is honoured.

The page also refuses to sell while the survey is closed or `survey_submissions` is off.

## Change the price

1. Set `PAY_TO_START_PRICE_CENTS` on the Vercel project (cents, 500 to 9900; unset is 2999, EUR
   29.99). A value outside the range is ignored (EUR 29.99 is charged) and alerts #ops
   (`pts_price_setting_invalid`). The setting is the full report's: the initial report's EUR
   1.99 is below its range and fixed in `features/pay-to-start/logic/offer.ts`, a code change.
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
  `consumed_submission_id`, then `payment_id`), the `payment` row (`metadata.journey`, and
  `metadata.plan`: `full_report` or `initial`), the confirmation email and its link, the
  wizard (four slides; five, with the report map, for the initial report), the email after
  the survey ("Your full report is ready", or E06 "Your Core Archetype is unlocked" for the
  initial report), and the report: fully unlocked, or for the initial report the Core
  Archetype card and Summary open. Its pay screen shows the full report at EUR 29.99 for a
  team or EUR 0 test purchase: the EUR 10 credit comes only with a real, non-test EUR 1.99
  payment (then EUR 19.99, "EUR 10.00 credit applied"), so check that one in Stripe's test
  mode on staging with a non-team address.

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

A refund of the initial report takes its EUR 10 credit back with it. Refunded after the full
report it credited, #ops gets `credited_payment_refunded`: the reader keeps the full report for
EUR 10 less, and charging the difference is a person's call.

Someone who paid twice (two tabs, a lost cookie): #ops `pts_double_payment`. Refund the second
payment; either entitlement works on its own.

## Alerts

| Channel   | Kind                           | Means                                                                       |
| --------- | ------------------------------ | --------------------------------------------------------------------------- |
| #payments | `pts_paid`                     | A payment confirmed (the line says whether the survey is done yet)          |
| #payments | `pts_claimed`                  | The survey claimed it; the report is unlocked (or pre-unlocked)             |
| #ops      | `pts_checkout_failure`         | Opening checkout failed: visitors may be unable to pay                      |
| #ops      | `pts_confirmation_failed`      | A buyer's confirmation email did not go: send their continue link (above)   |
| #ops      | `pts_price_setting_invalid`    | `PAY_TO_START_PRICE_CENTS` is out of range; EUR 29.99 is charged            |
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
- The price setting matches the EUR 29.99 ad, and the EUR 1.99 ad lands on
  `/sexual-archetype/initial`.
- A decision on how the numbers show this journey. The digests leave its visits and survey
  views out of the free funnel's, and its buyers out of the arms and the price test, but keep
  its finishers, payments and revenue in their totals, so their rates per visit read high
  while the page sells. Jarvis and the KPI week count all of it, visits too; AP-Analytics
  leaves its visits out of the free funnel's pages and reads it on its own page (below).
- Marcus's copy flags answered (questions count, minutes, chapters).

## Reading it

AP-Analytics → Assessment A → Pay to start puts every funnel that sells the report side by
side: pay after the report, pay to start at EUR 29.99 and at EUR 1.99, and EUR 1.99 after the
survey (the pre-unlock gate, `docs/runbooks/PRE_UNLOCK.md`), with visit → paying customer,
revenue per visit and ROAS first. Each funnel's ads are Google Ads' spend on the page an ad
lands on (`landing_page_view`, by day). Each offer's visits are `funnel_event` rows labelled
`pay_to_start` with the page's `offer` (`full` or `pre`, migration `20261023150000`), written
from 23 Oct 2026; earlier visits to the two pages carry no offer, count in neither column, and
the page says how many (an offer that sold on such a day gets no rates per visit for that
range). A survey is pay to start's only when a completed purchase claimed it (a 100% code's
EUR 0 one too): a checkout opened and never paid is bound to the survey as well, and that
reader counts with the free funnels. "Paid
traffic only" reads the ad clicks as visits and a buyer as paid traffic when the purchase's
tracker (`prepaid_report_access.utm_tracker`) holds a Google Ads click.

The Dashboard's funnel comparison and the Landing page's pay-to-start table read the same
figures (`payToStartFor` in `features/admin/server/ap/pay-to-start.ts`), so the three pages
agree. Elsewhere in Assessment A a buyer's finished survey and payments count under All funnels
and leave under the Funnel filter's Free survey (its ad spend is then blank: the account's spend
includes pay to start's campaigns); a section whose records can't tell a buyer apart (the
survey's question funnel, the report's chapters and tour) says so instead. The Payment page's
payment types put each sale in one row: pay to start · full and · EUR 1.99 by the payment's
journey, what a buyer bought on the report afterwards, the report's EUR 1.99 gate, and the
upgrade after a paid EUR 1.99. A purchase is dated by when it was paid, though its payment row
is written only when the buyer's survey claims it. Pricing tests leave pay to start's surveys out. Pre-unlock rates start on 23 Oct 2026, the first whole day the
EUR 1.99 was on sale: a range starting earlier shows them blank, never 0%.
