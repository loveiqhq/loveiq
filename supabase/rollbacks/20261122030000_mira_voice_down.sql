-- Rollback of 20261122030000_mira_voice.sql: the voice sessions table and the voice_session column
-- go. Roll the code back first: the chat route writes voice_session and the recordings routes read
-- mira_voice_session. Dropping them deletes every session's times and key points; the spoken turns
-- stay in their chats as ordinary messages.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261122030000_mira_voice_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS public.mira_voice_session;

ALTER TABLE public.mira_message
  DROP COLUMN IF EXISTS voice_session;

COMMIT;
