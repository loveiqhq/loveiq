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
          SELECT COUNT(DISTINCT sbe.session_id)::int
          FROM survey_behavior_event sbe
          WHERE sbe.event_time >= effective_since
            AND (utm_filter IS NULL OR EXISTS (
              SELECT 1 FROM survey_submission ss
              WHERE ss.session_id = sbe.session_id
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

GRANT EXECUTE ON FUNCTION get_conversion_funnel(TIMESTAMPTZ, TEXT) TO service_role;;
