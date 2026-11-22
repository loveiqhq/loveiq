-- Rollback of 20261122120000_mira_message_goal.sql: mira_message.goal goes. Roll the code back
-- first: the chat route writes it and reading a chat selects it. Saved chats lose their goal
-- offers (Mira's words about them stay); goals already added are untouched.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261122120000_mira_message_goal_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_message
  DROP COLUMN IF EXISTS goal;

COMMIT;
