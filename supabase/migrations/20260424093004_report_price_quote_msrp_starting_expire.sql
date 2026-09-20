-- Pricing engine v2 (Pricing.xlsx + MVP Requirements doc alignment).
--
-- Adds two columns to `report_price_quote`:
--   * `msrp`           — retail anchor in EUR. The strike-through "old price"
--                        shown in the discount email + pricing modal.
--   * `starting_price` — pre-ladder sale price in EUR. The time-based discount
--                        ladder scales relative to this value, not to MSRP.
--
-- Then expires every unpurchased quote so the engine regenerates each row
-- under the new rules on its next view — instant rollout across all users
-- without having to wait for the 21-day natural expiry.

ALTER TABLE report_price_quote
  ADD COLUMN IF NOT EXISTS msrp           numeric,
  ADD COLUMN IF NOT EXISTS starting_price numeric;

-- One-shot: force the engine to recompute any in-flight quote against the new
-- bucket catalogue + per-plan ladder. Strips cached session locks and email
-- dedup counters so a fresh quote can lock + re-nudge cleanly.
UPDATE report_price_quote
   SET expires_at = now(),
       metadata   = COALESCE(metadata, '{}'::jsonb) - 'sessionLocks' - 'discountEmailsSent'
 WHERE purchased_at IS NULL;
