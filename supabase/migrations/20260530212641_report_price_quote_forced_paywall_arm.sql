-- Forced-paywall A/B: consent-independent assignment column
--
-- `report_price_quote` is created server-side for every report that resolves a
-- price (no client analytics-consent gate), one row per plan per submission. It
-- already carries the pricing `experiment_group`. We stamp the forced-paywall
-- arm here too so the experiment has a consent-independent denominator:
--   "users assigned per arm" = COUNT(DISTINCT survey_submission_id) GROUP BY arm
-- which closes the consent bias in CVR = purchases / exposed (exposed lived only
-- in the consent-gated analytics_event). See features/pricing/logic/reportPricing.ts
-- (stamped stably at first quote persist) and the get_forced_paywall_ab RPC
-- (exposes the per-arm `assigned` count).
--
-- Nullable text, no backfill: rows written before the experiment stay NULL and
-- are excluded from the per-arm aggregation. Adding a nullable column is a
-- metadata-only change on Postgres (no table rewrite / no long lock).

ALTER TABLE public.report_price_quote
  ADD COLUMN IF NOT EXISTS forced_paywall_arm text;
