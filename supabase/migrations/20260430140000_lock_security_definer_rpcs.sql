-- ═══════════════════════════════════════════════════════════════════════════
-- Lock SECURITY DEFINER RPCs from public roles
-- ═══════════════════════════════════════════════════════════════════════════
-- All four functions below are called only from server code via the
-- service-role key. The service role bypasses EXECUTE grants, so removing
-- public EXECUTE access is safe and closes the
-- `anon_security_definer_function_executable` Supabase advisory.
--
-- Without this, anonymous visitors could call admin_upsert_experiment via
-- /rest/v1/rpc/admin_upsert_experiment and bypass the admin allowlist that
-- the API layer enforces.

REVOKE EXECUTE ON FUNCTION public.admin_upsert_experiment(
  p_admin_email text, p_experiment_id bigint, p_owner_email text, p_name text,
  p_hypothesis text, p_segment_id bigint, p_primary_metric_key text,
  p_guardrail_metric_keys text[], p_status text, p_start_date date,
  p_decision_date date, p_expected_impact text, p_result_summary text,
  p_outcome text, p_readout_method text, p_control_sample_size integer,
  p_control_success_count integer, p_variant_sample_size integer,
  p_variant_success_count integer, p_control_metric_value numeric,
  p_variant_metric_value numeric, p_control_stddev_value numeric,
  p_variant_stddev_value numeric, p_readout_notes text
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.submit_survey(
  p_email text, p_first_name text, p_answers jsonb,
  p_started_at timestamp with time zone, p_duration_ms bigint,
  p_utm_tracker text, p_session_id uuid
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(
  p_key text, p_limit integer, p_window_ms bigint, p_now bigint
) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_report_pricing_metrics(
  since_ts timestamp with time zone, plan_filter text
) FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Pin search_path on update_report_feedback_timestamp
-- ═══════════════════════════════════════════════════════════════════════════
-- Without an explicit search_path, a malicious schema in the role's
-- search_path could shadow public functions/operators referenced inside the
-- function body. Pinning closes the `function_search_path_mutable` advisory.

ALTER FUNCTION public.update_report_feedback_timestamp() SET search_path = public, pg_temp;
