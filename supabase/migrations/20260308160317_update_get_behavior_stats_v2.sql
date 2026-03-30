CREATE OR REPLACE FUNCTION get_behavior_stats(since_ts TIMESTAMPTZ)
RETURNS json AS $$
BEGIN
  RETURN json_build_object(
    'dropOff', COALESCE((
      SELECT json_agg(row_to_json(d)) FROM (
        SELECT q_id, COUNT(*)::int AS count
        FROM survey_behavior_event
        WHERE event_type = 'drop_off' AND event_time >= since_ts
        GROUP BY q_id
        ORDER BY count DESC
        LIMIT 15
      ) d
    ), '[]'::json),

    'avgTimePerQuestion', COALESCE((
      SELECT json_agg(row_to_json(a)) FROM (
        SELECT q_id, ROUND(AVG(duration_ms))::int AS avg_ms
        FROM survey_behavior_event
        WHERE event_type = 'question_time' AND event_time >= since_ts
          AND q_id NOT LIKE '00%'
        GROUP BY q_id
        ORDER BY avg_ms DESC
        LIMIT 15
      ) a
    ), '[]'::json),

    'funnel', COALESCE((
      SELECT row_to_json(f) FROM (
        SELECT
          COUNT(DISTINCT session_id)::int AS unique_sessions,
          COUNT(DISTINCT CASE WHEN event_type = 'completed' THEN session_id END)::int AS completed_sessions,
          COUNT(DISTINCT CASE WHEN event_type = 'drop_off' THEN session_id END)::int AS abandoned_sessions
        FROM survey_behavior_event
        WHERE event_time >= since_ts
      ) f
    ), '{}'::json),

    'chapterDropOff', COALESCE((
      SELECT json_agg(row_to_json(cd)) FROM (
        SELECT chapter, COUNT(*)::int AS count
        FROM survey_behavior_event
        WHERE event_type = 'drop_off' AND event_time >= since_ts AND chapter IS NOT NULL
        GROUP BY chapter
        ORDER BY count DESC
      ) cd
    ), '[]'::json),

    'backtrackRate', COALESCE((
      SELECT row_to_json(br) FROM (
        SELECT
          COUNT(*) FILTER (WHERE direction = 'back')::int AS back_count,
          COUNT(*) FILTER (WHERE direction = 'forward')::int AS forward_count
        FROM survey_behavior_event
        WHERE event_type = 'navigation' AND event_time >= since_ts
      ) br
    ), '{"back_count":0,"forward_count":0}'::json),

    'backtrackByQuestion', COALESCE((
      SELECT json_agg(row_to_json(bq)) FROM (
        SELECT q_id, COUNT(*)::int AS count
        FROM survey_behavior_event
        WHERE event_type = 'navigation' AND direction = 'back' AND event_time >= since_ts
          AND q_id NOT LIKE '00%'
        GROUP BY q_id
        ORDER BY count DESC
        LIMIT 15
      ) bq
    ), '[]'::json),

    'chapterFunnel', COALESCE((
      SELECT json_agg(row_to_json(cf)) FROM (
        SELECT chapter, COUNT(DISTINCT session_id)::int AS sessions
        FROM survey_behavior_event
        WHERE event_time >= since_ts AND chapter IS NOT NULL
        GROUP BY chapter
        ORDER BY MIN(question_index)
      ) cf
    ), '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_behavior_stats(TIMESTAMPTZ) TO service_role;;
