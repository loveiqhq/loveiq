-- Migration: Admin features batch 2
-- 2 new tables + 3 new RPCs

-- ─── admin_chart_annotation ─────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_chart_annotation (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email     text NOT NULL,
  chart_key       text NOT NULL,
  annotation_date date NOT NULL,
  note            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chart_annotation_key ON admin_chart_annotation(chart_key);
CREATE INDEX IF NOT EXISTS idx_chart_annotation_date ON admin_chart_annotation(annotation_date);

ALTER TABLE admin_chart_annotation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON admin_chart_annotation
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
  );

-- ─── admin_export_preset ────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_export_preset (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email     text NOT NULL,
  name            text NOT NULL,
  config          jsonb NOT NULL,
  is_shared       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_preset_email ON admin_export_preset(admin_email);

ALTER TABLE admin_export_preset ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON admin_export_preset
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
  );


-- ═══════════════════════════════════════════════════════════
-- RPC 1: get_referral_chains
--   Builds referral stats from invite_event table
-- ═══════════════════════════════════════════════════════════
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
          AND ie.referrer_email IS NOT NULL
          AND ie.referrer_email != ''
      ),
      'unique_referrers', (
        SELECT COUNT(DISTINCT ie.referrer_email)::int FROM invite_event ie
        WHERE ie.created_at >= effective_since
          AND ie.referrer_email IS NOT NULL
          AND ie.referrer_email != ''
      ),
      'total_completions', (
        SELECT COUNT(DISTINCT ss.id)::int
        FROM invite_event ie
        JOIN app_user au ON LOWER(au.email) = LOWER(ie.recipient_email)
        JOIN survey_submission ss ON ss.user_id = au.id AND ss.status = 'completed'
        WHERE ie.created_at >= effective_since
      ),
      'viral_coefficient', (
        SELECT CASE
          WHEN completed_users = 0 THEN 0
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
          WHERE ss2.status = 'completed'
            AND ss2.created_date_time >= effective_since
        ) sub
      ),
      'methods', COALESCE((
        SELECT json_agg(row_to_json(m)) FROM (
          SELECT ie.invite_method AS method, COUNT(*)::int AS count
          FROM invite_event ie
          WHERE ie.created_at >= effective_since
            AND ie.invite_method IS NOT NULL
          GROUP BY ie.invite_method
          ORDER BY count DESC
        ) m
      ), '[]'::json)
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_referral_chains(TIMESTAMPTZ) TO service_role;


-- ═══════════════════════════════════════════════════════════
-- RPC 2: get_question_discrimination
--   Computes eta-squared for each scale question
-- ═══════════════════════════════════════════════════════════
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
      SELECT
        sq.frontend_qid AS q_id,
        sr.primary_archetype,
        ssa.normalized_value
      FROM survey_submission_answer ssa
      JOIN survey_question sq ON sq.id = ssa.survey_question_id
      JOIN survey_submission ss ON ss.id = ssa.survey_submission_id
      JOIN scoring_result sr ON sr.survey_submission_id = ss.id
      WHERE sq.type = 'scale'
        AND ssa.normalized_value IS NOT NULL
        AND sr.primary_archetype IS NOT NULL
        AND ss.created_date_time >= effective_since
    ),
    grand_stats AS (
      SELECT
        q_id,
        COUNT(*)::int AS n_responses,
        AVG(normalized_value) AS grand_mean,
        VARIANCE(normalized_value) AS total_var
      FROM answer_data
      GROUP BY q_id
      HAVING COUNT(*) >= 10
    ),
    group_stats AS (
      SELECT
        q_id,
        primary_archetype,
        AVG(normalized_value) AS group_mean,
        COUNT(*)::int AS group_n
      FROM answer_data
      GROUP BY q_id, primary_archetype
    ),
    between_var AS (
      SELECT
        gs.q_id,
        SUM(gs.group_n * POWER(gs.group_mean - gst.grand_mean, 2)) / NULLIF(gst.n_responses - 1, 0) AS ssb
      FROM group_stats gs
      JOIN grand_stats gst ON gst.q_id = gs.q_id
      GROUP BY gs.q_id, gst.grand_mean, gst.n_responses
    )
    SELECT
      gst.q_id,
      gst.n_responses,
      ROUND(
        CASE
          WHEN gst.total_var IS NULL OR gst.total_var = 0 THEN 0
          ELSE COALESCE(bv.ssb / gst.total_var, 0)
        END::numeric, 4
      ) AS discrimination_index
    FROM grand_stats gst
    LEFT JOIN between_var bv ON bv.q_id = gst.q_id
    ORDER BY discrimination_index DESC
  ) d;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_question_discrimination(TIMESTAMPTZ) TO service_role;


-- ═══════════════════════════════════════════════════════════
-- RPC 3: get_waitlist_conversion
--   Tracks waitlist signup → survey completion journey
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_waitlist_conversion(since_ts TIMESTAMPTZ)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  SELECT json_build_object(
    'funnel', json_build_object(
      'total', (
        SELECT COUNT(*)::int FROM waitlist_user wu
        WHERE wu.created_date_time >= effective_since
      ),
      'mapped', (
        SELECT COUNT(DISTINCT wm.user_id)::int
        FROM waitlist_mapping wm
        JOIN waitlist_user wu ON wu.id = wm.waitlist_id
        WHERE wu.created_date_time >= effective_since
      ),
      'completed', (
        SELECT COUNT(DISTINCT ss.id)::int
        FROM waitlist_mapping wm
        JOIN waitlist_user wu ON wu.id = wm.waitlist_id
        JOIN survey_submission ss ON ss.user_id = wm.user_id AND ss.status = 'completed'
        WHERE wu.created_date_time >= effective_since
      ),
      'scored', (
        SELECT COUNT(DISTINCT sr.survey_submission_id)::int
        FROM waitlist_mapping wm
        JOIN waitlist_user wu ON wu.id = wm.waitlist_id
        JOIN survey_submission ss ON ss.user_id = wm.user_id AND ss.status = 'completed'
        JOIN scoring_result sr ON sr.survey_submission_id = ss.id
        WHERE wu.created_date_time >= effective_since
      )
    ),

    'avg_hours_to_convert', (
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ss.created_date_time - wu.created_date_time)) / 3600)::numeric, 1)
      FROM waitlist_mapping wm
      JOIN waitlist_user wu ON wu.id = wm.waitlist_id
      JOIN survey_submission ss ON ss.user_id = wm.user_id AND ss.status = 'completed'
      WHERE wu.created_date_time >= effective_since
    ),

    'time_buckets', COALESCE((
      SELECT json_agg(row_to_json(tb)) FROM (
        SELECT
          CASE
            WHEN hours < 1 THEN '< 1 hour'
            WHEN hours < 24 THEN '1-24 hours'
            WHEN hours < 168 THEN '1-7 days'
            ELSE '> 7 days'
          END AS label,
          COUNT(*)::int AS count
        FROM (
          SELECT EXTRACT(EPOCH FROM (ss.created_date_time - wu.created_date_time)) / 3600 AS hours
          FROM waitlist_mapping wm
          JOIN waitlist_user wu ON wu.id = wm.waitlist_id
          JOIN survey_submission ss ON ss.user_id = wm.user_id AND ss.status = 'completed'
          WHERE wu.created_date_time >= effective_since
        ) h
        GROUP BY label
        ORDER BY MIN(hours)
      ) tb
    ), '[]'::json),

    'by_archetype', COALESCE((
      SELECT json_agg(row_to_json(ba)) FROM (
        SELECT
          sr.primary_archetype AS archetype,
          COUNT(*)::int AS count,
          ROUND(AVG(EXTRACT(EPOCH FROM (ss.created_date_time - wu.created_date_time)) / 3600)::numeric, 1) AS avg_hours
        FROM waitlist_mapping wm
        JOIN waitlist_user wu ON wu.id = wm.waitlist_id
        JOIN survey_submission ss ON ss.user_id = wm.user_id AND ss.status = 'completed'
        JOIN scoring_result sr ON sr.survey_submission_id = ss.id
        WHERE wu.created_date_time >= effective_since
        GROUP BY sr.primary_archetype
        ORDER BY count DESC
      ) ba
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_waitlist_conversion(TIMESTAMPTZ) TO service_role;
