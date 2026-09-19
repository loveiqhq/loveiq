-- Pricing 2.0: re-sync every UNPURCHASED report_price_quote to the new flat
-- catalogue prices, keyed on the experiment arm (Group A = low arm, Group B =
-- high arm). Mirrors the earlier flat-pricing re-sync (20260625120000): the code
-- change to PLAN_BUCKETS only reprices NEW quotes, so existing rows stay frozen
-- at the old prices until this runs. Without it, every returning user sees stale
-- prices (old €49.99/€79.99 strikes, wrong Group-B numbers, or NULL/backfilled
-- rows that fall back to a stale base_price).
--
-- PURCHASED quotes (purchased_at IS NOT NULL) are LEFT FROZEN — those buyers
-- paid that exact price; never rewrite a completed transaction's amount.
--
-- Uplift is paused (pricing_uplift_enabled OFF), so each arm is simply its
-- bucket base: current = starting, msrp = strike, discount_step = 0. Idempotent
-- (fixed values), so it is safe to re-run.
--
-- Prices (must match features/pricing/logic/reportPricing.ts PLAN_BUCKETS):
--   full_report  A 14.99 → 9.99   | B 29.00 → 29.00 (flat, no strike)
--   core         A 24.99 → 19.99  | B 87.00 → 39.00
--   all_reports  A 34.99 → 29.99  | B 58.00 → 49.00
--   essentials   A/B 29.99 → 9.99 (grandfathered, unchanged)

UPDATE report_price_quote q SET
  msrp              = v.msrp,
  base_price        = v.msrp,
  starting_price    = v.starting,
  initial_price     = v.starting,
  current_price     = v.starting,
  discount_step     = 0,
  updated_date_time = now()
FROM (VALUES
  ('full_report'::text, 'A'::text, 14.99::numeric, 9.99::numeric),
  ('full_report',       'B',       29.00,          29.00),
  ('core',              'A',       24.99,          19.99),
  ('core',              'B',       87.00,          39.00),
  ('all_reports',       'A',       34.99,          29.99),
  ('all_reports',       'B',       58.00,          49.00),
  ('essentials',        'A',       29.99,          9.99),
  ('essentials',        'B',       29.99,          9.99)
) AS v(plan, grp, msrp, starting)
WHERE q.plan = v.plan
  AND q.experiment_group = v.grp
  AND q.purchased_at IS NULL;
