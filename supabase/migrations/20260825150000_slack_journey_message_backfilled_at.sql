-- Marks a submission whose Slack journey message has been re-rendered in the
-- current format by /api/cron/journey-backfill.
--
-- WHY A COLUMN RATHER THAN INFERENCE. The backfill posts ~81 messages into a
-- Slack thread, and Slack has no idempotency key. Without a durable marker,
-- pressing "Run" twice in the Vercel dashboard would post the whole week again.
-- `message_ts` cannot serve: 69 of the 81 had no row at all (they were posted by
-- the incoming webhook, a different Slack app, so they are not editable), and
-- the other 12 already have a ts that must NOT be overwritten — it is the live
-- message their future milestones still update.
--
-- Nullable with no default: existing rows are correctly "not backfilled".
ALTER TABLE slack_journey_message
  ADD COLUMN IF NOT EXISTS backfilled_at TIMESTAMPTZ;

COMMENT ON COLUMN slack_journey_message.backfilled_at IS
  'Set when journey-backfill has re-posted this submission into the catch-up thread. Idempotency marker; NULL means not yet done.';
