-- Rollback of 20261124010000_mira_anon_chats.sql. Roll the code back first: the chat route writes
-- signed-out chats into these columns and the memory cron deletes them by anon_id.
-- The chats kept without an account are deleted, their messages with them (ON DELETE CASCADE):
-- nothing could own them once user_id is required again. Chats a sign-up carried into an account
-- are the account's and stay.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261124010000_mira_anon_chats_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

DELETE FROM public.mira_chat WHERE user_id IS NULL;

ALTER TABLE public.mira_chat DROP CONSTRAINT IF EXISTS mira_chat_owner;
ALTER TABLE public.mira_chat ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.mira_chat DROP COLUMN IF EXISTS consent_version;
ALTER TABLE public.mira_chat DROP COLUMN IF EXISTS anon_id;

COMMENT ON TABLE public.mira_chat IS
  'A signed-in person''s chat with Mira, kept only while "Remember our conversations" is on.';

COMMIT;
