-- Retire pricing arm A: re-sync every UNPURCHASED report_price_quote onto the
-- surviving (B) price list.
--
-- The A/B price test was concluded on 2026-08-31 by dropping the higher-priced
-- arm. Arm A was the DEARER one from the 2.1 flip on 2026-08-24
-- (39.99/49.99/59 against B's 29/39/49) and the cheaper one before it.
--
-- THIS IS THE CHANGE, NOT A TIDY-UP. Editing PLAN_BUCKETS only reprices NEW
-- quotes. An existing row is pinned to its old price three times over and
-- independently: the stored msrp/starting_price (the bucket is read off the ROW,
-- not the catalogue), the stored initial_price, and the stored current_price.
-- Without this migration every returning arm-A visitor stays on the old, higher
-- price for up to the 21-day quote expiry, and the retirement looks applied
-- while doing nothing.
--
-- Prices go DOWN here, so `current_price`'s monotonic non-increasing clamp
-- (Math.min(previous, discounted, initial) in reportPricing.ts) works WITH this
-- rather than against it — unlike 20260824120000, which raised them. All three
-- inputs are still overwritten together, so the clamp has nothing stale to
-- reach back to.
--
-- Also clears metadata.sessionLocks, for the reason spelled out in
-- 20260824120000: locks are pruned by COUNT (newest 12) and never by age, so a
-- returning visitor whose pricingSessionId still matches — from sessionStorage
-- or a nurture-email ?pricingSessionId= deep link — would be re-served the OLD
-- locked price all the way through to Stripe's unit_amount. Only that ONE key is
-- removed: metadata also carries nurtureEmailsSent and nurturePromoCodes, and
-- wiping those would re-send nurture mail and re-mint promo codes for everyone.
--
-- PURCHASED quotes (purchased_at IS NOT NULL) are LEFT FROZEN — those buyers
-- paid that exact price; never rewrite a completed transaction's amount.
--
-- Keyed on `plan` ALONE, not on experiment_group or base_price_bucket. Every
-- previous resync had two live price lists to keep apart; this one collapses
-- them, so every unpurchased row lands on the same numbers whatever it was
-- stamped with — including the ~40% of legacy rows whose bucket and arm
-- disagree, and the retired 'C' rows.
--
-- `experiment_group` and `base_price_bucket` are deliberately NOT realigned,
-- following 20260824120000. Rewriting the arm on ~4,900 unpurchased rows would
-- permanently destroy the per-arm quote denominators of the concluded test. The
-- cost of leaving them is that an unpurchased row's arm now describes the list it
-- was ORIGINALLY quoted at, not the price it currently carries. The test's final
-- numbers are pinned in the PLAN_BUCKETS comment in
-- features/pricing/logic/reportPricing.ts so they survive this rewrite either way.
--
-- Idempotent (fixed values), so it is safe to re-run.
--
-- Prices (must match features/pricing/logic/reportPricing.ts PLAN_BUCKETS):
--   full_report  29.00 (priced at its own anchor, so no strike)
--   core         39.00 (strike 87.00)
--   all_reports  49.00 (strike 58.00)
--   essentials    9.99 (strike 29.99, retired/grandfathered)

UPDATE report_price_quote q SET
  msrp              = v.msrp,
  base_price        = v.msrp,
  starting_price    = v.starting,
  initial_price     = v.starting,
  current_price     = v.starting,
  discount_step     = 0,
  metadata          = q.metadata - 'sessionLocks',
  updated_date_time = now()
FROM (VALUES
  ('full_report'::text, 29.00::numeric, 29.00::numeric),
  ('core',              87.00,          39.00),
  ('all_reports',       58.00,          49.00),
  ('essentials',        29.99,           9.99)
) AS v(plan, msrp, starting)
WHERE q.plan = v.plan
  AND q.purchased_at IS NULL;
