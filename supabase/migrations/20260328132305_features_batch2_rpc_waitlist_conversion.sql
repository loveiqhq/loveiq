CREATE OR REPLACE FUNCTION get_waitlist_conversion(since_ts TIMESTAMPTZ)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  SELECT json_build_object(
    'funnel', json_build_object(
      'total', (SELECT COUNT(*)::int FROM waitlist_user wu WHERE wu.created_date_time >= effective_since),
      'mapped', (SELECT COUNT(DISTINCT wm.user_id)::int FROM waitlist_mapping wm JOIN waitlist_user wu ON wu.id = wm.waitlist_id WHERE wu.created_date_time >= effective_since),
      'completed', (SELECT COUNT(DISTINCT ss.id)::int FROM waitlist_mapping wm JOIN waitlist_user wu ON wu.id = wm.waitlist_id JOIN survey_submission ss ON ss.user_id = wm.user_id AND ss.status = 'completed' WHERE wu.created_date_time >= effective_since),
      'scored', (SELECT COUNT(DISTINCT sr.survey_submission_id)::int FROM waitlist_mapping wm JOIN waitlist_user wu ON wu.id = wm.waitlist_id JOIN survey_submission ss ON ss.user_id = wm.user_id AND ss.status = 'completed' JOIN scoring_result sr ON sr.survey_submission_id = ss.id WHERE wu.created_date_time >= effective_since)
    ),
    'avg_hours_to_convert', (
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ss.created_date_time - wu.created_date_time)) / 3600)::numeric, 1)
      FROM waitlist_mapping wm JOIN waitlist_user wu ON wu.id = wm.waitlist_id
      JOIN survey_submission ss ON ss.user_id = wm.user_id AND ss.status = 'completed'
      WHERE wu.created_date_time >= effective_since
    ),
    'time_buckets', COALESCE((
      SELECT json_agg(row_to_json(tb)) FROM (
        SELECT CASE WHEN hours < 1 THEN '< 1 hour' WHEN hours < 24 THEN '1-24 hours' WHEN hours < 168 THEN '1-7 days' ELSE '> 7 days' END AS label, COUNT(*)::int AS count
        FROM (SELECT EXTRACT(EPOCH FROM (ss.created_date_time - wu.created_date_time)) / 3600 AS hours
          FROM waitlist_mapping wm JOIN waitlist_user wu ON wu.id = wm.waitlist_id
          JOIN survey_submission ss ON ss.user_id = wm.user_id AND ss.status = 'completed'
          WHERE wu.created_date_time >= effective_since) h
        GROUP BY label ORDER BY MIN(hours)
      ) tb
    ), '[]'::json),
    'by_archetype', COALESCE((
      SELECT json_agg(row_to_json(ba)) FROM (
        SELECT sr.primary_archetype AS archetype, COUNT(*)::int AS count,
          ROUND(AVG(EXTRACT(EPOCH FROM (ss.created_date_time - wu.created_date_time)) / 3600)::numeric, 1) AS avg_hours
        FROM waitlist_mapping wm JOIN waitlist_user wu ON wu.id = wm.waitlist_id
        JOIN survey_submission ss ON ss.user_id = wm.user_id AND ss.status = 'completed'
        JOIN scoring_result sr ON sr.survey_submission_id = ss.id
        WHERE wu.created_date_time >= effective_since
        GROUP BY sr.primary_archetype ORDER BY count DESC
      ) ba
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION get_waitlist_conversion(TIMESTAMPTZ) TO service_role;;
