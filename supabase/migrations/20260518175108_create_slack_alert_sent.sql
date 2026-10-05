-- Cross-deploy / multi-instance dedup for Slack alerts emitted by detector
-- crons (abandoned checkout, deep-engagement no-convert, paywall view burst,
-- rate-limit storms, CSRF storms). The in-memory Map dedup inside
-- shared/observability/slack.ts handles per-process burst suppression, but
-- crons fire on cold serverless instances that don't share that state — so
-- without this table the same (kind, entity) would re-ping on every cron run.
--
-- (kind, entity_type, entity_id) is the natural dedup key. entity_id is text
-- so it can hold a bigint id, an IP string, or an email hash interchangeably.
-- Idempotent migration: safe to re-run.

CREATE TABLE IF NOT EXISTS public.slack_alert_sent (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_slack_alert_sent_kind_sent
  ON public.slack_alert_sent (kind, sent_at DESC);

COMMENT ON TABLE public.slack_alert_sent IS
  'Cross-deploy dedup for cron-emitted Slack alerts. Insert with ON CONFLICT DO NOTHING; if RETURNING returns a row, fire the alert.';
