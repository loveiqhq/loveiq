-- Rollback for 20261005120100_pricing_3_resync_quotes.
--
-- Puts every still-UNPURCHASED re-synced row back exactly as it was, from the
-- metadata.pricing2 the forward migration saved: arm, bucket, all four prices, the
-- discount step and the cluster id. A row bought since is left alone: that buyer paid
-- the 3.0 price, and a completed transaction's amount is never rewritten.
--
-- ONE THING THIS CANNOT UNDO: the forward migration deleted metadata.sessionLocks, and
-- those are not kept anywhere. A returning visitor gets a freshly derived price rather
-- than a previously locked one, which is the safe direction.
--
-- Quotes the 3.0 code CREATED (no pricing2) keep A3/B3 and their 3.0 prices. Run this
-- with the code reverted too: the old engine reads msrp/starting off the row, so those
-- readers keep the 3.0 prices it can no longer generate, which is survivable but not a
-- state to sit in. 20261005120000 (the widened CHECK) stays: those rows still need it.

UPDATE public.report_price_quote q SET
  experiment_group   = q.metadata->'pricing2'->>'experimentGroup',
  base_price_bucket  = q.metadata->'pricing2'->>'basePriceBucket',
  msrp               = (q.metadata->'pricing2'->>'msrp')::numeric,
  base_price         = (q.metadata->'pricing2'->>'basePrice')::numeric,
  starting_price     = (q.metadata->'pricing2'->>'startingPrice')::numeric,
  initial_price      = (q.metadata->'pricing2'->>'initialPrice')::numeric,
  current_price      = (q.metadata->'pricing2'->>'currentPrice')::numeric,
  discount_step      = (q.metadata->'pricing2'->>'discountStep')::integer,
  pricing_cluster_id = q.metadata->'pricing2'->>'pricingClusterId',
  metadata           = q.metadata - 'pricing2',
  updated_date_time  = now()
WHERE q.metadata ? 'pricing2'
  AND q.purchased_at IS NULL;
