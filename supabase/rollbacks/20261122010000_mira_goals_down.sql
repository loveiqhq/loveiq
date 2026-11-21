-- Rollback of 20261122010000_mira_goals.sql: the goal tables go. Roll the code back first: it
-- reads and writes them. Dropping them deletes every goal and tick.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261122010000_mira_goals_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS public.mira_goal_log;
DROP TABLE IF EXISTS public.mira_goal;

COMMIT;
