-- A server-side witness for the paywall step.
--
-- `paywall_initiated` in the funnel is a consent-gated client event, and after
-- 20260905171928 it was the ONLY funnel stage with no server-side signal behind
-- it. That matters because `begin_checkout` now reads `checkout_started_at`, so
-- a consent-gated stage sits directly above a consent-independent one and can
-- invert in a quiet window (`scoreFunnelLeaks` clamps with Math.max(0, a-b), so
-- an inversion silently drops the edge rather than corrupting anything — it
-- degrades the leak ranking).
--
-- /api/price POST already witnesses the paywall server-side — it is the call the
-- report makes when the pricing modal opens — but it wrote nothing durable, only
-- passing a transient `reachedFloor` to the Slack journey message.
--
-- Nullable and unindexed on purpose: the table is 5,659 rows / 8.7 MB, so the
-- sequential scan the funnel RPCs do over it is trivial, and NOT NULL would
-- rewrite the table for no benefit. Existing rows stay NULL and the funnel reads
-- the UNION of this column and the old client event (20260905182829), so history
-- is unchanged and coverage improves as the column fills.
ALTER TABLE report_price_quote
  ADD COLUMN IF NOT EXISTS paywall_reached_at timestamptz;

COMMENT ON COLUMN report_price_quote.paywall_reached_at IS
  'First time this reader reached the paywall, witnessed server-side by /api/price POST. Consent-independent, unlike the paywall_initiated analytics event. Stamped once per submission (only rows still NULL are set), so it records the FIRST view.';
