-- Mira's goal offers survive a reload (round-2 audit CHAT-9, lead decision 3). Additive only:
-- one nullable column. Rollback: supabase/rollbacks/20261122120000_mira_message_goal_down.sql
--
-- mira_message.goal: the small goal Mira offered with this reply ([[GOAL:the step]], at most 80
--   characters, features/mira/server/safety.ts GOAL_MAX_CHARS, in her words), so a reopened chat
--   shows "Add as a goal" under it again, or "Added" when the person's goals hold that text.
--   NULL for every other message. Written only while "Remember our conversations" is on, like
--   the message; it goes with the message (and the chat, and the account).
--
-- Apply before the code that reads and writes it (app/api/mira/chat, app/api/mira/chats/[id]) is
-- deployed: reading a chat selects the column. Service role only, like every other Mira object.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_message
  ADD COLUMN IF NOT EXISTS goal text CHECK (char_length(goal) <= 80);

COMMENT ON COLUMN public.mira_message.goal IS
  'The small goal Mira offered with this reply ([[GOAL:…]], at most 80 characters), shown again as "Add as a goal" when the chat is reopened. NULL for every other message.';

COMMIT;
