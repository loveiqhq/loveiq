CREATE OR REPLACE FUNCTION get_recent_activity(
  since_ts TIMESTAMPTZ,
  limit_n INT DEFAULT 50
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, now() - interval '24 hours');
  effective_limit INT := LEAST(COALESCE(limit_n, 50), 200);
BEGIN
  SELECT COALESCE(json_agg(row_to_json(e)), '[]'::json) INTO result
  FROM (
    (
      SELECT 'submission_completed'::text AS event_type,
             ss.created_date_time AS event_time,
             au.email,
             ss.utm_tracker AS utm,
             sr.primary_archetype AS detail
      FROM survey_submission ss
      JOIN app_user au ON au.id = ss.user_id
      LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
      WHERE ss.status = 'completed' AND ss.created_date_time >= effective_since
    )
    UNION ALL
    (
      SELECT 'waitlist_signup'::text,
             wu.created_date_time,
             wu.email,
             wu.utm_tracker::text,
             NULL::text
      FROM waitlist_user wu
      WHERE wu.created_date_time >= effective_since
    )
    UNION ALL
    (
      SELECT 'survey_started'::text,
             MIN(sbe.event_time),
             NULL::text,
             NULL::text,
             sbe.session_id::text
      FROM survey_behavior_event sbe
      WHERE sbe.event_time >= effective_since
      GROUP BY sbe.session_id
      HAVING MIN(sbe.question_index) = 0
    )
    UNION ALL
    (
      SELECT 'invite_sent'::text,
             ie.created_at,
             ie.referrer_email,
             NULL::text,
             ie.invite_method
      FROM invite_event ie
      WHERE ie.created_at >= effective_since
    )
    ORDER BY event_time DESC
    LIMIT effective_limit
  ) e;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_recent_activity(TIMESTAMPTZ, INT) TO service_role;;
