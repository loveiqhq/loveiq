-- Rollback of 20261119200000_reader_return_reactivation_post.sql: where each #report-reactivations
-- post went. Dropping the columns only stops the posts being redrawn; the returns themselves
-- stay. Unset SLACK_REACTIVATIONS_CHANNEL_ID first: with the channel set and the columns gone,
-- every post's stored ts is refused, which logs "write REJECTED" to #prod-alerts.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.reader_return
  DROP COLUMN IF EXISTS reactivation_ts,
  DROP COLUMN IF EXISTS reactivation_channel;

COMMIT;
