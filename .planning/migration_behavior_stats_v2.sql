-- Migration: Update get_behavior_stats RPC + create get_answer_distribution RPC
-- Applied 2026-03-08
--
-- Changes to get_behavior_stats:
-- - Exclude intro fields (q_id LIKE '00%') from avgTimePerQuestion and backtrackByQuestion
-- - Add chapterFunnel sub-query
-- - Uses correct column names: direction (not event_type), time_spent_ms (not duration_ms)
--   direction values: 'forward', 'back', 'abandon', 'complete'

CREATE OR REPLACE FUNCTION get_behavior_stats(since_ts TIMESTAMPTZ)
RETURNS json AS $$
BEGIN
  RETURN json_build_object(
    'dropOff', COALESCE((
      SELECT json_agg(row_to_json(d)) FROM (
        SELECT q_id, COUNT(*)::int AS count
        FROM survey_behavior_event
        WHERE direction = 'abandon' AND event_time >= since_ts
        GROUP BY q_id
        ORDER BY count DESC
        LIMIT 15
      ) d
    ), '[]'::json),

    'avgTimePerQuestion', COALESCE((
      SELECT json_agg(row_to_json(a)) FROM (
        SELECT q_id, ROUND(AVG(time_spent_ms))::int AS avg_ms
        FROM survey_behavior_event
        WHERE direction IN ('forward', 'back') AND event_time >= since_ts
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
          COUNT(DISTINCT CASE WHEN direction = 'complete' THEN session_id END)::int AS completed_sessions,
          COUNT(DISTINCT CASE WHEN direction = 'abandon' THEN session_id END)::int AS abandoned_sessions
        FROM survey_behavior_event
        WHERE event_time >= since_ts
      ) f
    ), '{}'::json),

    'chapterDropOff', COALESCE((
      SELECT json_agg(row_to_json(cd)) FROM (
        SELECT chapter, COUNT(*)::int AS count
        FROM survey_behavior_event
        WHERE direction = 'abandon' AND event_time >= since_ts AND chapter IS NOT NULL
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
        WHERE direction IN ('forward', 'back') AND event_time >= since_ts
      ) br
    ), '{"back_count":0,"forward_count":0}'::json),

    'backtrackByQuestion', COALESCE((
      SELECT json_agg(row_to_json(bq)) FROM (
        SELECT q_id, COUNT(*)::int AS count
        FROM survey_behavior_event
        WHERE direction = 'back' AND event_time >= since_ts
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

GRANT EXECUTE ON FUNCTION get_behavior_stats(TIMESTAMPTZ) TO service_role;


-- New RPC: get_answer_distribution
-- Returns choice question option distribution for single and multiple choice questions

CREATE OR REPLACE FUNCTION get_answer_distribution(since_ts TIMESTAMPTZ)
RETURNS json AS $$
BEGIN
  RETURN json_build_object(
    'single', COALESCE((
      SELECT json_agg(row_to_json(s)) FROM (
        SELECT sq.frontend_qid AS q_id, ao.option_text, COUNT(*)::int AS count
        FROM survey_submission_answer ssa
        JOIN survey_question sq ON sq.id = ssa.survey_question_id
        JOIN answer_option ao ON ao.id = ssa.answer_option_id
        JOIN survey_submission ss ON ss.id = ssa.survey_submission_id
        WHERE ss.created_date_time >= since_ts
          AND sq.type = 'single'
          AND ssa.answer_option_id IS NOT NULL
        GROUP BY sq.frontend_qid, ao.option_text
        ORDER BY sq.frontend_qid, count DESC
      ) s
    ), '[]'::json),

    'multiple', COALESCE((
      SELECT json_agg(row_to_json(m)) FROM (
        SELECT sq.frontend_qid AS q_id, ao.option_text, COUNT(*)::int AS count
        FROM survey_submission_answer_options ssao
        JOIN answer_option ao ON ao.id = ssao.answer_option_id
        JOIN survey_submission_answer ssa ON ssa.id = ssao.survey_submission_answer_id
        JOIN survey_question sq ON sq.id = ssa.survey_question_id
        JOIN survey_submission ss ON ss.id = ssa.survey_submission_id
        WHERE ss.created_date_time >= since_ts
          AND sq.type = 'multiple'
        GROUP BY sq.frontend_qid, ao.option_text
        ORDER BY sq.frontend_qid, count DESC
      ) m
    ), '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_answer_distribution(TIMESTAMPTZ) TO service_role;
