-- Migration: normalize experiment metrics and keep experiment writes transactional.

CREATE TABLE IF NOT EXISTS admin_experiment_metric (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  experiment_id bigint NOT NULL REFERENCES admin_experiment(id) ON DELETE CASCADE,
  metric_key    text NOT NULL,
  metric_role   text NOT NULL CHECK (metric_role IN ('primary', 'guardrail')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_experiment_metric_unique_role_metric_idx
  ON admin_experiment_metric(experiment_id, metric_role, metric_key);
CREATE UNIQUE INDEX IF NOT EXISTS admin_experiment_metric_one_primary_idx
  ON admin_experiment_metric(experiment_id)
  WHERE metric_role = 'primary';
CREATE INDEX IF NOT EXISTS admin_experiment_metric_metric_idx
  ON admin_experiment_metric(metric_key, metric_role);

ALTER TABLE admin_experiment_metric ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_experiment_metric'
      AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY "service_role_only" ON admin_experiment_metric
      FOR ALL USING (
        (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
      );
  END IF;
END $$;

INSERT INTO admin_experiment_metric (experiment_id, metric_key, metric_role)
SELECT experiment.id, experiment.primary_metric_key, 'primary'
FROM admin_experiment AS experiment
WHERE experiment.primary_metric_key IS NOT NULL
  AND btrim(experiment.primary_metric_key) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO admin_experiment_metric (experiment_id, metric_key, metric_role)
SELECT experiment.id, guardrail.metric_key, 'guardrail'
FROM admin_experiment AS experiment
CROSS JOIN LATERAL jsonb_array_elements_text(
  COALESCE(experiment.guardrail_metric_keys, '[]'::jsonb)
) AS guardrail(metric_key)
WHERE btrim(guardrail.metric_key) <> ''
  AND guardrail.metric_key <> experiment.primary_metric_key
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION admin_upsert_experiment(
  p_admin_email text,
  p_experiment_id bigint DEFAULT NULL,
  p_owner_email text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_hypothesis text DEFAULT NULL,
  p_segment_id bigint DEFAULT NULL,
  p_primary_metric_key text DEFAULT NULL,
  p_guardrail_metric_keys text[] DEFAULT '{}'::text[],
  p_status text DEFAULT 'draft',
  p_start_date date DEFAULT NULL,
  p_decision_date date DEFAULT NULL,
  p_expected_impact text DEFAULT NULL,
  p_result_summary text DEFAULT NULL,
  p_outcome text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_experiment_id bigint;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'name is required';
  END IF;
  IF p_hypothesis IS NULL OR btrim(p_hypothesis) = '' THEN
    RAISE EXCEPTION 'hypothesis is required';
  END IF;
  IF p_primary_metric_key IS NULL OR btrim(p_primary_metric_key) = '' THEN
    RAISE EXCEPTION 'primary metric is required';
  END IF;

  IF p_experiment_id IS NULL THEN
    INSERT INTO admin_experiment (
      admin_email,
      owner_email,
      name,
      hypothesis,
      segment_id,
      primary_metric_key,
      guardrail_metric_keys,
      status,
      start_date,
      decision_date,
      expected_impact,
      result_summary,
      outcome
    )
    VALUES (
      p_admin_email,
      p_owner_email,
      p_name,
      p_hypothesis,
      p_segment_id,
      p_primary_metric_key,
      to_jsonb(COALESCE(p_guardrail_metric_keys, '{}'::text[])),
      p_status,
      p_start_date,
      p_decision_date,
      p_expected_impact,
      p_result_summary,
      p_outcome
    )
    RETURNING id INTO v_experiment_id;
  ELSE
    UPDATE admin_experiment
    SET owner_email = p_owner_email,
        name = p_name,
        hypothesis = p_hypothesis,
        segment_id = p_segment_id,
        primary_metric_key = p_primary_metric_key,
        guardrail_metric_keys = to_jsonb(COALESCE(p_guardrail_metric_keys, '{}'::text[])),
        status = p_status,
        start_date = p_start_date,
        decision_date = p_decision_date,
        expected_impact = p_expected_impact,
        result_summary = p_result_summary,
        outcome = p_outcome,
        updated_at = now()
    WHERE id = p_experiment_id
    RETURNING id INTO v_experiment_id;

    IF v_experiment_id IS NULL THEN
      RAISE EXCEPTION 'experiment not found';
    END IF;

    DELETE FROM admin_experiment_metric WHERE experiment_id = v_experiment_id;
  END IF;

  INSERT INTO admin_experiment_metric (experiment_id, metric_key, metric_role)
  VALUES (v_experiment_id, p_primary_metric_key, 'primary');

  INSERT INTO admin_experiment_metric (experiment_id, metric_key, metric_role)
  SELECT v_experiment_id, guardrail.metric_key, 'guardrail'
  FROM (
    SELECT DISTINCT btrim(metric_key) AS metric_key
    FROM unnest(COALESCE(p_guardrail_metric_keys, '{}'::text[])) AS metric_key
  ) AS guardrail
  WHERE guardrail.metric_key <> ''
    AND guardrail.metric_key <> p_primary_metric_key;

  RETURN v_experiment_id;
END;
$$;;
