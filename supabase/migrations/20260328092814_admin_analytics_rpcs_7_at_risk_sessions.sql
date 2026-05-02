CREATE OR REPLACE FUNCTION get_at_risk_sessions()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) INTO result
  FROM (
    SELECT
      sps.session_id,
      sps.current_index,
      sps.started_at,
      sps.saved_at,
      (SELECT count(*) FROM jsonb_object_keys(sps.answers))::int AS answers_count,
      ROUND(EXTRACT(EPOCH FROM (now() - sps.saved_at)) / 60)::int AS minutes_since_save,
      ROUND(EXTRACT(EPOCH FROM (sps.saved_at - sps.started_at)) / 60)::int AS total_minutes,
      COALESCE(beh.backtrack_count, 0) AS backtrack_count,
      COALESCE(beh.total_events, 0) AS total_events,
      CASE
        WHEN EXTRACT(EPOCH FROM (now() - sps.saved_at)) > 3600 THEN 'stale'
        WHEN sps.current_index < 10
          AND EXTRACT(EPOCH FROM (sps.saved_at - sps.started_at)) > 900 THEN 'struggling'
        WHEN COALESCE(beh.backtrack_count, 0) > 5 THEN 'high_backtrack'
        ELSE 'normal'
      END AS risk_level
    FROM survey_partial_save sps
    LEFT JOIN (
      SELECT session_id,
             COUNT(*) FILTER (WHERE direction = 'back') AS backtrack_count,
             COUNT(*) AS total_events
      FROM survey_behavior_event
      GROUP BY session_id
    ) beh ON beh.session_id = sps.session_id
    WHERE NOT EXISTS (
      SELECT 1 FROM survey_submission ss
      WHERE ss.session_id = sps.session_id
    )
    ORDER BY
      CASE
        WHEN EXTRACT(EPOCH FROM (now() - sps.saved_at)) > 3600 THEN 3
        WHEN sps.current_index < 10
          AND EXTRACT(EPOCH FROM (sps.saved_at - sps.started_at)) > 900 THEN 2
        WHEN COALESCE(beh.backtrack_count, 0) > 5 THEN 1
        ELSE 0
      END DESC,
      sps.saved_at DESC
    LIMIT 100
  ) r;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_at_risk_sessions() TO service_role;;
