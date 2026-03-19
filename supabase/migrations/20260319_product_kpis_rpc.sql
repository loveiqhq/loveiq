-- =============================================================
-- Product KPIs RPC: per-question behavior metrics
-- Aggregates survey_behavior_event for the KPI dashboard
-- =============================================================

CREATE OR REPLACE FUNCTION get_product_kpis(since_ts TIMESTAMPTZ DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  SELECT json_build_object(
    'questions', (
      SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json)
      FROM (
        SELECT
          q_id,
          chapter,
          COUNT(DISTINCT session_id)::int AS reach_n,
          COUNT(*) FILTER (WHERE direction = 'abandon')::int AS dropoff_n,
          ROUND(AVG(time_spent_ms) FILTER (WHERE direction IN ('forward','back')) / 1000.0, 1) AS avg_active_time_s,
          COUNT(*) FILTER (WHERE direction = 'back')::int AS backtrack_n
        FROM survey_behavior_event
        WHERE event_time >= effective_since
        GROUP BY q_id, chapter
        ORDER BY MIN(question_index)
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
$$;
