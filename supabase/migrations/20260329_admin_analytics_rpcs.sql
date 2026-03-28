-- Migration: Admin analytics RPCs
-- 7 new RPCs for the expanded admin dashboard
-- Pattern follows get_behavior_stats / get_product_kpis

-- ═══════════════════════════════════════════════════════════
-- 1. get_conversion_funnel
--    Counts per funnel stage with optional UTM filter
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_conversion_funnel(
  since_ts TIMESTAMPTZ,
  utm_filter TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  SELECT json_build_object(
    'stages', json_build_array(
      json_build_object(
        'name', 'waitlist_signups',
        'count', (
          SELECT COUNT(*)::int FROM waitlist_user wu
          WHERE wu.created_date_time >= effective_since
            AND (utm_filter IS NULL OR wu.utm_tracker::text ILIKE '%' || utm_filter || '%')
        )
      ),
      json_build_object(
        'name', 'survey_started',
        'count', (
          SELECT COUNT(DISTINCT sbe.session_id)::int
          FROM survey_behavior_event sbe
          WHERE sbe.event_time >= effective_since
            AND (utm_filter IS NULL OR EXISTS (
              SELECT 1 FROM survey_submission ss
              WHERE ss.session_id = sbe.session_id
                AND ss.utm_tracker ILIKE '%' || utm_filter || '%'
            ))
        )
      ),
      json_build_object(
        'name', 'survey_completed',
        'count', (
          SELECT COUNT(*)::int FROM survey_submission ss
          WHERE ss.status = 'completed'
            AND ss.created_date_time >= effective_since
            AND (utm_filter IS NULL OR ss.utm_tracker ILIKE '%' || utm_filter || '%')
        )
      ),
      json_build_object(
        'name', 'invite_sent',
        'count', (
          SELECT COUNT(*)::int FROM invite_event ie
          WHERE ie.created_at >= effective_since
            AND (utm_filter IS NULL)
        )
      )
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_conversion_funnel(TIMESTAMPTZ, TEXT) TO service_role;


-- ═══════════════════════════════════════════════════════════
-- 2. get_cohort_analysis
--    Groups app_user by week/utm/archetype with milestone counts
-- ═══════════════════════════════════════════════════════════
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

GRANT EXECUTE ON FUNCTION get_cohort_analysis(TIMESTAMPTZ, TEXT) TO service_role;


-- ═══════════════════════════════════════════════════════════
-- 3. get_segment_metrics
--    Returns summary metrics for one filtered segment
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_segment_metrics(
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL,
  p_utm TEXT DEFAULT NULL,
  p_archetype TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(p_since, '2000-01-01'::TIMESTAMPTZ);
  effective_until TIMESTAMPTZ := COALESCE(p_until, '2099-12-31'::TIMESTAMPTZ);
BEGIN
  SELECT json_build_object(
    'total_submissions', (
      SELECT COUNT(*)::int FROM survey_submission ss
      LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
      WHERE ss.created_date_time BETWEEN effective_since AND effective_until
        AND (p_utm IS NULL OR ss.utm_tracker ILIKE '%' || p_utm || '%')
        AND (p_archetype IS NULL OR sr.primary_archetype = p_archetype)
    ),
    'completed', (
      SELECT COUNT(*)::int FROM survey_submission ss
      LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
      WHERE ss.status = 'completed'
        AND ss.created_date_time BETWEEN effective_since AND effective_until
        AND (p_utm IS NULL OR ss.utm_tracker ILIKE '%' || p_utm || '%')
        AND (p_archetype IS NULL OR sr.primary_archetype = p_archetype)
    ),
    'avg_duration_ms', (
      SELECT ROUND(AVG(ss.duration_ms))::bigint FROM survey_submission ss
      LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
      WHERE ss.status = 'completed' AND ss.duration_ms IS NOT NULL
        AND ss.created_date_time BETWEEN effective_since AND effective_until
        AND (p_utm IS NULL OR ss.utm_tracker ILIKE '%' || p_utm || '%')
        AND (p_archetype IS NULL OR sr.primary_archetype = p_archetype)
    ),
    'archetype_distribution', COALESCE((
      SELECT json_agg(row_to_json(ad)) FROM (
        SELECT sr.primary_archetype AS archetype, COUNT(*)::int AS count
        FROM scoring_result sr
        JOIN survey_submission ss ON ss.id = sr.survey_submission_id
        WHERE ss.created_date_time BETWEEN effective_since AND effective_until
          AND (p_utm IS NULL OR ss.utm_tracker ILIKE '%' || p_utm || '%')
          AND (p_archetype IS NULL OR sr.primary_archetype = p_archetype)
        GROUP BY sr.primary_archetype
        ORDER BY count DESC
      ) ad
    ), '[]'::json),
    'top_drop_off', COALESCE((
      SELECT json_agg(row_to_json(d)) FROM (
        SELECT sbe.q_id, COUNT(*)::int AS count
        FROM survey_behavior_event sbe
        WHERE sbe.direction = 'abandon'
          AND sbe.event_time BETWEEN effective_since AND effective_until
        GROUP BY sbe.q_id
        ORDER BY count DESC
        LIMIT 5
      ) d
    ), '[]'::json),
    'avg_time_top', COALESCE((
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT sbe.q_id, ROUND(AVG(sbe.time_spent_ms))::int AS avg_ms
        FROM survey_behavior_event sbe
        WHERE sbe.direction IN ('forward', 'back')
          AND sbe.event_time BETWEEN effective_since AND effective_until
          AND sbe.q_id NOT LIKE '00%'
        GROUP BY sbe.q_id
        ORDER BY avg_ms DESC
        LIMIT 5
      ) t
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_segment_metrics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT) TO service_role;


-- ═══════════════════════════════════════════════════════════
-- 4. get_archetype_correlation
--    Cross-tab of V4 vs V5 primary archetypes
-- ═══════════════════════════════════════════════════════════
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

GRANT EXECUTE ON FUNCTION get_archetype_correlation(TIMESTAMPTZ) TO service_role;


-- ═══════════════════════════════════════════════════════════
-- 5. get_full_answer_distribution
--    Answer distributions with archetype/UTM filters
-- ═══════════════════════════════════════════════════════════
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

GRANT EXECUTE ON FUNCTION get_full_answer_distribution(TIMESTAMPTZ, TEXT, TEXT) TO service_role;


-- ═══════════════════════════════════════════════════════════
-- 6. get_recent_activity
--    Unified event stream across submissions, waitlist, surveys, invites
-- ═══════════════════════════════════════════════════════════
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

GRANT EXECUTE ON FUNCTION get_recent_activity(TIMESTAMPTZ, INT) TO service_role;


-- ═══════════════════════════════════════════════════════════
-- 7. get_at_risk_sessions
--    Identifies in-progress survey sessions likely to abandon
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_at_risk_sessions()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json) INTO result
  FROM (
    SELECT
      sps.session_id,
      sps.current_index,
      sps.started_at,
      sps.saved_at,
      (SELECT count(*) FROM jsonb_object_keys(sps.answers))::int AS answers_count,
      ROUND(EXTRACT(EPOCH FROM (now() - sps.saved_at)) / 60)::int AS minutes_since_save,
      ROUND(EXTRACT(EPOCH FROM (sps.saved_at - sps.started_at)) / 60)::int AS total_minutes,
      COALESCE(beh.backtrack_count, 0) AS backtrack_count,
      COALESCE(beh.total_events, 0) AS total_events,
      CASE
        WHEN EXTRACT(EPOCH FROM (now() - sps.saved_at)) > 3600 THEN 'stale'
        WHEN sps.current_index < 10
          AND EXTRACT(EPOCH FROM (sps.saved_at - sps.started_at)) > 900 THEN 'struggling'
        WHEN COALESCE(beh.backtrack_count, 0) > 5 THEN 'high_backtrack'
        ELSE 'normal'
      END AS risk_level
    FROM survey_partial_save sps
    LEFT JOIN (
      SELECT session_id,
             COUNT(*) FILTER (WHERE direction = 'back') AS backtrack_count,
             COUNT(*) AS total_events
      FROM survey_behavior_event
      GROUP BY session_id
    ) beh ON beh.session_id = sps.session_id
    WHERE NOT EXISTS (
      SELECT 1 FROM survey_submission ss
      WHERE ss.session_id = sps.session_id
    )
    ORDER BY
      CASE
        WHEN EXTRACT(EPOCH FROM (now() - sps.saved_at)) > 3600 THEN 3
        WHEN sps.current_index < 10
          AND EXTRACT(EPOCH FROM (sps.saved_at - sps.started_at)) > 900 THEN 2
        WHEN COALESCE(beh.backtrack_count, 0) > 5 THEN 1
        ELSE 0
      END DESC,
      sps.saved_at DESC
    LIMIT 100
  ) r;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_at_risk_sessions() TO service_role;
