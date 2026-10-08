-- Rollback for 20261008120000_pricing_3_list_b_lower_resync.
--
-- Puts every still-UNPURCHASED B3 quote back on list B's old prices (€19.99 struck from
-- €29.99, €14.99):
--   1. a row the forward migration moved gets exactly what it carried (metadata.pricing3b);
--   2. a row the new code CREATED after the deploy (no pricing3b) gets list B's old
--      catalogue prices. Nothing else would ever move it: the engine reads a stored
--      quote's prices off the row, even when it renews an expired one, and never
--      rebuilds it from PLAN_BUCKETS.
-- Both only touch rows still on the 2026-10-08 prices, so a row changed since, or one the
-- 20261005120100 rollback already took back to 2.x, is left alone, and running the two
-- rollbacks in either order cannot mix their prices. A row bought since is left alone:
-- that buyer paid the new price, and a completed transaction's amount is never rewritten.
--
-- metadata.sessionLocks is cleared on every row moved: a lock taken since the change holds
-- the NEW price, and a lock wins over the row's price all the way into Stripe's
-- unit_amount. The locks the forward migration deleted are not kept anywhere, which is
-- the safe direction.
--
-- Revert PLAN_BUCKETS in the same change, or new quotes keep arriving at the new prices.

UPDATE public.report_price_quote q SET
  msrp              = (q.metadata->'pricing3b'->>'msrp')::numeric,
  base_price        = (q.metadata->'pricing3b'->>'basePrice')::numeric,
  starting_price    = (q.metadata->'pricing3b'->>'startingPrice')::numeric,
  initial_price     = (q.metadata->'pricing3b'->>'initialPrice')::numeric,
  current_price     = (q.metadata->'pricing3b'->>'currentPrice')::numeric,
  discount_step     = (q.metadata->'pricing3b'->>'discountStep')::integer,
  metadata          = q.metadata - 'pricing3b' - 'sessionLocks',
  updated_date_time = now()
WHERE q.metadata ? 'pricing3b'
  AND q.purchased_at IS NULL
  AND q.experiment_group = 'B3'
  AND (q.plan, q.msrp, q.starting_price, q.current_price) IN
      (('full_report', 4.99, 4.99, 4.99), ('all_reports', 9.99, 6.99, 6.99));

UPDATE public.report_price_quote q SET
  msrp              = v.msrp,
  base_price        = v.msrp,
  starting_price    = v.starting,
  initial_price     = v.starting,
  current_price     = v.starting,
  discount_step     = 0,
  metadata          = q.metadata - 'sessionLocks',
  updated_date_time = now()
FROM (VALUES
  ('full_report'::text, 14.99::numeric, 14.99::numeric, 4.99::numeric, 4.99::numeric),
  ('all_reports',       29.99,          19.99,          9.99,          6.99)
) AS v(plan, msrp, starting, new_msrp, new_starting)
WHERE NOT q.metadata ? 'pricing3b'
  AND q.purchased_at IS NULL
  AND q.experiment_group = 'B3'
  AND q.plan = v.plan
  AND q.msrp = v.new_msrp
  AND q.starting_price = v.new_starting
  AND q.current_price = v.new_starting;
