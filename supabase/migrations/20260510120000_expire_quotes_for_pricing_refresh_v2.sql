-- Pricing refresh (May 2026, second pass): starting prices are lowered across
-- 8 of 9 (plan, bucket) cells per `Tracking & Pricing - Prices (1).csv`. Only
-- all_reports/C (€49.99) is unchanged; A/B/C drop for essentials and full_report,
-- and A/B drop for all_reports. MSRP, ladder, multipliers, and bucket weights
-- are unchanged.
--
-- Expire every in-flight quote so the engine regenerates each row under the new
-- starting-price catalogue on its next view. New prices are strictly lower than
-- old ones, so the "price never increases" guardrail is preserved by definition.
--
-- Mirrors 20260506130000_expire_quotes_for_pricing_refresh.sql: clears
-- sessionLocks (so the next /price call rebuilds the lock at the new bucket)
-- and discountEmailsSent (so the cron re-evaluates discount nudges against
-- the new initial price).

UPDATE report_price_quote
   SET expires_at = now(),
       metadata   = COALESCE(metadata, '{}'::jsonb) - 'sessionLocks' - 'discountEmailsSent'
 WHERE purchased_at IS NULL
   AND expires_at > now();
