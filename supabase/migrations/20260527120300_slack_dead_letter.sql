-- P-09: dead-letter table for Slack notifications that failed to deliver
--
-- Problem: shared/observability/slack.ts catches webhook errors, logs a
-- `warn`, and drops the message. When Slack is having an incident, every
-- 5xx error / cron failure / disputed payment alert vanishes. Without
-- Sentry (R-24 was deferred), the warn logs are the only trace and they're
-- noisy enough to be easy to miss.
--
-- Fix: when a Slack send fails, append the attempt to slack_dead_letter so
-- an operator can pull missed alerts after the incident resolves. The
-- table is intentionally small and append-only; a purge cron can prune
-- entries older than 30 days (mirrors the `cron_run` retention).

BEGIN;

CREATE TABLE IF NOT EXISTS slack_dead_letter (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel         text NOT NULL,
  kind            text NOT NULL,
  text            text NOT NULL,
  username        text,
  failure_reason  text NOT NULL,
  http_status     integer,
  attempted_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE slack_dead_letter ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON slack_dead_letter USING (false);

COMMIT;

-- Operator-friendly: most-recent-first index for queries like
-- `SELECT * FROM slack_dead_letter WHERE channel='ops' ORDER BY attempted_at DESC LIMIT 50`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_slack_dl_attempted_at
  ON slack_dead_letter (attempted_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_slack_dl_channel_kind
  ON slack_dead_letter (channel, kind);
