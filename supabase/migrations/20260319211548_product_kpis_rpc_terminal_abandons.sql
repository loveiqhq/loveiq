CREATE OR REPLACE FUNCTION get_product_kpis(since_ts TIMESTAMPTZ DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  WITH terminal_abandons AS (
    SELECT e.session_id, e.q_id
    FROM survey_behavior_event e
    WHERE e.direction = 'abandon'
      AND e.event_time >= effective_since
      AND NOT EXISTS (
        SELECT 1 FROM survey_behavior_event e2
        WHERE e2.session_id = e.session_id
          AND e2.event_time > e.event_time
      )
  )
  SELECT json_build_object(
    'questions', (
      SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json)
      FROM (
        SELECT
          sbe.q_id,
          sbe.chapter,
          COUNT(DISTINCT sbe.session_id)::int AS reach_n,
          COUNT(DISTINCT ta.session_id)::int AS dropoff_n,
          ROUND(AVG(sbe.time_spent_ms) FILTER (WHERE sbe.direction IN ('forward','back')) / 1000.0, 1) AS avg_active_time_s,
          COUNT(*) FILTER (WHERE sbe.direction = 'back')::int AS backtrack_n
        FROM survey_behavior_event sbe
        LEFT JOIN terminal_abandons ta
          ON ta.session_id = sbe.session_id AND ta.q_id = sbe.q_id
        WHERE sbe.event_time >= effective_since
        GROUP BY sbe.q_id, sbe.chapter
        ORDER BY MIN(sbe.question_index)
      ) q
    ),
    'totalSessions', (
      SELECT COUNT(DISTINCT session_id)::int
      FROM survey_behavior_event
      WHERE event_time >= effective_since
    )
  ) INTO result;
  RETURN result;
END;
$$;;
