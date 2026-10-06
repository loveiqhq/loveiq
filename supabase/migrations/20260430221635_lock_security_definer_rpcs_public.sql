-- ═══════════════════════════════════════════════════════════════════════════
-- Lock SECURITY DEFINER RPCs from the PUBLIC pseudo-role
-- ═══════════════════════════════════════════════════════════════════════════
-- Supabase grants EXECUTE on functions to PUBLIC by default (PUBLIC includes
-- anon + authenticated). The previous migration only revoked from the named
-- roles, leaving the PUBLIC grant intact — Supabase advisors continued to
-- flag the four functions as anon-callable. Both grants must be revoked.
--
-- All four are called server-side via the service-role key, which bypasses
-- EXECUTE checks, so this is safe.

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
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.submit_survey(
  p_email text, p_first_name text, p_answers jsonb,
  p_started_at timestamp with time zone, p_duration_ms bigint,
  p_utm_tracker text, p_session_id uuid
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(
  p_key text, p_limit integer, p_window_ms bigint, p_now bigint
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.get_report_pricing_metrics(
  since_ts timestamp with time zone, plan_filter text
) FROM PUBLIC;
