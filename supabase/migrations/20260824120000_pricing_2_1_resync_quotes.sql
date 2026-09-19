-- Pricing 2.1: re-sync every UNPURCHASED report_price_quote to the raised
-- arm-A catalogue, keyed on the experiment arm. Mirrors 20260727130000, with
-- two differences that matter.
--
-- (1) THIS IS THE CHANGE, NOT A TIDY-UP. Editing PLAN_BUCKETS only reprices
--     NEW quotes. An existing row is pinned to its old price three times over
--     and independently: the stored msrp/starting_price (the bucket is read off
--     the ROW, not the catalogue), the stored initial_price, and the stored
--     current_price. Skipping this migration leaves every returning visitor on
--     the old price for up to the 21-day quote expiry, and the raise looks
--     applied while doing nothing.
--
-- (2) 2.1 RAISES arm A. Every previous re-sync lowered prices, so they could
--     lean on `current_price` being monotonically non-increasing
--     (Math.min(previous, discounted, initial) in reportPricing.ts). Going up,
--     that clamp works AGAINST us: it is only safe here because we overwrite
--     all three of its inputs at once. Do not reduce this to a msrp/starting
--     update — current_price would be clamped straight back to the old amount.
--
-- Also clears metadata.sessionLocks, which 20260727130000 forgot and the three
-- resyncs before it all did. Session locks are pruned by COUNT only (newest 12,
-- reportPricing.ts) and never by age, so they are effectively permanent: a
-- returning visitor whose pricingSessionId still matches — from sessionStorage
-- or a nurture-email ?pricingSessionId= deep link — would be re-served the OLD
-- locked price, all the way through to Stripe's unit_amount. Removing just that
-- ONE key deliberately: metadata also carries nurtureEmailsSent and
-- nurturePromoCodes, and wiping those would re-send nurture mail and re-mint
-- promo codes for everyone.
--
-- PURCHASED quotes (purchased_at IS NOT NULL) are LEFT FROZEN — those buyers
-- paid that exact price; never rewrite a completed transaction's amount.
--
-- Keyed on experiment_group, NOT base_price_bucket. Measured in production, the
-- two disagree on ~40% of rows (legacy rows drew the bucket independently of
-- the arm, and some still hold retired codes like 'C'). Keying on the bucket
-- would raise group-B readers to arm A's price and leave group-A readers on the
-- old one — corrupting both arms of a live pricing test. base_price_bucket is
-- deliberately NOT realigned: the engine reads msrp/starting off the row when
-- they are non-null, so the stored values below govern the served price and the
-- bucket column stays cosmetic.
--
-- Uplift is paused (pricing_uplift_enabled OFF), so each arm is simply its
-- bucket base: current = starting, msrp = strike, discount_step = 0. Idempotent
-- (fixed values), so it is safe to re-run.
--
-- Prices (must match features/pricing/logic/reportPricing.ts PLAN_BUCKETS).
-- Arm A is now the HIGH arm on every tier — the reverse of 2.0:
--   full_report  A 45.99 → 39.99  | B 29.00 → 29.00 (flat, no strike)
--   core         A 54.99 → 49.99  | B 87.00 → 39.00
--   all_reports  A 64.99 → 59.00  | B 58.00 → 49.00
--   essentials   A/B 29.99 → 9.99 (retired/grandfathered, unchanged)

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
  ('full_report'::text, 'A'::text, 45.99::numeric, 39.99::numeric),
  ('full_report',       'B',       29.00,          29.00),
  ('core',              'A',       54.99,          49.99),
  ('core',              'B',       87.00,          39.00),
  ('all_reports',       'A',       64.99,          59.00),
  ('all_reports',       'B',       58.00,          49.00),
  ('essentials',        'A',       29.99,          9.99),
  ('essentials',        'B',       29.99,          9.99)
) AS v(plan, grp, msrp, starting)
WHERE q.plan = v.plan
  AND q.experiment_group = v.grp
  AND q.purchased_at IS NULL;
