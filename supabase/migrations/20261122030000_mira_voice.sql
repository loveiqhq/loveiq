-- Talking to Mira by voice, kept as words (22 Nov 2026, features/mira/server/voice.ts). Additive
-- only. Follows 20261121030000. Rollback: supabase/rollbacks/20261122030000_mira_voice_down.sql
--
-- The browser turns speech into text (on the device where it can, else its maker's speech
-- service); each spoken turn goes through /api/mira/chat like a typed one. No audio ever reaches
-- us, and none is stored here.
--
-- mira_message.voice_session: a spoken turn's voice session (an id the browser made when the
--   session began), set by the chat route only while "Remember our conversations" is on. Reads
--   always name the chat too, so the chat's own index serves them and none is added here.
-- mira_voice_session: one row per voice session a signed-in person ended with its turns kept:
--   when it began and ended, its length, the talk share by words, whether speech became text on
--   the device or in the browser's service, and up to three key points Mira's model wrote from
--   its turns (NULL until written; '{}' when there were none to keep, as after a stop rail).
--   opened_at: when the person first opened its key points (AP › Mira's "opened later"). The row
--   goes with its chat (deleting the chat, "Delete all chats", the 12-month forgetting, the
--   under-18 stop) and with the account (ON DELETE CASCADE on both).
--
-- Service role only, like every other Mira object.
-- migration-lint: ignore (the indexes are created on a table created empty in this same file)

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_message
  ADD COLUMN IF NOT EXISTS voice_session uuid;

COMMENT ON COLUMN public.mira_message.voice_session IS
  'A spoken turn''s voice session (mira_voice_session.id, chosen by the browser), set while "Remember our conversations" is on (features/mira/server/voice.ts).';

CREATE TABLE IF NOT EXISTS public.mira_voice_session (
  id          uuid PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES public.mira_user (id) ON DELETE CASCADE,
  chat_id     uuid NOT NULL REFERENCES public.mira_chat (id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL,
  ended_at    timestamptz NOT NULL CHECK (ended_at >= started_at),
  seconds     integer NOT NULL CHECK (seconds BETWEEN 0 AND 10800),
  user_words  integer NOT NULL CHECK (user_words >= 0),
  mira_words  integer NOT NULL CHECK (mira_words >= 0),
  recognition text NOT NULL CHECK (recognition IN ('device', 'service')),
  key_points  text[] CHECK (
                cardinality(key_points) <= 3
                AND char_length(array_to_string(key_points, '')) <= 600
              ),
  opened_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mira_voice_session_user_idx
  ON public.mira_voice_session (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS mira_voice_session_chat_idx
  ON public.mira_voice_session (chat_id);

ALTER TABLE public.mira_voice_session ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mira_voice_session FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mira_voice_session TO service_role;
DROP POLICY IF EXISTS "Service role only" ON public.mira_voice_session;
CREATE POLICY "Service role only" ON public.mira_voice_session
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.mira_voice_session IS
  'A signed-in person''s voice session with Mira, kept as words (features/mira/server/voice.ts): times, talk share by words, recognition (device or the browser''s service), up to three key points (NULL until written), when they were first opened. Its words are the mira_message rows with this voice_session. Never audio.';

COMMIT;
