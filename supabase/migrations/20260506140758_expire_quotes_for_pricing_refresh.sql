-- Pricing refresh (May 2026): bucket weights move from 34/33/33 → 20/10/70 and
-- starting prices for buckets A and C are recalibrated to match the new
-- elasticity test (cheap floor offer, premium ceiling offer). Expire every
-- in-flight quote so the engine regenerates each row under the new bucket
-- catalogue on its next view — no mixed cohort across the deploy boundary.
--
-- Mirrors the one-shot expiry pattern in 20260424092912 with the same metadata
-- cleanup so locks and discount-email dedup don't carry old state across.

UPDATE report_price_quote
   SET expires_at = now(),
       metadata   = COALESCE(metadata, '{}'::jsonb) - 'sessionLocks' - 'discountEmailsSent'
 WHERE purchased_at IS NULL
   AND expires_at > now();
