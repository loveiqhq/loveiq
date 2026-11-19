-- A nudge's words live only in the chat (as Mira's message there), so they go when the chat
-- goes: deleting chats, the account, or the 12-month memory limit. mira_nudge keeps only what the
-- counts need (kind, fixed subject, day, times). Follows 20261118210000. Rollback:
-- supabase/rollbacks/20261118220000_mira_nudge_drop_body_down.sql
-- migration-lint: ignore (drops a column created earlier in this same PR by 20261118210000;
-- it never reached production and no code reads it)

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_nudge DROP COLUMN IF EXISTS body;

COMMENT ON TABLE public.mira_nudge IS
  'Mira''s daily nudge emails (features/mira/server/nudges.ts): one per person per local day at most; the words are only in the chat (message_id), never here; clicked_at = its button.';

COMMIT;
