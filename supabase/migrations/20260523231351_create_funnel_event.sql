-- Top-of-funnel signals captured before a survey_submission exists, so they
-- can't live in analytics_event (which has a NOT NULL FK to survey_submission).
--
-- One row per (visitor_id, day, event_type). The PK guarantees idempotency
-- across client retries and across deploys — the route inserts with
-- Prefer: resolution=ignore-duplicates so a PK conflict is a silent no-op.
--
-- Consumed by the daily Slack digest (features/admin/server/digest-metrics.ts)
-- to render Unique visitors + "Saw Q1" rows in the Acquisition block.

CREATE TABLE IF NOT EXISTS public.funnel_event (
  visitor_id UUID NOT NULL,
  day DATE NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('unique_visitor', 'survey_engine_mount')),
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  utm_source TEXT,
  PRIMARY KEY (visitor_id, day, event_type)
);

CREATE INDEX IF NOT EXISTS idx_funnel_event_day_event
  ON public.funnel_event (day, event_type);

-- Lock down: service role bypasses RLS; anon/authenticated get nothing.
-- Matches the posture of other top-of-funnel tables (slack_alert_sent etc).
ALTER TABLE public.funnel_event ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.funnel_event IS
  'Top-of-funnel signals (unique_visitor, survey_engine_mount) captured before survey_submission exists. PK enforces (visitor_id, day, event_type) idempotency.';
