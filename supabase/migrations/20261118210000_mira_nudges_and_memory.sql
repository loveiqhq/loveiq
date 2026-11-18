-- Mira's daily nudge emails and her 12-month memory (Sanjin's coach config, board 09, and
-- Marcus's nudge unsubscribe boards, 18 Nov 2026). Additive only. Rollback:
-- supabase/rollbacks/20261118210000_mira_nudges_and_memory_down.sql
--
-- mira_user gains the nudge settings each person controls: on or off, the time and time zone,
-- twice a week instead of daily, only some kinds, a pause, and a stop with its optional reason.
-- mira_nudge: one row per nudge sent (at most one per person per local day), with what it said,
--   the chat it became Mira's latest message in, and when its button was clicked.
-- mira_forget_old_memory(months): deletes a person's chats once their last message is older
--   than that ("Memory kept for 12 months after last chat"). A nudge is Mira's message, not the
--   person's, so it never keeps memory alive.
--
-- Service role only, like the other Mira tables.
-- migration-lint: ignore (the index is created on a table created empty in this same file)

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_user
  ADD COLUMN IF NOT EXISTS nudges_on boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS nudge_time text NOT NULL DEFAULT '08:00'
    CHECK (nudge_time IN ('08:00', '19:00', '21:30')),
  ADD COLUMN IF NOT EXISTS time_zone text NOT NULL DEFAULT 'Europe/Berlin'
    CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  ADD COLUMN IF NOT EXISTS nudge_frequency text NOT NULL DEFAULT 'daily'
    CHECK (nudge_frequency IN ('daily', 'twice_weekly')),
  ADD COLUMN IF NOT EXISTS nudge_types text[]
    CHECK (nudge_types IS NULL OR nudge_types <@ ARRAY['agreement', 'progress', 'heard_of', 'root_cause', 'share', 'celebrate']::text[]),
  ADD COLUMN IF NOT EXISTS nudges_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS nudges_stopped_at timestamptz,
  ADD COLUMN IF NOT EXISTS nudge_stop_reason text CHECK (char_length(nudge_stop_reason) <= 600);

CREATE TABLE IF NOT EXISTS public.mira_nudge (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.mira_user (id) ON DELETE CASCADE,
  type        text NOT NULL
    CHECK (type IN ('agreement', 'progress', 'heard_of', 'root_cause', 'share', 'celebrate')),
  subject     text NOT NULL CHECK (char_length(subject) <= 200),
  body        text NOT NULL CHECK (char_length(body) <= 2000),
  local_day   date NOT NULL,
  chat_id     uuid REFERENCES public.mira_chat (id) ON DELETE SET NULL,
  message_id  bigint,
  resend_id   text,
  sent_at     timestamptz,
  clicked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, local_day)
);

CREATE INDEX IF NOT EXISTS mira_nudge_user_created_idx ON public.mira_nudge (user_id, created_at DESC);

ALTER TABLE public.mira_nudge ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mira_nudge FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mira_nudge TO service_role;
DROP POLICY IF EXISTS "Service role only" ON public.mira_nudge;
CREATE POLICY "Service role only" ON public.mira_nudge FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.mira_forget_old_memory(p_months integer)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH last_said AS (
    SELECT c.user_id, max(m.created_at) AS at
    FROM public.mira_chat c
    LEFT JOIN public.mira_message m ON m.chat_id = c.id AND m.role = 'user'
    GROUP BY c.user_id
  ),
  stale AS (
    SELECT user_id FROM last_said
    WHERE coalesce(at, '-infinity'::timestamptz) < now() - make_interval(months => p_months)
  ),
  gone AS (
    DELETE FROM public.mira_chat c USING stale s WHERE c.user_id = s.user_id
      AND c.created_at < now() - make_interval(months => p_months)
    RETURNING 1
  )
  SELECT count(*)::integer FROM gone;
$$;

REVOKE ALL ON FUNCTION public.mira_forget_old_memory(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mira_forget_old_memory(integer) TO service_role;

COMMENT ON TABLE public.mira_nudge IS
  'Mira''s daily nudge emails (features/mira/server/nudges.ts): one per person per local day at most; chat_id/message_id = where it became Mira''s latest message; clicked_at = its button.';
COMMENT ON FUNCTION public.mira_forget_old_memory(integer) IS
  'Deletes a person''s Mira chats once the last message they wrote is older than p_months (12 by the daily cron). Returns the chats deleted.';

COMMIT;
