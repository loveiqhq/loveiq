-- Email suppression list — the source of truth for "do not send" decisions.
--
-- Populated by:
--   - GET/POST /api/unsubscribe (user-initiated unsubscribe links + RFC 8058
--     one-click headers)
--   - POST /api/resend/webhook (auto-add on hard_bounce / complaint events)
--
-- Read by every email sender via @shared/emails/suppression:isEmailSuppressed
-- before calling resend.emails.send.
--
-- This table was originally created out-of-band in production (3 rows already
-- exist on the live DB). This migration backfills it for environment parity
-- so staging, preview branches, and fresh clones don't 404 on the REST calls.
-- All statements are idempotent — applying against prod is a no-op.

CREATE TABLE IF NOT EXISTS public.email_suppression (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  reason text NOT NULL CHECK (reason IN ('unsubscribed', 'hard_bounce', 'complaint')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_suppression_email_idx
  ON public.email_suppression (email);

ALTER TABLE public.email_suppression ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_suppression_service_role_only ON public.email_suppression;
CREATE POLICY email_suppression_service_role_only
  ON public.email_suppression USING (false);
