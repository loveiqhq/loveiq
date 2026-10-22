# Pre-unlock: runbook

The forced EUR 1.99 gate (Notion "RFD > Pre-Unlock", Figma Report-3.0 `1604:2328`): a reader
who finished the free survey pays EUR 1.99 for their Core Archetype before their report
opens, and gets EUR 10 off the full report with it. How it works is in
`features/report/AGENT_README.md` ("The EUR 1.99 pre-unlock gate"); this page is what to do
with it. Everything ships switched off.

## Launch, in this order

1. **The migration, staging first.** `supabase/migrations/20261020090000_initial_unlock_gate.sql`
   adds the gate's four columns to `personal_report` and its two flags, both off. Apply it to
   the staging database and check staging, then to production with the release that carries
   the code. Never `db push`: the repo's migrations and the live schema differ, so compare
   with a dump first. The rollback is
   `supabase/rollbacks/20261020090000_initial_unlock_gate_down.sql`. Until the migration is
   applied the gate cannot open: its flag's row does not exist, and a missing flag is off.
2. **The ads.** The search ads promise a free report. Before the switch, Sanjin Studenovic
   checks every ad's copy and changes what the gate makes untrue.
3. **Switch it on.** `PATCH /api/admin/system-flags` with an admin session, as
   `docs/runbooks/DISASTER_RECOVERY.md` §3 shows, with
   `{"key":"report_initial_unlock_gate","enabled":true}`. Only surveys submitted from then on
   are gated; the change reaches every instance within 30 seconds (the flags' cache).
4. **Check it.** Take the survey in a fresh browser with an address that isn't a team one: a
   team address (`@loveiq.org`) makes the payment a staff test (`is_test`), and test payments
   carry no EUR 10 credit, so it would show EUR 29.99. The gate follows the wizard. Pay
   (sandbox: Stripe's test card; production: a real card, refunded after). The report opens
   at its top with the Core Archetype card and the Summary open, and its pay screen offers
   the full report at EUR 19.99 ("€10 credit applied" on Stripe's page). E06, "Your Core
   Archetype is unlocked", arrives. In the database the report has `initial_gate_cohort_at`
   and `initial_gate_seen_at`, and the payment `metadata.plan` = `initial`.
5. **E07, from day 4.** Four days after the switch at the earliest, when the first gated
   readers reach day 4: `{"key":"initial_unlock_gift_email","enabled":true}`. The cron runs
   hourly at :47, on production only; each run logs its summary (`gifted`, `heldOut`,
   `skipped…`, `failed`), and #ops hears about a stalled cron after three hours.

## Switch it off

- `report_initial_unlock_gate` off: nobody is gated any more. Readers in the cohort get their
  free report as before, and the 72-hour 50% email reaches them again. Payments made stand.
- `initial_unlock_gift_email` is its own switch: with the gate off for good, switch it off
  too, or readers who met the gate before still get the gift on day 4.
- `report_paywall_enforced` off (the paywall's kill switch) opens every report, gate included.

## Old reports, for the campaign

The gate never stops a report from before the switch. The old-user campaign (19.10 sync)
brings readers in by stamping their reports into the cohort, for the campaign's list only:

```sql
UPDATE personal_report
SET initial_gate_cohort_at = now()
WHERE id IN (/* the campaign's reports */)
  AND initial_gate_cohort_at IS NULL;
```

A stamped report is gated on its next open, unless its reader already bought something.

## Refunds

A refunded EUR 1.99 takes the Core Archetype and the EUR 10 credit back with it: the reader
meets the gate again. If the full report was bought with the credit before the refund, #ops
gets `credited_payment_refunded`: the reader keeps the full report for EUR 10 less, and
charging the difference is a person's call.

## Reading it

- AP-Analytics, Focus: "Completion → pre-unlock", EUR 1.99 sales per finished survey and the
  revenue per sale. The Payment page's segments and the Landing page's arms carry the rate.
- E07's holdout: compare full-report purchases after day 4 between `initial_gift_arm` = `gift`
  and `holdout`, staff left out. The gift's EUR 0 rows are never revenue.
