CREATE OR REPLACE FUNCTION get_archetype_correlation(since_ts TIMESTAMPTZ)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json) INTO result
  FROM (
    SELECT
      sr.primary_archetype AS v4,
      sr.v5_primary_archetype AS v5,
      COUNT(*)::int AS count
    FROM scoring_result sr
    JOIN survey_submission ss ON ss.id = sr.survey_submission_id
    WHERE ss.created_date_time >= effective_since
      AND sr.v5_primary_archetype IS NOT NULL
    GROUP BY sr.primary_archetype, sr.v5_primary_archetype
    ORDER BY sr.primary_archetype, sr.v5_primary_archetype
  ) c;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_archetype_correlation(TIMESTAMPTZ) TO service_role;;
