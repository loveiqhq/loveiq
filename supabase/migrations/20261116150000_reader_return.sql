-- A reader coming back after their first visit: one row per reader per Berlin day, the record
-- behind the "Came back" reply in their #incoming-surveys thread
-- (features/attribution/server/return-ping.ts) and behind AP-Analytics' "Came back within 7 days"
-- (the Report page, under Returns). Software Board card "Ping #incoming-surveys when a reader
-- comes back" (LoveIQ Sync, 11 Nov 2026). Additive only. Rollback:
-- supabase/rollbacks/20261116150000_reader_return_down.sql
--
-- The key (survey_submission_id, day) is the "once per reader per day": the row is claimed
-- BEFORE the Slack reply goes out, so a second return that day, or a retried webhook, posts
-- nothing. A reply lost after its claim is preferred to a double one.
--
-- source: 'report' (their report link opened on a later Berlin day than they finished the
-- survey), 'email' (a click in one of our emails, Resend's email.clicked), 'answer' (the
-- unlock-feedback question answered), 'draft' (a survey finished on a later Berlin day than it
-- was begun). via: the email that brought them, as its link's utm_campaign or its Resend stage
-- tag, 'email' for one of our links that names none, null when no email did. slack_ts: the
-- thread reply's ts once posted; null when none went out (no stored message to reply to, no bot,
-- or Slack refused it).
--
-- Ids, times and labels only: no address, IP or user agent. Erased with its submission.
--
-- APPLY BEFORE THE DEPLOY. Without the table every claim is refused: nothing is posted and no
-- request fails, but supabaseFetch logs each refused write at error level, which posts "write
-- REJECTED" to #prod-alerts for every later-day report visit and email click.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.reader_return (
  survey_submission_id bigint NOT NULL REFERENCES public.survey_submission (id) ON DELETE CASCADE,
  day                  date NOT NULL,
  returned_at          timestamptz NOT NULL,
  source               text NOT NULL CHECK (source IN ('report', 'email', 'answer', 'draft')),
  via                  text CHECK (via ~ '^[A-Za-z0-9_.-]{1,64}$'),
  slack_ts             text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (survey_submission_id, day)
);

ALTER TABLE public.reader_return ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.reader_return FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.reader_return TO service_role;

DROP POLICY IF EXISTS "Service role only" ON public.reader_return;

CREATE POLICY "Service role only"
ON public.reader_return
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMENT ON TABLE public.reader_return IS
  'A reader back after their first visit, once per Berlin day: the #incoming-surveys "Came back" reply (features/attribution/server/return-ping.ts) and AP''s "Came back within 7 days". Claimed before the reply.';
COMMENT ON COLUMN public.reader_return.source IS
  'report (report link on a later day than the survey), email (a click in our email), answer (unlock-feedback question), draft (survey finished on a later day than begun).';
COMMENT ON COLUMN public.reader_return.via IS
  'The email that brought them: its link''s utm_campaign or its Resend stage tag; email = one of our links naming none; null = no email.';
COMMENT ON COLUMN public.reader_return.slack_ts IS
  'The thread reply''s ts once posted; null when none went out.';

COMMIT;
