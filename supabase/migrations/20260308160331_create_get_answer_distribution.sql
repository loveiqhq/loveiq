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

GRANT EXECUTE ON FUNCTION get_answer_distribution(TIMESTAMPTZ) TO service_role;;
