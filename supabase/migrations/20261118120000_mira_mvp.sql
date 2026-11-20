-- Mira, the AI coach for body confidence (MVP beta, AI Mira Synch 17 Nov 2026, Marcus's canvas
-- "AI coach chat"). Four new tables, additive only. Rollback:
-- supabase/rollbacks/20261118120000_mira_mvp_down.sql
--
-- mira_user: one row per signed-up Mira account, keyed by its Supabase Auth user. Holds what
--   the person told us (name, country, gender), their coaching style, the two switches on
--   "What Mira may use", and the consent they gave (time + text version). Created at sign-in.
-- mira_chat / mira_message: a signed-in person's chats, kept only while "Remember our
--   conversations" is on. Anonymous chats are never stored here (they live in the browser).
-- mira_event: the KPI log behind "MVP success" (chats started, messages, sign-ups, ratings,
--   feedback, notify-me). anon_id is a random browser id, never an IP or address.
--
-- Deleting an account deletes its auth user, which cascades to mira_user, its chats and their
-- messages; its events keep their counts but lose the link (user_id set null).
--
-- Service role only, like every other table: the browser never talks to these directly.
-- migration-lint: ignore (the indexes are created on tables created empty in this same file)

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.mira_user (
  id              uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email           text NOT NULL,
  name            text CHECK (char_length(name) <= 60),
  country         text CHECK (country ~ '^[A-Z]{2}$' OR country = 'OTHER'),
  gender          text CHECK (char_length(gender) <= 40),
  style           jsonb NOT NULL DEFAULT '{}'::jsonb,
  remember_chats  boolean NOT NULL DEFAULT true,
  use_assessment  boolean NOT NULL DEFAULT true,
  consent_at      timestamptz NOT NULL,
  consent_version text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mira_chat (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.mira_user (id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT 'New chat' CHECK (char_length(title) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mira_chat_user_updated_idx ON public.mira_chat (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.mira_message (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chat_id    uuid NOT NULL REFERENCES public.mira_chat (id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text NOT NULL CHECK (char_length(content) <= 8000),
  sources    jsonb,
  rating     smallint CHECK (rating IN (-1, 1)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mira_message_chat_idx ON public.mira_message (chat_id, id);

CREATE TABLE IF NOT EXISTS public.mira_event (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL CHECK (name ~ '^[a-z_]{2,40}$'),
  anon_id    text CHECK (anon_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  user_id    uuid REFERENCES public.mira_user (id) ON DELETE SET NULL,
  props      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mira_event_name_created_idx ON public.mira_event (name, created_at DESC);

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mira_user', 'mira_chat', 'mira_message', 'mira_event'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "Service role only" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Service role only" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

REVOKE ALL ON SEQUENCE public.mira_message_id_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.mira_event_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mira_message_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.mira_event_id_seq TO service_role;

COMMENT ON TABLE public.mira_user IS
  'A Mira account (features/mira): profile, coaching style, what Mira may use, and the consent given at sign-in. Keyed by the Supabase Auth user; deleting that user deletes this row and its chats.';
COMMENT ON TABLE public.mira_chat IS
  'A signed-in person''s chat with Mira, kept only while "Remember our conversations" is on.';
COMMENT ON TABLE public.mira_message IS
  'One message in a mira_chat. sources = the evidence cards the reply cited; rating = the person''s thumbs up (1) or down (-1).';
COMMENT ON TABLE public.mira_event IS
  'Mira''s KPI log (chats started, messages, sign-ups, ratings, feedback, notify-me). anon_id = a random browser id; no IP or address.';

COMMIT;
