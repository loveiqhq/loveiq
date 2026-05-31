-- Persisted weekly Slack-digest recommendations.
--
-- Each Monday's funnel-digest cron writes one row per emitted recommendation
-- AFTER the Slack message is successfully delivered. The NEXT Monday's cron
-- reads the last 4 weeks of rows and renders a "Revisited from last week"
-- section that classifies each prior recommendation as resolved / ongoing /
-- worsened, closing the action → outcome loop for the strategy lead.
--
-- UNIQUE on (week_key, rule) makes cron retries idempotent — `Prefer:
-- resolution=merge-duplicates` upserts cleanly.
--
-- No PII: messages + evidence contain question IDs, answer-option labels
-- (admin-controlled), and aggregate counts. Safe to retain indefinitely
-- (~260 rows / year at 5 recs/week).

-- migration-lint: ignore
-- (Reason: the index below is built on digest_recommendation_history, a table
--  CREATEd in this same migration — so it is empty at index-build time and the
--  CONCURRENTLY requirement does not apply. Already applied to prod.)

CREATE TABLE IF NOT EXISTS public.digest_recommendation_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  week_key TEXT NOT NULL,
  rule TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('high', 'med', 'low')),
  message TEXT NOT NULL,
  evidence TEXT NOT NULL,
  -- Structured snapshot of the metric values that triggered the rule. Read
  -- by next week's classifyRevisited() for resolved/worsened comparison.
  fingerprint JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT digest_recommendation_history_week_rule_key UNIQUE (week_key, rule)
);

CREATE INDEX IF NOT EXISTS idx_drh_week_created
  ON public.digest_recommendation_history (week_key, created_at);

ALTER TABLE public.digest_recommendation_history ENABLE ROW LEVEL SECURITY;

-- Service-role-only via the fail-closed pattern used by other admin tables.
-- Only service-role bypasses RLS (per supabase config); anon/authenticated
-- never see this data.
CREATE POLICY service_role_only
  ON public.digest_recommendation_history
  FOR ALL USING (false);

COMMENT ON TABLE public.digest_recommendation_history IS
  'Weekly Slack-digest recommendation history. Read by next week''s cron to render the loop-closure "Revisited from last week" section.';
