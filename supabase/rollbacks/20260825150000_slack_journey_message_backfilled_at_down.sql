-- Rollback for 20260825150000. Drops only the idempotency marker; the live
-- message ids in channel/message_ts are untouched.
ALTER TABLE slack_journey_message DROP COLUMN IF EXISTS backfilled_at;
