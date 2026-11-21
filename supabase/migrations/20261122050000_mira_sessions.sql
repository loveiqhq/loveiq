-- Mira's weekly sessions (Marcus, 17 Nov 2026: "a weekly 15-min session question with time slots";
-- Sanjin's coach config: "Always schedule the next session and send a calendar invite before
-- ending"). Additive only. Follows 20261121030000.
-- Rollback: supabase/rollbacks/20261122050000_mira_sessions_down.sql
--
-- mira_session_slot: one weekly slot per person, booked in the app (the chat's time picker, Home
--   or Settings): an ISO weekday (1 Monday ... 7 Sunday), a local time and an IANA time zone, 15
--   minutes. Its id is the calendar invite's UID, and `sequence` rises with every change so
--   calendar apps apply the newest; paused_at = reminder emails paused (the slot stays). Cancelling
--   deletes the row after the cancellation email; a later booking is a new series (a new id).
-- mira_session_reminder: one row per reminder email, claimed before it is sent, so each start gets
--   at most one (UNIQUE slot_id, starts_at); joined_at = the person opened that session within 30
--   minutes of its start (attendance). Deleted with its slot.
--
-- No words here: times only. Service role only, like every other Mira object.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.mira_session_slot (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL UNIQUE REFERENCES public.mira_user (id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  local_time  text NOT NULL CHECK (local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  time_zone   text NOT NULL CHECK (char_length(time_zone) BETWEEN 1 AND 64),
  sequence    integer NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  paused_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mira_session_reminder (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id     uuid NOT NULL REFERENCES public.mira_session_slot (id) ON DELETE CASCADE,
  starts_at   timestamptz NOT NULL,
  joined_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slot_id, starts_at)
);

ALTER TABLE public.mira_session_slot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mira_session_slot FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mira_session_slot TO service_role;
DROP POLICY IF EXISTS "Service role only" ON public.mira_session_slot;
CREATE POLICY "Service role only" ON public.mira_session_slot FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.mira_session_reminder ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mira_session_reminder FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mira_session_reminder TO service_role;
DROP POLICY IF EXISTS "Service role only" ON public.mira_session_reminder;
CREATE POLICY "Service role only" ON public.mira_session_reminder FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.mira_session_slot IS
  'Mira weekly sessions (features/mira/server/weekly-sessions.ts): one slot per person, an ISO weekday, a local time and an IANA zone, 15 minutes; id = the invite''s UID, sequence = its update count, paused_at = reminders paused. Deleted on cancel, with the account, or when Mira stops someone as under 18.';
COMMENT ON TABLE public.mira_session_reminder IS
  'One reminder email per weekly-session start (claimed before sending); joined_at = the session opened within 30 minutes of starts_at.';

COMMIT;
