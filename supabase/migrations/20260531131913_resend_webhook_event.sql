-- R-02: Application-level idempotency for the Resend webhook.
--
-- Svix verifies signatures and enforces a 5-min timestamp tolerance, but if
-- Resend retries an event within that window (transient 5xx, network blip)
-- we'd double-process: suppression added twice, Slack pinged twice, daily
-- engagement counter bumped twice.
--
-- Same shape as `payment_webhook_event`'s idempotency design: UNIQUE on the
-- vendor's event id. The webhook handler tries to INSERT the svix_id before
-- doing any side-effect work; ON CONFLICT means "already handled, return ok."

BEGIN;

CREATE TABLE IF NOT EXISTS resend_webhook_event (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  svix_id      text NOT NULL UNIQUE,
  event_type   text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE resend_webhook_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON resend_webhook_event USING (false);

COMMIT;

-- Tail index for the retention purge (cron filters by received_at < cutoff).
-- Concurrent to avoid blocking the brand-new (empty) table — pattern matters
-- when the table grows large in prod.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resend_webhook_event_received_at
  ON resend_webhook_event (received_at DESC);
