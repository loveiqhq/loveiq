
CREATE OR REPLACE FUNCTION get_behavior_stats(since_ts timestamptz)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'dropOff',
    COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT q_id, COUNT(*)::int AS count
        FROM survey_behavior_event
        WHERE event_time >= since_ts AND direction = 'abandon'
        GROUP BY q_id
        ORDER BY count DESC
        LIMIT 15
      ) t
    ), '[]'::json),

    'avgTimePerQuestion',
    COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT q_id, ROUND(AVG(time_spent_ms))::int AS avg_ms
        FROM survey_behavior_event
        WHERE event_time >= since_ts AND time_spent_ms > 0
        GROUP BY q_id
        ORDER BY avg_ms DESC
        LIMIT 15
      ) t
    ), '[]'::json),

    'funnel',
    (
      SELECT json_build_object(
        'unique_sessions', COUNT(DISTINCT session_id)::int,
        'completed_sessions', COUNT(DISTINCT session_id) FILTER (WHERE direction = 'complete')::int,
        'abandoned_sessions', COUNT(DISTINCT session_id) FILTER (WHERE direction = 'abandon')::int
      )
      FROM survey_behavior_event
      WHERE event_time >= since_ts
    ),

    'chapterDropOff',
    COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT chapter, COUNT(*)::int AS count
        FROM survey_behavior_event
        WHERE event_time >= since_ts AND direction = 'abandon'
        GROUP BY chapter
        ORDER BY count DESC
      ) t
    ), '[]'::json),

    'backtrackRate',
    (
      SELECT json_build_object(
        'back_count', COUNT(*) FILTER (WHERE direction = 'back')::int,
        'forward_count', COUNT(*) FILTER (WHERE direction = 'forward')::int
      )
      FROM survey_behavior_event
      WHERE event_time >= since_ts
    ),

    'backtrackByQuestion',
    COALESCE((
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT q_id, COUNT(*)::int AS count
        FROM survey_behavior_event
        WHERE event_time >= since_ts AND direction = 'back'
        GROUP BY q_id
        ORDER BY count DESC
        LIMIT 10
      ) t
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;
;
