-- Each nurture email's own delivery, opens and clicks (14 Oct 2026), for the campaign table on
-- the admin's Report page (ap_report_extras, 20261014130000). The nurture send tags every email
-- with its stage and the reader's submission (app/api/cron/nurture-sequence), Resend echoes the
-- tags back on every webhook, and the webhook (app/api/resend/webhook) keeps one row per email
-- and kind of event: the first. A retry or a second open adds nothing (the key).
--
-- Ids and a time only: never the address, the IP, the user agent or the clicked link, which
-- carries the report token and the promo code. Disclosed in the privacy policy (7.3) and in the
-- marketing opt-in's text (T-11 version 2026-10-14). Erased with the submission (the cascade
-- below); 180 days in the retention purge once that runs (app/api/cron/purge-old-data).
--
-- resend_id, not email_id: a column name with "mail" in it stops the team data export until it
-- is classified (features/admin/server/team-export.ts). No other index: a few rows per email.
-- Rollback: supabase/rollbacks/20261014120300_email_message_event_down.sql.

CREATE TABLE IF NOT EXISTS public.email_message_event (
  resend_id            text NOT NULL,
  event_type           text NOT NULL CHECK (event_type ~ '^[a-z_]{1,32}$'),
  stage                text NOT NULL CHECK (length(stage) <= 64),
  survey_submission_id bigint NOT NULL REFERENCES public.survey_submission(id) ON DELETE CASCADE,
  first_at             timestamptz NOT NULL,
  PRIMARY KEY (resend_id, event_type)
);

ALTER TABLE public.email_message_event ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_message_event_service_only ON public.email_message_event;
CREATE POLICY email_message_event_service_only ON public.email_message_event
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.email_message_event FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_message_event TO service_role;

COMMENT ON TABLE public.email_message_event IS
  'Each nurture email''s delivery, opens and clicks: the first of each kind per email, from the Resend webhook, by the stage and submission the send tagged it with. Ids and a time only, never the address, IP, user agent or the link clicked.';
COMMENT ON COLUMN public.email_message_event.resend_id IS 'Resend''s id for the email.';
COMMENT ON COLUMN public.email_message_event.event_type IS 'delivered, opened, clicked or bounced.';
COMMENT ON COLUMN public.email_message_event.stage IS 'Which nurture email, as its campaign: 72h_no_unlock.';
COMMENT ON COLUMN public.email_message_event.survey_submission_id IS 'The reader the email went to, by their submission.';
COMMENT ON COLUMN public.email_message_event.first_at IS 'When it happened (Resend''s time), for the first one received.';
