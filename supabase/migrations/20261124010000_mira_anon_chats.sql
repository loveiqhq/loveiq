-- Mira keeps signed-out chats too (Eman, 24 Nov 2026: "make sure that also anonymous chats are
-- also stored in our db ... so we have access to everything"; a signed-out demo's poor answer on
-- 23 Nov could not be looked at). Additive only: two nullable columns, user_id may be NULL, and a
-- check that every chat has exactly one owner. Follows 20261122130000.
-- Rollback: supabase/rollbacks/20261124010000_mira_anon_chats_down.sql
--
-- mira_chat.anon_id: the browser id (the mira_anon cookie, features/mira/server/anon.ts) of a chat
--   kept without an account; NULL for an account's chat. Its messages are ordinary mira_message
--   rows. A sign-up that carries the browser's chat into the account sets user_id and clears
--   anon_id in one update (features/mira/server/store.ts adoptAnonChat), so it is never kept twice.
-- mira_chat.consent_version: the first-message consent the browser agreed to
--   (features/mira/server/config.ts CONSENT_VERSION). The chat route keeps a signed-out chat only
--   under the wording that names keeping it, and a signed-out chat can't be written without one.
--   It stays when the chat moves into an account; NULL for chats begun in an account.
-- mira_chat.user_id: NULL for a signed-out chat. Every read and delete by account filters on it
--   (store.ts, nudges.ts, voice.ts, intake.ts, weekly-sessions.ts, the data-request tool), and
--   NULL never equals an id, so no account reaches a signed-out chat; mira_forget_old_memory
--   (per account) never touches one either. The daily mira-memory cron deletes a signed-out chat
--   12 months after its last message, as it does an account's (app/api/cron/mira-memory).
--
-- No index on anon_id: a chat is read with its id (the primary key), and deleted by anon_id only
-- when a person deletes it, signs up or is stopped as under 18. ponytail: add one (CONCURRENTLY,
-- in a file of its own) if mira_chat grows to where that scan shows.
--
-- The check reads every existing row once (each has a user_id and no anon_id, so it holds); the
-- table is small. Service role only, like every other Mira object: no grants or policies change.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_chat
  ADD COLUMN IF NOT EXISTS anon_id text CHECK (anon_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  ADD COLUMN IF NOT EXISTS consent_version text CHECK (consent_version ~ '^mira-[0-9-]{10,13}$');

ALTER TABLE public.mira_chat ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.mira_chat DROP CONSTRAINT IF EXISTS mira_chat_owner;
ALTER TABLE public.mira_chat
  ADD CONSTRAINT mira_chat_owner
  CHECK (num_nonnulls(user_id, anon_id) = 1 AND (anon_id IS NULL OR consent_version IS NOT NULL));

COMMENT ON TABLE public.mira_chat IS
  'A chat with Mira: an account''s (user_id), kept while "Remember our conversations" is on, or, from 24 Nov 2026, one kept without an account under its browser id (anon_id) with the consent it was kept under. Exactly one owner.';
COMMENT ON COLUMN public.mira_chat.anon_id IS
  'The browser id (mira_anon cookie) of a chat kept without an account; NULL for an account''s chat. Cleared when a sign-up moves the chat into the account.';
COMMENT ON COLUMN public.mira_chat.consent_version IS
  'The first-message consent wording a signed-out chat was kept under (CONSENT_VERSION); required while anon_id is set.';

COMMIT;
