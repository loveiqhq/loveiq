-- Rollback of 20261122130000_mira_end_auth_sessions.sql: the function goes. The code calls it best
-- effort, so it needn't be rolled back first: a sign-out then only logs a warning, and the device
-- stays refused by Mira from its next request, as before.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261122130000_mira_end_auth_sessions_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.mira_end_auth_sessions(uuid, uuid[]);

COMMIT;
