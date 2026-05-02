CREATE OR REPLACE FUNCTION get_cohort_analysis(
  since_ts TIMESTAMPTZ,
  group_by_field TEXT DEFAULT 'week'
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  IF group_by_field = 'week' THEN
    SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json) INTO result
    FROM (
      SELECT
        to_char(date_trunc('week', au.created_date_time), 'YYYY-"W"IW') AS label,
        COUNT(DISTINCT au.id)::int AS total_users,
        COUNT(DISTINCT sbe_start.session_id)::int AS survey_started,
        COUNT(DISTINCT ss.id)::int AS survey_completed,
        COUNT(DISTINCT sr.survey_submission_id)::int AS scored,
        COUNT(DISTINCT ie.id)::int AS invite_sent
      FROM app_user au
      LEFT JOIN survey_submission ss ON ss.user_id = au.id AND ss.status = 'completed'
      LEFT JOIN (
        SELECT DISTINCT session_id FROM survey_behavior_event
      ) sbe_start ON sbe_start.session_id = ss.session_id
      LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
      LEFT JOIN invite_event ie ON LOWER(ie.referrer_email) = LOWER(au.email)
      WHERE au.created_date_time >= effective_since
      GROUP BY date_trunc('week', au.created_date_time)
      ORDER BY date_trunc('week', au.created_date_time) DESC
    ) c;

  ELSIF group_by_field = 'utm' THEN
    SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json) INTO result
    FROM (
      SELECT
        COALESCE(
          au.utm_tracker::jsonb ->> 'utm_source',
          'Direct'
        ) AS label,
        COUNT(DISTINCT au.id)::int AS total_users,
        COUNT(DISTINCT CASE WHEN ss.id IS NOT NULL THEN ss.session_id END)::int AS survey_started,
        COUNT(DISTINCT ss.id)::int AS survey_completed,
        COUNT(DISTINCT sr.survey_submission_id)::int AS scored,
        COUNT(DISTINCT ie.id)::int AS invite_sent
      FROM app_user au
      LEFT JOIN survey_submission ss ON ss.user_id = au.id AND ss.status = 'completed'
      LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
      LEFT JOIN invite_event ie ON LOWER(ie.referrer_email) = LOWER(au.email)
      WHERE au.created_date_time >= effective_since
      GROUP BY COALESCE(au.utm_tracker::jsonb ->> 'utm_source', 'Direct')
      ORDER BY total_users DESC
      LIMIT 30
    ) c;

  ELSIF group_by_field = 'archetype' THEN
    SELECT COALESCE(json_agg(row_to_json(c)), '[]'::json) INTO result
    FROM (
      SELECT
        COALESCE(sr.primary_archetype, 'Unscored') AS label,
        COUNT(DISTINCT au.id)::int AS total_users,
        COUNT(DISTINCT ss.id)::int AS survey_completed,
        COUNT(DISTINCT sr.survey_submission_id)::int AS scored,
        COUNT(DISTINCT ie.id)::int AS invite_sent,
        0::int AS survey_started
      FROM app_user au
      JOIN survey_submission ss ON ss.user_id = au.id AND ss.status = 'completed'
      LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
      LEFT JOIN invite_event ie ON LOWER(ie.referrer_email) = LOWER(au.email)
      WHERE au.created_date_time >= effective_since
      GROUP BY COALESCE(sr.primary_archetype, 'Unscored')
      ORDER BY total_users DESC
    ) c;

  ELSE
    result := '[]'::json;
  END IF;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_cohort_analysis(TIMESTAMPTZ, TEXT) TO service_role;;
