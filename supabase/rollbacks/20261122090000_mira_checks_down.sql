-- Rollback of 20261122090000_mira_checks.sql: the self-check table and the "Mira may use my check
-- results" switch go. Roll the code back first: it reads and writes both. Dropping the table
-- deletes every self-check result.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261122090000_mira_checks_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_user DROP COLUMN IF EXISTS use_checks;

DROP TABLE IF EXISTS public.mira_check;

COMMIT;
