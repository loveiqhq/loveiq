-- Call-funnel capture for the 78h "book a call" nurture stage.
--
-- booking_event is the per-user call funnel. A `call_invite_sent` row is
-- written by the nurture cron when the 78h email goes out; `call_booked` /
-- `call_canceled` rows by the Calendly webhook (app/api/calendly/webhook); and
-- `call_coupon_sent` by the admin "grant post-call 100% coupon" action. All
-- four surface in the admin submission timeline.
--
-- calendly_webhook_event is application-level idempotency for that webhook
-- (same shape as resend_webhook_event): Calendly can retry an event within its
-- delivery window, and we must not insert a booking row twice. The handler
-- claims event_key before any side-effect; ON CONFLICT means "already handled."
--
-- Both tables are service-role-only (RLS denies all; the service role key
-- bypasses RLS). No anon/authenticated access.

BEGIN;

CREATE TABLE IF NOT EXISTS booking_event (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  survey_submission_id  bigint REFERENCES survey_submission (id) ON DELETE SET NULL,
  personal_report_id    bigint REFERENCES personal_report (id) ON DELETE SET NULL,
  email                 text,
  event_type            text NOT NULL CHECK (
                          event_type IN (
                            'call_invite_sent',
                            'call_booked',
                            'call_canceled',
                            'call_coupon_sent'
                          )
                        ),
  source_campaign       text,
  calendly_event_uri    text,
  calendly_invitee_uri  text,
  scheduled_at          timestamptz,
  raw                   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE booking_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON booking_event USING (false);

CREATE TABLE IF NOT EXISTS calendly_webhook_event (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key    text NOT NULL UNIQUE,
  event_type   text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calendly_webhook_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON calendly_webhook_event USING (false);

COMMIT;

-- Indexes created CONCURRENTLY outside the transaction (Postgres requirement +
-- the pattern our migration lint enforces). Tables are brand new, so the cost
-- is identical to a plain CREATE INDEX.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_event_submission
  ON booking_event (survey_submission_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_event_email
  ON booking_event (email);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_booking_event_created_at
  ON booking_event (created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calendly_webhook_event_received_at
  ON calendly_webhook_event (received_at DESC);
