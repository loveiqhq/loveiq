-- Drop twelve never-used filter indexes on the admin_submission_facts materialized view.
--
-- `refresh_admin_submission_facts()` runs `REFRESH MATERIALIZED VIEW CONCURRENTLY`
-- every five minutes, which rebuilds EVERY index on the view. Measured 2026-08-31, it
-- is the single largest write in this database: 44,558 calls, 2,009,848 blocks written.
--
-- These twelve have `idx_scan = 0` with statistics accumulating since 2025-12-08 --
-- 8.7 months, so the zero is trustworthy rather than an artefact of a recent reset. And
-- the view holds 1,798 rows: at that size a sequential scan is instant, so they would
-- buy nothing measurable even if the admin filters were being used. Paying an index
-- rebuild 288 times a day for a filter that has never run, on a table small enough not
-- to need one, is the wrong trade in both directions. Index footprint 648 kB -> 184 kB.
--
-- DELIBERATELY KEPT:
--   admin_submission_facts_submission_id_uidx -- 31 scans, and REFRESH ... CONCURRENTLY
--     REQUIRES a unique index. Dropping it breaks the refresh outright. Verified by
--     running the refresh after these drops: it succeeded, 1,801 rows.
--   admin_submission_facts_created_at_idx     -- 29 scans, genuinely used for ordering.
--
-- DELIBERATELY NOT TOUCHED: report_price_quote_cluster_idx (336 kB, 0 scans, on the
-- highest-write table in the database). It indexes `pricing_cluster_id`, and the pricing
-- A/B was being retired in a concurrent branch the same day, so a zero scan count there
-- may simply mean the new code filters differently. Not safe to drop mid-change.
drop index if exists public.admin_submission_facts_archetype_lower_idx;
drop index if exists public.admin_submission_facts_country_lower_idx;
drop index if exists public.admin_submission_facts_gender_lower_idx;
drop index if exists public.admin_submission_facts_has_payment_idx;
drop index if exists public.admin_submission_facts_has_report_idx;
drop index if exists public.admin_submission_facts_relationship_status_lower_idx;
drop index if exists public.admin_submission_facts_sexual_orientation_lower_idx;
drop index if exists public.admin_submission_facts_status_lower_idx;
drop index if exists public.admin_submission_facts_utm_medium_lower_idx;
drop index if exists public.admin_submission_facts_utm_source_lower_idx;
drop index if exists public.admin_submission_facts_v5_archetype_lower_idx;
drop index if exists public.admin_submission_facts_was_resumed_idx;
