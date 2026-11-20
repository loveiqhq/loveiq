-- Rollback of 20261121010000_mira_minor.sql: the column goes, and with it which accounts said they
-- are under 18. Roll the code back first: the chat route and the nudge job read it.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261121010000_mira_minor_down.sql

ALTER TABLE public.mira_user DROP COLUMN IF EXISTS minor_at;
