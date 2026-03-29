-- Migration: Harden admin investigation and snapshot surfaces

-- ---------------------------------------------------------------------------
-- 1. Lock down admin investigation cases
-- ---------------------------------------------------------------------------

ALTER TABLE public.admin_investigation_case ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_investigation_case;

CREATE POLICY service_role_only
ON public.admin_investigation_case
FOR ALL
USING (false)
WITH CHECK (false);

REVOKE ALL ON TABLE public.admin_investigation_case FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_investigation_case TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'admin_investigation_case_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_investigation_case_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_investigation_case_id_seq TO service_role;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Remove direct API access to the admin submission snapshot
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.admin_submission_facts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_submission_facts TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Lock down admin RPCs/helpers and pin search_path
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_signature text;
  v_function regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.admin_extract_utm_value(text, text, boolean)',
    'public.admin_segment_match_count_scalar(jsonb)',
    'public.admin_segment_where_clause(jsonb, text)',
    'public.get_answer_distribution(timestamp with time zone)',
    'public.get_archetype_comparison(text[])',
    'public.get_archetype_correlation(timestamp with time zone)',
    'public.get_at_risk_sessions()',
    'public.get_automated_insights(integer)',
    'public.get_behavior_stats(timestamp with time zone)',
    'public.get_cohort_analysis(timestamp with time zone, text)',
    'public.get_conversion_funnel(timestamp with time zone, text)',
    'public.get_conversion_pipeline(timestamp with time zone)',
    'public.get_full_answer_distribution(timestamp with time zone, text, text)',
    'public.get_predictive_insights(integer)',
    'public.get_product_kpis(timestamp with time zone)',
    'public.get_question_discrimination(timestamp with time zone)',
    'public.get_recent_activity(timestamp with time zone, integer)',
    'public.get_referral_chains(timestamp with time zone)',
    'public.get_segment_match_count(jsonb)',
    'public.get_segment_metrics(timestamp with time zone, timestamp with time zone, text, text)',
    'public.get_segment_metrics_by_rules(jsonb)',
    'public.get_segment_metrics_snapshot(text, text, text, text, text)',
    'public.get_waitlist_conversion(timestamp with time zone)',
    'public.refresh_admin_submission_facts()',
    'public.set_admin_investigation_case_updated_at()'
  ]
  LOOP
    v_function := to_regprocedure(v_signature);

    IF v_function IS NULL THEN
      RAISE EXCEPTION 'Function not found: %', v_signature;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_function);
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', v_function);
  END LOOP;
END;
$$;
