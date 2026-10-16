-- Pricing 3.0, list B lowered (the `Pricing_3.0` tab of the "Tracking & Pricing" sheet,
-- 2026-10-08): move every UNPURCHASED B3 quote onto the new list B prices.
--
--   all_reports  B3  €19.99 (strike €29.99)  →  €6.99 (strike €9.99)
--   full_report  B3  €14.99 (no strike)      →  €4.99 (no strike)
--
-- List A3 is unchanged, and so is every reader's arm: only B3's prices move.
--
-- APPLY RIGHT AFTER THE CODE DEPLOYS. Editing PLAN_BUCKETS reprices only NEW quotes: an
-- existing row is pinned to its old price by its stored msrp/starting_price,
-- initial_price and current_price, each on its own. Without this, every B3 reader who
-- already has a quote keeps €19.99 / €14.99.
--
-- metadata.sessionLocks is cleared, for the reason 20260824120000 gives: a lock is
-- pruned by count and never by age, so a returning visitor whose pricingSessionId still
-- matches (sessionStorage, or a nurture email's ?pricingSessionId= link) would be
-- re-served the OLD locked price all the way into Stripe's unit_amount. Only that key
-- goes: nurtureEmailsSent and nurturePromoCodes must survive, or the nurture sequence
-- re-sends its mail and re-mints its codes. The 72h code is a percentage, so a code
-- minted before this now takes 50% off the new price.
--
-- What the row carried before is kept in metadata.pricing3b, which is what makes the
-- rollback exact. metadata.pricing2 (the 2.x row, from 20261005120100) is left as it is.
--
-- Left alone: PURCHASED rows (those buyers paid that exact price; on production all four
-- bought B3 quotes are staff tests that own All 14), A3 rows, and `essentials`/`core`.
-- experiment_group, base_price_bucket and pricing_cluster_id stay: the arm is still B3,
-- the discount step still 0, and the cluster id carries no price.
--
-- Idempotent: only a row still on an old price is touched, so a second run changes
-- nothing, and a quote the new code created is never stashed over.
--
-- Prices (must match PLAN_BUCKETS in features/pricing/logic/reportPricing.ts):
--   full_report  B3   4.99 (no strike)
--   all_reports  B3   6.99 (strike 9.99)

UPDATE public.report_price_quote q SET
  msrp              = v.msrp,
  base_price        = v.msrp,
  starting_price    = v.starting,
  initial_price     = v.starting,
  current_price     = v.starting,
  discount_step     = 0,
  metadata          = (q.metadata - 'sessionLocks') || jsonb_build_object('pricing3b', jsonb_build_object(
                        'msrp', q.msrp,
                        'basePrice', q.base_price,
                        'startingPrice', q.starting_price,
                        'initialPrice', q.initial_price,
                        'currentPrice', q.current_price,
                        'discountStep', q.discount_step,
                        'resyncedAt', now())),
  updated_date_time = now()
FROM (VALUES
  ('full_report'::text, 4.99::numeric, 4.99::numeric),
  ('all_reports',       9.99,          6.99)
) AS v(plan, msrp, starting)
WHERE q.purchased_at IS NULL
  AND q.experiment_group = 'B3'
  AND q.plan = v.plan
  AND (q.msrp, q.base_price, q.starting_price, q.initial_price, q.current_price, q.discount_step)
      IS DISTINCT FROM (v.msrp, v.msrp, v.starting, v.starting, v.starting, 0);
