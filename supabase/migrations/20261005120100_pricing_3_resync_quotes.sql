-- Pricing 3.0: move every UNPURCHASED "All 14" and single-report quote onto its 3.0
-- price list, and stamp it with that list's arm.
--
-- APPLY RIGHT AFTER THE CODE DEPLOYS (and after 20261005120000). Editing PLAN_BUCKETS
-- reprices only NEW quotes: an existing row is pinned to its old price by its stored
-- msrp/starting_price, initial_price and current_price, each on its own. Without this,
-- everyone who already has a quote keeps the 2.x prices (€29 / €49) on the new paygate.
--
-- THE ARM. A pure function of personal_report_id, the same one the code uses
-- (`pricingArmForReport`: Math.imul(id, 2654435761) >>> 0 < 2^31 → A3). A reader's
-- quotes all share one report id, so both their plans land on the same list, and a
-- quote the code creates for them later (a plan they had no row for) agrees with it.
-- Checked identical to the TypeScript for ids 1–5,000 (an even 2,500 / 2,500 split).
--
-- UNLIKE 20260831101238, THE ARM IS REALIGNED. That migration kept the old stamp
-- because it collapsed two lists into one the stamp already named. Here the rows move
-- to NEW prices, and a sale at €19.99 recorded as 2.x arm "B" (whose list was €49)
-- would land in the concluded test's revenue. What the row carried before is kept in
-- metadata.pricing2, which is also what makes the rollback exact.
--
-- metadata.sessionLocks is cleared, for the reason 20260824120000 gives: a lock is
-- pruned by count and never by age, so a returning visitor whose pricingSessionId
-- still matches (sessionStorage, or a nurture email's ?pricingSessionId= link) would
-- be re-served the OLD locked price all the way into Stripe's unit_amount. Only that
-- key goes: nurtureEmailsSent and nurturePromoCodes must survive, or the nurture
-- sequence re-sends its mail and re-mints its codes.
--
-- pricing_cluster_id leads with the arm and the bucket and ends with the discount step
-- ("B-full_report-B-tier_2-…-d0"), so those three parts are rewritten with them; the
-- engine rebuilds the whole id on the reader's next visit anyway.
--
-- Left alone: PURCHASED rows (those buyers paid that exact price), and `essentials` and
-- `core`, which 3.0 no longer quotes or sells (checkout refuses them).
--
-- Idempotent: a row already on A3/B3 is skipped, so a second run changes nothing.
--
-- Prices (must match PLAN_BUCKETS in features/pricing/logic/reportPricing.ts):
--   full_report  A3  29.99 (no strike)     B3  14.99 (no strike)
--   all_reports  A3  39.99 (strike 49.99)  B3  19.99 (strike 29.99)

WITH arm AS (
  SELECT q.id,
         CASE WHEN (q.personal_report_id * 2654435761) % 4294967296 < 2147483648
              THEN 'A3' ELSE 'B3' END AS arm
    FROM public.report_price_quote q
   WHERE q.purchased_at IS NULL
     AND q.plan IN ('full_report', 'all_reports')
     AND q.experiment_group NOT IN ('A3', 'B3')
)
UPDATE public.report_price_quote q SET
  experiment_group   = a.arm,
  base_price_bucket  = a.arm,
  msrp               = v.msrp,
  base_price         = v.msrp,
  starting_price     = v.starting,
  initial_price      = v.starting,
  current_price      = v.starting,
  discount_step      = 0,
  pricing_cluster_id = regexp_replace(
                         regexp_replace(q.pricing_cluster_id,
                                        '^[^-]+-([a-z_]+)-[^-]+-', a.arm || '-\1-' || a.arm || '-'),
                         '-d[0-9]+$', '-d0'),
  metadata           = (q.metadata - 'sessionLocks') || jsonb_build_object('pricing2', jsonb_build_object(
                         'experimentGroup', q.experiment_group,
                         'basePriceBucket', q.base_price_bucket,
                         'msrp', q.msrp,
                         'basePrice', q.base_price,
                         'startingPrice', q.starting_price,
                         'initialPrice', q.initial_price,
                         'currentPrice', q.current_price,
                         'discountStep', q.discount_step,
                         'pricingClusterId', q.pricing_cluster_id,
                         'resyncedAt', now())),
  updated_date_time  = now()
FROM arm a
JOIN (VALUES
  ('full_report'::text, 'A3'::text, 29.99::numeric, 29.99::numeric),
  ('full_report',       'B3',       14.99,          14.99),
  ('all_reports',       'A3',       49.99,          39.99),
  ('all_reports',       'B3',       29.99,          19.99)
) AS v(plan, arm, msrp, starting) ON v.arm = a.arm
WHERE q.id = a.id
  AND q.plan = v.plan;
