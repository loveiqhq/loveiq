-- DOWN migration for 20260825140000_revoke_public_execute_all_secdef_rpcs.sql.
--
-- Restores anonymous EXECUTE on every SECURITY DEFINER function in `public`.
-- This re-opens a denial-of-alerting vector (claim_slack_alert /
-- mark_slack_alert_delivered are writes) and re-exposes aggregate analytics to
-- anyone holding the published anon key. Only run it if a legitimate anonymous
-- caller is discovered; the service role already has EXECUTE and does not need it.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260825140000_revoke_public_execute_all_secdef_rpcs_down.sql

BEGIN;

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', fn.sig);
  END LOOP;
END $$;

COMMIT;
