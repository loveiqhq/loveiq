-- DOWN migration for 20260824120000_pricing_2_1_resync_quotes.sql.
--
-- Puts every UNPURCHASED quote back on the Pricing 2.0 catalogue (arm A low),
-- for the case where the 23.08 higher-price test has to be abandoned. Arm B and
-- essentials rows are rewritten to the same values they already hold, so they
-- are a no-op either way.
--
-- Pair this with reverting PLAN_BUCKETS in features/pricing/logic/reportPricing.ts
-- and the priceCents fallbacks in features/checkout/server/reportPurchase.ts —
-- reverting only one of the two leaves new quotes and existing quotes on
-- different catalogues.
--
-- All five money columns are overwritten together, for the same reason the UP
-- migration does it: current_price is clamped to
-- Math.min(previous, discounted, initial), so a partial revert would be
-- silently undone on the next re-quote.
--
-- NOT restored: metadata.sessionLocks, which the UP migration dropped. That is
-- a deliberate one-way loss and is harmless — a missing lock just means the
-- visitor is re-quoted from the catalogue, which after this rollback is the old
-- (lower) price. Nurture idempotency keys were never touched.
--
-- PURCHASED quotes stay frozen, as in the UP migration.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260824120000_pricing_2_1_resync_quotes_down.sql

BEGIN;

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

COMMIT;
