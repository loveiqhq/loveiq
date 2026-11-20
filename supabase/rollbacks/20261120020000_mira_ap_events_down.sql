-- Rollback of 20261120020000_mira_ap_events.sql. Roll the code back first: without the function
-- the AP-Analytics Mira page answers "Unable to load the Mira page" (nothing else calls it).
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261120020000_mira_ap_events_down.sql

DROP FUNCTION IF EXISTS public.mira_ap_events(text[]);
