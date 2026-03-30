CREATE OR REPLACE FUNCTION get_question_discrimination(since_ts TIMESTAMPTZ)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  SELECT COALESCE(json_agg(row_to_json(d)), '[]'::json) INTO result
  FROM (
    WITH answer_data AS (
      SELECT sq.frontend_qid AS q_id, sr.primary_archetype, ssa.normalized_value
      FROM survey_submission_answer ssa
      JOIN survey_question sq ON sq.id = ssa.survey_question_id
      JOIN survey_submission ss ON ss.id = ssa.survey_submission_id
      JOIN scoring_result sr ON sr.survey_submission_id = ss.id
      WHERE sq.type = 'scale' AND ssa.normalized_value IS NOT NULL
        AND sr.primary_archetype IS NOT NULL AND ss.created_date_time >= effective_since
    ),
    grand_stats AS (
      SELECT q_id, COUNT(*)::int AS n_responses, AVG(normalized_value) AS grand_mean, VARIANCE(normalized_value) AS total_var
      FROM answer_data GROUP BY q_id HAVING COUNT(*) >= 10
    ),
    group_stats AS (
      SELECT q_id, primary_archetype, AVG(normalized_value) AS group_mean, COUNT(*)::int AS group_n
      FROM answer_data GROUP BY q_id, primary_archetype
    ),
    between_var AS (
      SELECT gs.q_id, SUM(gs.group_n * POWER(gs.group_mean - gst.grand_mean, 2)) / NULLIF(gst.n_responses - 1, 0) AS ssb
      FROM group_stats gs JOIN grand_stats gst ON gst.q_id = gs.q_id
      GROUP BY gs.q_id, gst.grand_mean, gst.n_responses
    )
    SELECT gst.q_id, gst.n_responses,
      ROUND(CASE WHEN gst.total_var IS NULL OR gst.total_var = 0 THEN 0
        ELSE COALESCE(bv.ssb / gst.total_var, 0) END::numeric, 4) AS discrimination_index
    FROM grand_stats gst LEFT JOIN between_var bv ON bv.q_id = gst.q_id
    ORDER BY discrimination_index DESC
  ) d;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION get_question_discrimination(TIMESTAMPTZ) TO service_role;;
