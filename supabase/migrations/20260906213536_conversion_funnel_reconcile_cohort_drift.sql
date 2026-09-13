-- Reconcile get_conversion_funnel with what production has actually been
-- running since 2026-07-09.
--
-- DRIFT, not a behaviour change. Two follow-ups were applied straight to prod
-- through the Supabase MCP and never written back as repo files:
--   20260708211531_conversion_funnel_cohort
--   20260709071153_conversion_funnel_started_source_fix
-- so the newest definition in supabase/migrations was still 20260701180000.
-- A fresh `db reset` would therefore have installed the OLD independent-stage
-- funnel and silently regressed the admin Funnels page. This file is the live
-- prod definition captured verbatim, so repo and prod agree again. Applying it
-- to prod is a no-op replace.
--
-- What the two lost migrations changed, versus 20260701180000:
--   1. COHORT SEMANTICS. `report_viewed` and `purchased` (and `revenue`) are no
--      longer counted on their own timestamps — they are restricted to the
--      cohort of submissions COMPLETED inside the window, via the completed →
--      cohort_reports CTEs. Counting each stage independently let a later stage
--      exceed an earlier one (someone completing in June and buying in July was
--      a July purchase with no July completion), which is not a funnel.
--   2. survey_started now reads funnel_event 'survey_engine_mount' instead of
--      distinct survey_partial_save sessions. The partial-save row is written on
--      the first question TRANSITION, so it undercounts anyone who abandoned on
--      question 1; the mount event is the true start and matches the visitor_id
--      dedup already used by the unique_visitors stage above it.
--
-- Consequence to keep in mind: `revenue` here is cohort revenue (money from
-- people who completed the survey in the window), NOT money received in the
-- window. The payment ledger is the source of truth for the latter.

CREATE OR REPLACE FUNCTION public.get_conversion_funnel(
  since_ts TIMESTAMPTZ,
  utm_filter TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  WITH completed AS (
    SELECT ss.id AS submission_id
    FROM survey_submission ss
    WHERE ss.status = 'completed'
      AND ss.created_date_time >= effective_since
      AND (utm_filter IS NULL OR ss.utm_tracker ILIKE '%' || utm_filter || '%')
  ),
  cohort_reports AS (
    SELECT c.submission_id, pr.id AS report_id
    FROM completed c
    LEFT JOIN personal_report pr ON pr.survey_submission_id = c.submission_id
  ),
  viewed AS (
    SELECT DISTINCT cr.submission_id
    FROM cohort_reports cr
    WHERE cr.report_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM report_session rs WHERE rs.personal_report_id = cr.report_id)
  ),
  paid AS (
    SELECT cr.submission_id, p.amount
    FROM cohort_reports cr
    JOIN payment p ON p.personal_report_id = cr.report_id AND p.status = 'succeeded'
  )
  SELECT json_build_object(
    'stages', json_build_array(
      json_build_object('name', 'unique_visitors', 'count', (
        SELECT COUNT(DISTINCT fe.visitor_id)::int
        FROM funnel_event fe
        WHERE fe.event_type = 'unique_visitor'
          AND fe.day >= effective_since::date
          AND (utm_filter IS NULL OR fe.utm_source ILIKE '%' || utm_filter || '%')
      )),
      json_build_object('name', 'survey_started', 'count', (
        SELECT COUNT(DISTINCT fe.visitor_id)::int
        FROM funnel_event fe
        WHERE fe.event_type = 'survey_engine_mount'
          AND fe.day >= effective_since::date
          AND (utm_filter IS NULL OR fe.utm_source ILIKE '%' || utm_filter || '%')
      )),
      json_build_object('name', 'survey_completed', 'count', (SELECT COUNT(*)::int FROM completed)),
      json_build_object('name', 'report_viewed',    'count', (SELECT COUNT(*)::int FROM viewed)),
      json_build_object('name', 'purchased',        'count', (SELECT COUNT(DISTINCT submission_id)::int FROM paid))
    ),
    'revenue', (SELECT COALESCE(SUM(amount), 0) FROM paid WHERE amount > 0)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_conversion_funnel(TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_conversion_funnel(TIMESTAMPTZ, TEXT) TO service_role;
