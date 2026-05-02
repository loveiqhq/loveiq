ALTER TABLE public.admin_experiment
  ADD COLUMN IF NOT EXISTS readout_method text
    CHECK (readout_method IN ('conversion-rate')),
  ADD COLUMN IF NOT EXISTS control_sample_size integer,
  ADD COLUMN IF NOT EXISTS control_success_count integer,
  ADD COLUMN IF NOT EXISTS variant_sample_size integer,
  ADD COLUMN IF NOT EXISTS variant_success_count integer,
  ADD COLUMN IF NOT EXISTS readout_notes text;

ALTER TABLE public.admin_experiment
  ALTER COLUMN readout_method SET DEFAULT 'conversion-rate';

ALTER TABLE public.admin_experiment
  DROP CONSTRAINT IF EXISTS admin_experiment_readout_nonnegative;

ALTER TABLE public.admin_experiment
  ADD CONSTRAINT admin_experiment_readout_nonnegative
  CHECK (
    (control_sample_size IS NULL OR control_sample_size >= 0) AND
    (control_success_count IS NULL OR control_success_count >= 0) AND
    (variant_sample_size IS NULL OR variant_sample_size >= 0) AND
    (variant_success_count IS NULL OR variant_success_count >= 0) AND
    (control_sample_size IS NULL OR control_success_count IS NULL OR control_success_count <= control_sample_size) AND
    (variant_sample_size IS NULL OR variant_success_count IS NULL OR variant_success_count <= variant_sample_size)
  );

CREATE OR REPLACE FUNCTION public.admin_upsert_experiment(
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
  p_outcome text DEFAULT NULL,
  p_readout_method text DEFAULT 'conversion-rate',
  p_control_sample_size integer DEFAULT NULL,
  p_control_success_count integer DEFAULT NULL,
  p_variant_sample_size integer DEFAULT NULL,
  p_variant_success_count integer DEFAULT NULL,
  p_readout_notes text DEFAULT NULL
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

  IF p_readout_method IS NOT NULL AND p_readout_method <> 'conversion-rate' THEN
    RAISE EXCEPTION 'unsupported readout method';
  END IF;

  IF p_experiment_id IS NULL THEN
    INSERT INTO public.admin_experiment (
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
      outcome,
      readout_method,
      control_sample_size,
      control_success_count,
      variant_sample_size,
      variant_success_count,
      readout_notes
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
      p_outcome,
      p_readout_method,
      p_control_sample_size,
      p_control_success_count,
      p_variant_sample_size,
      p_variant_success_count,
      p_readout_notes
    )
    RETURNING id INTO v_experiment_id;
  ELSE
    UPDATE public.admin_experiment
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
        readout_method = p_readout_method,
        control_sample_size = p_control_sample_size,
        control_success_count = p_control_success_count,
        variant_sample_size = p_variant_sample_size,
        variant_success_count = p_variant_success_count,
        readout_notes = p_readout_notes,
        updated_at = now()
    WHERE id = p_experiment_id
    RETURNING id INTO v_experiment_id;

    IF v_experiment_id IS NULL THEN
      RAISE EXCEPTION 'experiment not found';
    END IF;

    DELETE FROM public.admin_experiment_metric WHERE experiment_id = v_experiment_id;
  END IF;

  INSERT INTO public.admin_experiment_metric (experiment_id, metric_key, metric_role)
  VALUES (v_experiment_id, p_primary_metric_key, 'primary');

  INSERT INTO public.admin_experiment_metric (experiment_id, metric_key, metric_role)
  SELECT v_experiment_id, guardrail.metric_key, 'guardrail'
  FROM (
    SELECT DISTINCT btrim(metric_key) AS metric_key
    FROM unnest(COALESCE(p_guardrail_metric_keys, '{}'::text[])) AS metric_key
  ) AS guardrail
  WHERE guardrail.metric_key <> ''
    AND guardrail.metric_key <> p_primary_metric_key;

  RETURN v_experiment_id;
END;
$$;
