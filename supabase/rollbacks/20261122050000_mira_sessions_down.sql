-- Rollback of 20261122050000_mira_sessions.sql. Roll the code back first: the weekly-session
-- routes, the reminder cron, the chat route and stopForMinor read and write these tables. Booked
-- sessions are lost (people keep the invite already in their calendars, without reminders).
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261122050000_mira_sessions_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS public.mira_session_reminder;
DROP TABLE IF EXISTS public.mira_session_slot;

COMMIT;
