-- Close the remaining anonymous access to SECURITY DEFINER analytics/ops RPCs.
--
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default. These are all
-- SECURITY DEFINER, which BYPASSES row-level security on the tables they read —
-- so every one of them was callable by anyone holding the published
-- NEXT_PUBLIC_SUPABASE_ANON_KEY, via /rest/v1/rpc/<name>.
--
-- Found by sweeping pg_proc after locking down the four digest functions: 20 of
-- the 54 SECURITY DEFINER functions in `public` were still anon-callable. The
-- repo's earlier lockdown migrations (20260430140000, 20260501000000,
-- 20260522120100) state exactly this threat model but enumerate functions one at
-- a time, so anything added afterwards is exposed again by default.
--
-- TWO OF THESE ARE WRITES, and they are the reason this is not merely a leak:
--   claim_slack_alert         — takes the per-alert delivery claim
--   mark_slack_alert_delivered— marks it delivered
-- An anonymous caller could claim the day's slot for any alert kind and suppress
-- the team's Slack alerting entirely, or mark undelivered alerts as sent. That is
-- a denial-of-alerting vector on the channel that carries 5xx errors, cron
-- failures and Stripe disputes.
--
-- The rest expose aggregate funnel, pricing-bucket, A/B and revenue-shaped
-- analytics — competitive intelligence rather than personal data, but nothing
-- here is meant to leave the service role.
--
-- Verified before revoking: every caller is server-side (app/api/**,
-- features/admin/server/**, shared/observability/**) using the service-role key.
-- No client component calls any RPC.
--
-- Idempotent: REVOKE on an already-revoked grant is a no-op.

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    -- A loop rather than a hand-written list: an enumerated lockdown is exactly
    -- why these drifted back open, and it keeps this correct for whatever is
    -- added between authoring and applying.
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END $$;
