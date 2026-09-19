-- DOWN migration for 20260825120000_landing_start_funnel_daily.sql.
--
-- Drops the read-only landing->survey-start RPC. No data is touched.
--
-- The write-path fixes that shipped alongside it (proxy.ts recording `unknown`
-- instead of defaulting to `white`, and the client funnel-event route storing
-- `landing_variant`) are INDEPENDENT and should stay: reverting them resumes
-- crediting unattributable visits to one arm and stops recording the arm on
-- survey starts.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260825120000_landing_start_funnel_daily_down.sql

BEGIN;

DROP FUNCTION IF EXISTS get_landing_start_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ);

COMMIT;
