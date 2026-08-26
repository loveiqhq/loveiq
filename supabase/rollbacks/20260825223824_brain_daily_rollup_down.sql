-- DOWN migration for 20260825223824_brain_daily_rollup.sql.
--
-- Drops the daily funnel rollup function. Consequence: the analytics half of the
-- company-brain ingest stops (the cron logs an error and Jira still ingests).
-- Already-written `analytics` chunks stay searchable but stop being refreshed.
-- No source data is touched -- this function only reads.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260825223824_brain_daily_rollup_down.sql

BEGIN;

DROP FUNCTION IF EXISTS public.brain_daily_rollup(INT);

COMMIT;
