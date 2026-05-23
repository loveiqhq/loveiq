-- Per-cron run history. Every cron route writes one row on completion via
-- recordCronRun() in shared/observability/slack-alert-dedup.ts. Tech-digest
-- reads this for real success-rate + p95-duration metrics; previous proxy
-- (slack_alert_sent rows for kind=cron_slow) only surfaced ALERTS, not runs.
--
-- Insert-only table — never updated, never deleted. Retention is implicit
-- via the (cron_name, started_at DESC) index that keeps tech-digest's
-- 24-hour scan cheap.

CREATE TABLE IF NOT EXISTS public.cron_run (
  id            BIGSERIAL PRIMARY KEY,
  cron_name     TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  duration_ms   BIGINT,
  status        TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_cron_run_name_started
  ON public.cron_run (cron_name, started_at DESC);

-- Tech-digest also runs an all-rows-in-window scan; this index supports it.
CREATE INDEX IF NOT EXISTS idx_cron_run_started
  ON public.cron_run (started_at DESC);

ALTER TABLE public.cron_run ENABLE ROW LEVEL SECURITY;
-- No policies = anon/authenticated have no access; service role bypasses RLS.

COMMENT ON TABLE public.cron_run IS
  'Per-cron run history. Insert-only. Drives tech-digest cron-health section.';
