-- Migration: admin strategy wave 2
-- Adds persisted experiment registry and managed benchmark sources.

CREATE TABLE IF NOT EXISTS admin_experiment (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email           text NOT NULL,
  owner_email           text,
  name                  text NOT NULL,
  hypothesis            text NOT NULL,
  segment_id            bigint REFERENCES admin_segment(id) ON DELETE SET NULL,
  primary_metric_key    text NOT NULL,
  guardrail_metric_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  status                text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  start_date            date,
  decision_date         date,
  expected_impact       text,
  result_summary        text,
  outcome               text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_experiment_status_idx ON admin_experiment(status);
CREATE INDEX IF NOT EXISTS admin_experiment_owner_idx ON admin_experiment(owner_email);
CREATE INDEX IF NOT EXISTS admin_experiment_segment_idx ON admin_experiment(segment_id);
CREATE INDEX IF NOT EXISTS admin_experiment_updated_idx ON admin_experiment(updated_at DESC);

ALTER TABLE admin_experiment ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_experiment'
      AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY "service_role_only" ON admin_experiment
      FOR ALL USING (
        (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS admin_metric_benchmark (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email    text NOT NULL,
  metric_key     text NOT NULL,
  label          text NOT NULL,
  description    text,
  source_name    text NOT NULL,
  source_url     text,
  benchmark_type text NOT NULL DEFAULT 'internal'
                 CHECK (benchmark_type IN ('internal', 'category', 'competitive')),
  target_value   numeric NOT NULL,
  warning_value  numeric NOT NULL,
  direction      text NOT NULL CHECK (direction IN ('higher', 'lower')),
  unit           text NOT NULL CHECK (unit IN ('percent', 'minutes', 'count')),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_metric_benchmark_metric_idx
  ON admin_metric_benchmark(metric_key, is_active);
CREATE INDEX IF NOT EXISTS admin_metric_benchmark_updated_idx
  ON admin_metric_benchmark(updated_at DESC);

ALTER TABLE admin_metric_benchmark ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_metric_benchmark'
      AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY "service_role_only" ON admin_metric_benchmark
      FOR ALL USING (
        (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
      );
  END IF;
END $$;;
