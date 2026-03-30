CREATE OR REPLACE FUNCTION get_segment_metrics(
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL,
  p_utm TEXT DEFAULT NULL,
  p_archetype TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(p_since, '2000-01-01'::TIMESTAMPTZ);
  effective_until TIMESTAMPTZ := COALESCE(p_until, '2099-12-31'::TIMESTAMPTZ);
BEGIN
  SELECT json_build_object(
    'total_submissions', (
      SELECT COUNT(*)::int FROM survey_submission ss
      LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
      WHERE ss.created_date_time BETWEEN effective_since AND effective_until
        AND (p_utm IS NULL OR ss.utm_tracker ILIKE '%' || p_utm || '%')
        AND (p_archetype IS NULL OR sr.primary_archetype = p_archetype)
    ),
    'completed', (
      SELECT COUNT(*)::int FROM survey_submission ss
      LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
      WHERE ss.status = 'completed'
        AND ss.created_date_time BETWEEN effective_since AND effective_until
        AND (p_utm IS NULL OR ss.utm_tracker ILIKE '%' || p_utm || '%')
        AND (p_archetype IS NULL OR sr.primary_archetype = p_archetype)
    ),
    'avg_duration_ms', (
      SELECT ROUND(AVG(ss.duration_ms))::bigint FROM survey_submission ss
      LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
      WHERE ss.status = 'completed' AND ss.duration_ms IS NOT NULL
        AND ss.created_date_time BETWEEN effective_since AND effective_until
        AND (p_utm IS NULL OR ss.utm_tracker ILIKE '%' || p_utm || '%')
        AND (p_archetype IS NULL OR sr.primary_archetype = p_archetype)
    ),
    'archetype_distribution', COALESCE((
      SELECT json_agg(row_to_json(ad)) FROM (
        SELECT sr.primary_archetype AS archetype, COUNT(*)::int AS count
        FROM scoring_result sr
        JOIN survey_submission ss ON ss.id = sr.survey_submission_id
        WHERE ss.created_date_time BETWEEN effective_since AND effective_until
          AND (p_utm IS NULL OR ss.utm_tracker ILIKE '%' || p_utm || '%')
          AND (p_archetype IS NULL OR sr.primary_archetype = p_archetype)
        GROUP BY sr.primary_archetype
        ORDER BY count DESC
      ) ad
    ), '[]'::json),
    'top_drop_off', COALESCE((
      SELECT json_agg(row_to_json(d)) FROM (
        SELECT sbe.q_id, COUNT(*)::int AS count
        FROM survey_behavior_event sbe
        WHERE sbe.direction = 'abandon'
          AND sbe.event_time BETWEEN effective_since AND effective_until
        GROUP BY sbe.q_id
        ORDER BY count DESC
        LIMIT 5
      ) d
    ), '[]'::json),
    'avg_time_top', COALESCE((
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT sbe.q_id, ROUND(AVG(sbe.time_spent_ms))::int AS avg_ms
        FROM survey_behavior_event sbe
        WHERE sbe.direction IN ('forward', 'back')
          AND sbe.event_time BETWEEN effective_since AND effective_until
          AND sbe.q_id NOT LIKE '00%'
        GROUP BY sbe.q_id
        ORDER BY avg_ms DESC
        LIMIT 5
      ) t
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_segment_metrics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO service_role;;
