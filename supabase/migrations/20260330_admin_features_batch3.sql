-- Migration: Admin features batch 3
-- New tables: admin_goals, admin_tag_rules

-- ─── admin_goals ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_goals (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email     text NOT NULL,
  metric_key      text NOT NULL,
  target_value    numeric NOT NULL,
  current_value   numeric NOT NULL DEFAULT 0,
  deadline        date,
  label           text NOT NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_goals_email ON admin_goals(admin_email);
CREATE INDEX IF NOT EXISTS idx_admin_goals_status ON admin_goals(status);

ALTER TABLE admin_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON admin_goals
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
  );

-- ─── admin_tag_rules ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_tag_rules (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tag_id          bigint NOT NULL REFERENCES submission_tag(id) ON DELETE CASCADE,
  field           text NOT NULL,
  operator        text NOT NULL CHECK (operator IN ('gt','gte','lt','lte','eq','contains')),
  value           text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tag_rules_active ON admin_tag_rules(is_active);

ALTER TABLE admin_tag_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON admin_tag_rules
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
  );


-- ═══════════════════════════════════════════════════════════
-- RPC: get_conversion_pipeline
--   Full conversion funnel from waitlist through payment
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_conversion_pipeline(since_ts TIMESTAMPTZ)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  SELECT json_build_object(
    'stages', json_build_object(
      'waitlist_signups', (
        SELECT COUNT(*)::int FROM waitlist_user
        WHERE created_date_time >= effective_since
      ),
      'survey_started', (
        SELECT COUNT(DISTINCT session_id)::int FROM survey_behavior_event
        WHERE event_time >= effective_since
      ),
      'survey_completed', (
        SELECT COUNT(*)::int FROM survey_submission
        WHERE status = 'completed' AND created_date_time >= effective_since
      ),
      'scored', (
        SELECT COUNT(*)::int FROM scoring_result sr
        JOIN survey_submission ss ON ss.id = sr.survey_submission_id
        WHERE ss.created_date_time >= effective_since
      ),
      'report_generated', (
        SELECT COUNT(*)::int FROM personal_report pr
        JOIN survey_submission ss ON ss.id = pr.survey_submission_id
        WHERE ss.created_date_time >= effective_since
      ),
      'report_viewed', (
        SELECT COUNT(DISTINCT rs.personal_report_id)::int
        FROM report_session rs
        JOIN personal_report pr ON pr.id = rs.personal_report_id
        JOIN survey_submission ss ON ss.id = pr.survey_submission_id
        WHERE rs.started_at >= effective_since
      ),
      'payment_completed', (
        SELECT COUNT(*)::int FROM payment
        WHERE status = 'completed' AND created_date_time >= effective_since
      )
    ),
    'daily_funnel', COALESCE((
      SELECT json_agg(row_to_json(d)) FROM (
        SELECT
          dt.day::date AS date,
          COALESCE(wl.cnt, 0) AS waitlist,
          COALESCE(sv.cnt, 0) AS survey_started,
          COALESCE(sc.cnt, 0) AS survey_completed
        FROM generate_series(
          (effective_since)::date,
          CURRENT_DATE,
          '1 day'::interval
        ) dt(day)
        LEFT JOIN (
          SELECT created_date_time::date AS d, COUNT(*)::int AS cnt
          FROM waitlist_user WHERE created_date_time >= effective_since
          GROUP BY d
        ) wl ON wl.d = dt.day::date
        LEFT JOIN (
          SELECT event_time::date AS d, COUNT(DISTINCT session_id)::int AS cnt
          FROM survey_behavior_event WHERE event_time >= effective_since AND direction = 'forward' AND question_index = 0
          GROUP BY d
        ) sv ON sv.d = dt.day::date
        LEFT JOIN (
          SELECT created_date_time::date AS d, COUNT(*)::int AS cnt
          FROM survey_submission WHERE status = 'completed' AND created_date_time >= effective_since
          GROUP BY d
        ) sc ON sc.d = dt.day::date
        ORDER BY dt.day
      ) d
    ), '[]'::json),
    'time_to_complete', json_build_object(
      'avg_hours', (
        SELECT ROUND(AVG(duration_ms::numeric / 3600000), 1)
        FROM survey_submission
        WHERE status = 'completed' AND duration_ms > 0 AND created_date_time >= effective_since
      ),
      'median_hours', (
        SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms::numeric / 3600000)::numeric, 1)
        FROM survey_submission
        WHERE status = 'completed' AND duration_ms > 0 AND created_date_time >= effective_since
      )
    ),
    'by_utm', COALESCE((
      SELECT json_agg(row_to_json(u)) FROM (
        SELECT
          COALESCE(
            (ss.utm_tracker::jsonb ->> 'utm_source'),
            'Direct'
          ) AS source,
          COUNT(*)::int AS total,
          COUNT(CASE WHEN ss.status = 'completed' THEN 1 END)::int AS completed,
          ROUND(
            COUNT(CASE WHEN ss.status = 'completed' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100
          , 1) AS conversion_rate
        FROM survey_submission ss
        WHERE ss.created_date_time >= effective_since
        GROUP BY source
        ORDER BY total DESC
        LIMIT 10
      ) u
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_conversion_pipeline(TIMESTAMPTZ) TO service_role;


-- ═══════════════════════════════════════════════════════════
-- RPC: get_archetype_comparison
--   Detailed comparison data for selected archetypes
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_archetype_comparison(p_archetypes TEXT[])
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'archetypes', COALESCE((
      SELECT json_agg(row_to_json(a)) FROM (
        SELECT
          sr.primary_archetype AS name,
          COUNT(*)::int AS count,
          ROUND(AVG(ss.duration_ms)::numeric / 60000, 1) AS avg_duration_min,
          json_build_object(
            'percentages', (
              SELECT json_object_agg(key, ROUND(val::numeric, 2))
              FROM (
                SELECT key, AVG(value::numeric) AS val
                FROM scoring_result sr2
                CROSS JOIN LATERAL jsonb_each_text(sr2.percentages)
                WHERE sr2.primary_archetype = sr.primary_archetype
                GROUP BY key
              ) avg_pcts
            )
          ) AS scoring
        FROM scoring_result sr
        JOIN survey_submission ss ON ss.id = sr.survey_submission_id
        WHERE sr.primary_archetype = ANY(p_archetypes)
        GROUP BY sr.primary_archetype
      ) a
    ), '[]'::json),

    'dimension_profiles', COALESCE((
      SELECT json_agg(row_to_json(dp)) FROM (
        SELECT
          sr.primary_archetype AS archetype,
          sq.frontend_qid AS q_id,
          ROUND(AVG(ssa.normalized_value)::numeric, 2) AS avg_value,
          COUNT(*)::int AS n
        FROM survey_submission_answer ssa
        JOIN survey_question sq ON sq.id = ssa.survey_question_id
        JOIN survey_submission ss ON ss.id = ssa.survey_submission_id
        JOIN scoring_result sr ON sr.survey_submission_id = ss.id
        WHERE sq.type = 'scale'
          AND ssa.normalized_value IS NOT NULL
          AND sr.primary_archetype = ANY(p_archetypes)
        GROUP BY sr.primary_archetype, sq.frontend_qid
      ) dp
    ), '[]'::json),

    'behavior', COALESCE((
      SELECT json_agg(row_to_json(b)) FROM (
        SELECT
          sr.primary_archetype AS archetype,
          COUNT(DISTINCT sbe.session_id)::int AS sessions,
          ROUND(AVG(sbe.time_spent_ms)::numeric / 1000, 1) AS avg_time_per_q_sec,
          COUNT(CASE WHEN sbe.direction = 'back' THEN 1 END)::int AS backtracks,
          COUNT(CASE WHEN sbe.direction = 'abandon' THEN 1 END)::int AS abandonments
        FROM scoring_result sr
        JOIN survey_submission ss ON ss.id = sr.survey_submission_id
        LEFT JOIN survey_behavior_event sbe ON sbe.session_id = ss.session_id
        WHERE sr.primary_archetype = ANY(p_archetypes)
        GROUP BY sr.primary_archetype
      ) b
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_archetype_comparison(TEXT[]) TO service_role;


-- ═══════════════════════════════════════════════════════════
-- RPC: get_automated_insights
--   Computes anomalies and notable patterns
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_automated_insights(p_days INT DEFAULT 7)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  current_start TIMESTAMPTZ;
  prev_start TIMESTAMPTZ;
  prev_end TIMESTAMPTZ;
BEGIN
  current_start := now() - (p_days || ' days')::interval;
  prev_end := current_start;
  prev_start := prev_end - (p_days || ' days')::interval;

  SELECT json_build_object(
    'period_comparison', json_build_object(
      'current_submissions', (
        SELECT COUNT(*)::int FROM survey_submission WHERE created_date_time >= current_start
      ),
      'previous_submissions', (
        SELECT COUNT(*)::int FROM survey_submission WHERE created_date_time >= prev_start AND created_date_time < prev_end
      ),
      'current_completion_rate', (
        SELECT ROUND(
          COUNT(CASE WHEN status = 'completed' THEN 1 END)::numeric /
          NULLIF(COUNT(*), 0) * 100, 1
        ) FROM survey_submission WHERE created_date_time >= current_start
      ),
      'previous_completion_rate', (
        SELECT ROUND(
          COUNT(CASE WHEN status = 'completed' THEN 1 END)::numeric /
          NULLIF(COUNT(*), 0) * 100, 1
        ) FROM survey_submission WHERE created_date_time >= prev_start AND created_date_time < prev_end
      ),
      'current_avg_duration_min', (
        SELECT ROUND(AVG(duration_ms)::numeric / 60000, 1)
        FROM survey_submission WHERE created_date_time >= current_start AND duration_ms > 0
      ),
      'previous_avg_duration_min', (
        SELECT ROUND(AVG(duration_ms)::numeric / 60000, 1)
        FROM survey_submission WHERE created_date_time >= prev_start AND created_date_time < prev_end AND duration_ms > 0
      ),
      'current_waitlist', (
        SELECT COUNT(*)::int FROM waitlist_user WHERE created_date_time >= current_start
      ),
      'previous_waitlist', (
        SELECT COUNT(*)::int FROM waitlist_user WHERE created_date_time >= prev_start AND created_date_time < prev_end
      )
    ),

    'top_drop_off_questions', COALESCE((
      SELECT json_agg(row_to_json(q)) FROM (
        SELECT sbe.q_id, COUNT(*)::int AS abandon_count
        FROM survey_behavior_event sbe
        WHERE sbe.direction = 'abandon' AND sbe.event_time >= current_start
        GROUP BY sbe.q_id
        ORDER BY abandon_count DESC
        LIMIT 5
      ) q
    ), '[]'::json),

    'fastest_growing_archetype', (
      SELECT json_build_object('archetype', archetype, 'current', cur, 'previous', prev)
      FROM (
        SELECT
          sr.primary_archetype AS archetype,
          COUNT(CASE WHEN ss.created_date_time >= current_start THEN 1 END)::int AS cur,
          COUNT(CASE WHEN ss.created_date_time >= prev_start AND ss.created_date_time < prev_end THEN 1 END)::int AS prev
        FROM scoring_result sr
        JOIN survey_submission ss ON ss.id = sr.survey_submission_id
        WHERE ss.created_date_time >= prev_start
        GROUP BY sr.primary_archetype
        HAVING COUNT(CASE WHEN ss.created_date_time >= prev_start AND ss.created_date_time < prev_end THEN 1 END) > 0
        ORDER BY (
          COUNT(CASE WHEN ss.created_date_time >= current_start THEN 1 END)::numeric /
          NULLIF(COUNT(CASE WHEN ss.created_date_time >= prev_start AND ss.created_date_time < prev_end THEN 1 END), 0)
        ) DESC NULLS LAST
        LIMIT 1
      ) fg
    ),

    'high_friction_questions', COALESCE((
      SELECT json_agg(row_to_json(hf)) FROM (
        SELECT
          sbe.q_id,
          ROUND(AVG(sbe.time_spent_ms)::numeric / 1000, 1) AS avg_time_sec,
          COUNT(CASE WHEN sbe.direction = 'back' THEN 1 END)::int AS backtrack_count
        FROM survey_behavior_event sbe
        WHERE sbe.event_time >= current_start
        GROUP BY sbe.q_id
        HAVING AVG(sbe.time_spent_ms) > (
          SELECT AVG(time_spent_ms) * 2 FROM survey_behavior_event WHERE event_time >= current_start
        )
        ORDER BY avg_time_sec DESC
        LIMIT 5
      ) hf
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_automated_insights(INT) TO service_role;
