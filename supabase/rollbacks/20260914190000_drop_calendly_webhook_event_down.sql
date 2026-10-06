-- Recreate calendly_webhook_event exactly as 20260601120000_booking_event.sql made it.
-- Copied from that migration verbatim rather than retyped — a rollback that restores a
-- DIFFERENT shape is worse than none, and the first draft of this file got the primary
-- key wrong (it used event_key, where the original has a generated id and event_key
-- merely UNIQUE).
--
-- Restoring the table does NOT restore the integration: the webhook route, the signature
-- verification and the 78h call-invite stage were deleted in code on 2026-09-14.

CREATE TABLE IF NOT EXISTS calendly_webhook_event (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key    text NOT NULL UNIQUE,
  event_type   text NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calendly_webhook_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON calendly_webhook_event USING (false);
