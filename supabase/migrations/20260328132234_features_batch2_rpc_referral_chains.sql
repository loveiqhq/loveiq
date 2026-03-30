CREATE OR REPLACE FUNCTION get_referral_chains(since_ts TIMESTAMPTZ)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  SELECT json_build_object(
    'top_referrers', COALESCE((
      SELECT json_agg(row_to_json(r)) FROM (
        SELECT
          ie.referrer_email AS email,
          COUNT(*)::int AS invite_count,
          COUNT(DISTINCT CASE
            WHEN ss.id IS NOT NULL AND ss.status = 'completed' THEN ss.id
          END)::int AS completion_count
        FROM invite_event ie
        LEFT JOIN app_user au ON LOWER(au.email) = LOWER(ie.recipient_email)
        LEFT JOIN survey_submission ss ON ss.user_id = au.id AND ss.status = 'completed'
        WHERE ie.created_at >= effective_since
          AND ie.referrer_email IS NOT NULL
          AND ie.referrer_email != ''
        GROUP BY ie.referrer_email
        ORDER BY invite_count DESC
        LIMIT 30
      ) r
    ), '[]'::json),
    'stats', json_build_object(
      'total_invites', (
        SELECT COUNT(*)::int FROM invite_event ie
        WHERE ie.created_at >= effective_since
          AND ie.referrer_email IS NOT NULL AND ie.referrer_email != ''
      ),
      'unique_referrers', (
        SELECT COUNT(DISTINCT ie.referrer_email)::int FROM invite_event ie
        WHERE ie.created_at >= effective_since
          AND ie.referrer_email IS NOT NULL AND ie.referrer_email != ''
      ),
      'total_completions', (
        SELECT COUNT(DISTINCT ss.id)::int
        FROM invite_event ie
        JOIN app_user au ON LOWER(au.email) = LOWER(ie.recipient_email)
        JOIN survey_submission ss ON ss.user_id = au.id AND ss.status = 'completed'
        WHERE ie.created_at >= effective_since
      ),
      'viral_coefficient', (
        SELECT CASE WHEN completed_users = 0 THEN 0
          ELSE ROUND((invites_by_completed::numeric / completed_users), 2)
        END
        FROM (
          SELECT
            COUNT(DISTINCT ie2.id)::numeric AS invites_by_completed,
            COUNT(DISTINCT ss2.id)::numeric AS completed_users
          FROM survey_submission ss2
          JOIN app_user au2 ON au2.id = ss2.user_id
          LEFT JOIN invite_event ie2 ON LOWER(ie2.referrer_email) = LOWER(au2.email)
            AND ie2.created_at >= effective_since
          WHERE ss2.status = 'completed' AND ss2.created_date_time >= effective_since
        ) sub
      ),
      'methods', COALESCE((
        SELECT json_agg(row_to_json(m)) FROM (
          SELECT ie.invite_method AS method, COUNT(*)::int AS count
          FROM invite_event ie
          WHERE ie.created_at >= effective_since AND ie.invite_method IS NOT NULL
          GROUP BY ie.invite_method ORDER BY count DESC
        ) m
      ), '[]'::json)
    )
  ) INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION get_referral_chains(TIMESTAMPTZ) TO service_role;;
