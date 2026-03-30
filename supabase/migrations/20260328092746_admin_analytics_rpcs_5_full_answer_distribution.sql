CREATE OR REPLACE FUNCTION get_full_answer_distribution(
  since_ts TIMESTAMPTZ,
  p_archetype TEXT DEFAULT NULL,
  p_utm TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  SELECT json_build_object(
    'single', COALESCE((
      SELECT json_agg(row_to_json(s)) FROM (
        SELECT sq.frontend_qid AS q_id, ao.option_text, COUNT(*)::int AS count
        FROM survey_submission_answer ssa
        JOIN survey_question sq ON sq.id = ssa.survey_question_id
        JOIN answer_option ao ON ao.id = ssa.answer_option_id
        JOIN survey_submission ss ON ss.id = ssa.survey_submission_id
        LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
        WHERE ss.created_date_time >= effective_since
          AND sq.type = 'single'
          AND ssa.answer_option_id IS NOT NULL
          AND (p_archetype IS NULL OR sr.primary_archetype = p_archetype)
          AND (p_utm IS NULL OR ss.utm_tracker ILIKE '%' || p_utm || '%')
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
        LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
        WHERE ss.created_date_time >= effective_since
          AND sq.type = 'multiple'
          AND (p_archetype IS NULL OR sr.primary_archetype = p_archetype)
          AND (p_utm IS NULL OR ss.utm_tracker ILIKE '%' || p_utm || '%')
        GROUP BY sq.frontend_qid, ao.option_text
        ORDER BY sq.frontend_qid, count DESC
      ) m
    ), '[]'::json),

    'scale', COALESCE((
      SELECT json_agg(row_to_json(sc)) FROM (
        SELECT sq.frontend_qid AS q_id,
          CASE
            WHEN ssa.normalized_value BETWEEN 1 AND 2 THEN '1-2'
            WHEN ssa.normalized_value BETWEEN 3 AND 4 THEN '3-4'
            WHEN ssa.normalized_value BETWEEN 5 AND 6 THEN '5-6'
            WHEN ssa.normalized_value = 7 THEN '7'
            ELSE 'other'
          END AS bucket,
          COUNT(*)::int AS count
        FROM survey_submission_answer ssa
        JOIN survey_question sq ON sq.id = ssa.survey_question_id
        JOIN survey_submission ss ON ss.id = ssa.survey_submission_id
        LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
        WHERE ss.created_date_time >= effective_since
          AND sq.type = 'scale'
          AND ssa.normalized_value IS NOT NULL
          AND (p_archetype IS NULL OR sr.primary_archetype = p_archetype)
          AND (p_utm IS NULL OR ss.utm_tracker ILIKE '%' || p_utm || '%')
        GROUP BY sq.frontend_qid, bucket
        ORDER BY sq.frontend_qid, bucket
      ) sc
    ), '[]'::json),

    'open_top', COALESCE((
      SELECT json_agg(row_to_json(o)) FROM (
        SELECT sq.frontend_qid AS q_id, ssa.answer_text, COUNT(*)::int AS count
        FROM survey_submission_answer ssa
        JOIN survey_question sq ON sq.id = ssa.survey_question_id
        JOIN survey_submission ss ON ss.id = ssa.survey_submission_id
        LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
        WHERE ss.created_date_time >= effective_since
          AND sq.type IN ('open', 'country')
          AND ssa.answer_text IS NOT NULL AND ssa.answer_text != ''
          AND (p_archetype IS NULL OR sr.primary_archetype = p_archetype)
          AND (p_utm IS NULL OR ss.utm_tracker ILIKE '%' || p_utm || '%')
        GROUP BY sq.frontend_qid, ssa.answer_text
        HAVING COUNT(*) >= 2
        ORDER BY sq.frontend_qid, count DESC
      ) o
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_full_answer_distribution(TIMESTAMPTZ, TEXT, TEXT) TO service_role;;
