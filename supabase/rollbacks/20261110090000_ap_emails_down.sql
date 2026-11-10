-- Rollback of 20261110090000_ap_emails.sql: the Emails pages' reader, and the version column.
-- Dropping the column loses the versions kept since; the webhook must be rolled back first, or
-- every per-reader event it writes with a version fails.

DROP FUNCTION IF EXISTS public.ap_emails(date, date, jsonb);

ALTER TABLE public.email_message_event DROP COLUMN IF EXISTS variant;

COMMENT ON TABLE public.email_message_event IS
  'Each nurture email''s delivery, opens and clicks: the first of each kind per email, from the Resend webhook, by the stage and submission the send tagged it with. Ids and a time only, never the address, IP, user agent or the link clicked.';
COMMENT ON COLUMN public.email_message_event.event_type IS 'delivered, opened, clicked or bounced.';
COMMENT ON COLUMN public.email_message_event.stage IS 'Which nurture email, as its campaign: 72h_no_unlock.';
