-- DOWN migration for 20260825130000_revoke_public_execute_digest_rpcs.sql.
--
-- Restores the DEFAULT PostgreSQL grant, which makes these SECURITY DEFINER
-- functions callable by anyone holding the published anon key. Only run this if
-- something legitimately needs anonymous access to aggregate funnel data — the
-- service role already has EXECUTE and does not need this.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260825130000_revoke_public_execute_digest_rpcs_down.sql

BEGIN;

GRANT EXECUTE ON FUNCTION get_landing_arm_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_arm_cohorts(TIMESTAMPTZ, TIMESTAMPTZ) TO PUBLIC;
GRANT EXECUTE ON FUNCTION tracker_arm(TEXT, TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION landing_arm_from_tracker(TEXT) TO PUBLIC;

COMMIT;
