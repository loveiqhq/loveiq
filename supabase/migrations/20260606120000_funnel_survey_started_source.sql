-- Align the conversion funnel's "survey_started" stage with the rest of the app.
--
-- Previously this stage counted DISTINCT session_id from `survey_behavior_event`
-- (per-question tracking rows), while Core KPIs and the Slack digest count
-- distinct started sessions from `survey_partial_save`. That mismatch made the
-- Funnels & Cohorts survey-start number disagree with every other surface.
--
-- Canonical definition (matches digest-metrics.fetchSurveyStarts): one started
-- survey == one distinct session_id in survey_partial_save. This is the only
-- change; every other stage is preserved verbatim. CREATE OR REPLACE is idempotent.

CREATE OR REPLACE FUNCTION get_conversion_funnel(
  since_ts TIMESTAMPTZ,
  utm_filter TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  SELECT json_build_object(
    'stages', json_build_array(
      json_build_object(
        'name', 'waitlist_signups',
        'count', (
          SELECT COUNT(*)::int FROM waitlist_user wu
          WHERE wu.created_date_time >= effective_since
            AND (utm_filter IS NULL OR wu.utm_tracker::text ILIKE '%' || utm_filter || '%')
        )
      ),
      json_build_object(
        'name', 'survey_started',
        'count', (
          SELECT COUNT(DISTINCT sps.session_id)::int
          FROM survey_partial_save sps
          WHERE sps.started_at >= effective_since
            AND (utm_filter IS NULL OR EXISTS (
              SELECT 1 FROM survey_submission ss
              WHERE ss.session_id = sps.session_id
                AND ss.utm_tracker ILIKE '%' || utm_filter || '%'
            ))
        )
      ),
      json_build_object(
        'name', 'survey_completed',
        'count', (
          SELECT COUNT(*)::int FROM survey_submission ss
          WHERE ss.status = 'completed'
            AND ss.created_date_time >= effective_since
            AND (utm_filter IS NULL OR ss.utm_tracker ILIKE '%' || utm_filter || '%')
        )
      ),
      json_build_object(
        'name', 'invite_sent',
        'count', (
          SELECT COUNT(*)::int FROM invite_event ie
          WHERE ie.created_at >= effective_since
            AND (utm_filter IS NULL)
        )
      )
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_conversion_funnel(TIMESTAMPTZ, TEXT) TO service_role;
