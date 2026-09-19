-- DOWN migration for 20260824190000_landing_arm_funnel_daily.sql.
--
-- Drops the four read-only functions added for the daily conversion digest. No
-- data is touched — they only aggregate existing tables — so this is safe to run
-- at any time. Drop the digest cron first (or it starts 500ing), and note that
-- the recordVisit.ts fix shipped in the same commit is INDEPENDENT of these: it
-- should stay, because reverting it resumes writing white_prev under the retired
-- 'control' label.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260824190000_landing_arm_funnel_daily_down.sql

BEGIN;

DROP FUNCTION IF EXISTS get_landing_arm_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS get_arm_cohorts(TIMESTAMPTZ, TIMESTAMPTZ);
-- Dependency order: both RPCs above call these, so they go last.
DROP FUNCTION IF EXISTS landing_arm_from_tracker(TEXT);
DROP FUNCTION IF EXISTS tracker_arm(TEXT, TEXT);

COMMIT;
