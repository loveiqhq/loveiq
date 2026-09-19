-- Lock down the conversion-digest RPCs.
--
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, and these are all
-- SECURITY DEFINER, which bypasses the RLS on the tables they read. So every
-- function added for the digest was callable by `anon` with the published
-- NEXT_PUBLIC_SUPABASE_ANON_KEY, via /rest/v1/rpc/<name>.
--
-- The payload is aggregate and non-identifying — daily traffic volume, the live
-- A/B split, per-arm conversion — so this is competitive-intelligence leakage
-- rather than a privacy breach. The repo's earlier lockdown migrations
-- (20260430140000, 20260501000000, 20260522120100) state exactly this threat
-- model, but enumerate functions one by one, so anything added later is exposed
-- again by default. These four were.
--
-- Idempotent: REVOKE on an already-revoked grant is a no-op.

REVOKE EXECUTE ON FUNCTION get_landing_arm_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_landing_arm_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION get_arm_cohorts(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_arm_cohorts(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION tracker_arm(TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION tracker_arm(TEXT, TEXT) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION landing_arm_from_tracker(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION landing_arm_from_tracker(TEXT) FROM anon, authenticated;
