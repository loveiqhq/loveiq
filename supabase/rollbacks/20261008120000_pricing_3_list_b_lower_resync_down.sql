-- Rollback for 20261008120000_pricing_3_list_b_lower_resync.
--
-- Puts every still-UNPURCHASED re-synced B3 row back on the prices it had, from the
-- metadata.pricing3b the forward migration saved. A row bought since is left alone: that
-- buyer paid the new price, and a completed transaction's amount is never rewritten.
--
-- ONE THING THIS CANNOT UNDO: the forward migration deleted metadata.sessionLocks, and
-- those are not kept anywhere. A returning visitor gets a freshly derived price rather
-- than a previously locked one, which is the safe direction.
--
-- Quotes the new code CREATED (no pricing3b) keep €6.99 / €4.99. Run this with the code
-- reverted too: the engine reads msrp/starting off the row, so those readers would keep
-- the new prices until their quote is rebuilt.

UPDATE public.report_price_quote q SET
  msrp              = (q.metadata->'pricing3b'->>'msrp')::numeric,
  base_price        = (q.metadata->'pricing3b'->>'basePrice')::numeric,
  starting_price    = (q.metadata->'pricing3b'->>'startingPrice')::numeric,
  initial_price     = (q.metadata->'pricing3b'->>'initialPrice')::numeric,
  current_price     = (q.metadata->'pricing3b'->>'currentPrice')::numeric,
  discount_step     = (q.metadata->'pricing3b'->>'discountStep')::integer,
  metadata          = q.metadata - 'pricing3b',
  updated_date_time = now()
WHERE q.metadata ? 'pricing3b'
  AND q.purchased_at IS NULL;
