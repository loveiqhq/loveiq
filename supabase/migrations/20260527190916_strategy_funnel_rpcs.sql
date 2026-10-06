-- Strategy-lead funnel intelligence RPCs
--
-- Five SECURITY DEFINER functions consumed by the daily + weekly Slack
-- funnel-digest (app/api/cron/funnel-digest/route.ts via
-- features/admin/server/digest-metrics.ts). Each function returns JSON so the
-- Node side can parse with a single .json() and tolerate schema growth.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Supporting index — every new RPC filters analytics_event by
-- (event_type, event_time). The existing index set only covers the FK
-- columns. Without this composite, each subquery does a sequential scan,
-- which at ~1M analytics events would push the digest past the 60s cron cap.
-- ═══════════════════════════════════════════════════════════════════════════

-- migration-lint: ignore
-- (Reason: already applied to prod. The non-CONCURRENTLY index build is
--  intentional — this migration creates SECURITY DEFINER functions in the same
--  implicit transaction, and CREATE INDEX CONCURRENTLY cannot run inside a
--  transaction. analytics_event was small (~1k rows) at apply time, so the
--  brief ACCESS EXCLUSIVE lock was negligible.)
CREATE INDEX IF NOT EXISTS idx_analytics_event_type_time
  ON public.analytics_event (event_type, event_time);
--
-- Conventions match the existing get_conversion_funnel pattern at
-- 20260328092643_admin_analytics_rpcs_1_conversion_funnel.sql:
--   * Half-open [since_ts, until_ts) windows
--   * SECURITY DEFINER + explicit GRANT EXECUTE TO service_role
--   * COALESCE on aggregates so the JSON is always shaped, never NULL
--
-- All five functions are read-only (SELECT only) and degrade gracefully on
-- empty windows (return zero counts / empty arrays, never throw).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. get_wizard_funnel
-- ═══════════════════════════════════════════════════════════════════════════
-- Slide-by-slide retention through the PreReportWizard (5 slides) plus the
-- subsequent report-viewed step. Per-slide counts are DISTINCT submissions
-- that have at least one wizard_slide_advanced event with `to_slide = N`
-- inside the window. The report-viewed step is the intersection: distinct
-- submissions that ALSO have a report_viewed event in the same window.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_wizard_funnel(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  WITH advanced AS (
    -- Guard: `metadata->>'to_slide'` is text. Cast to int ONLY when the value
    -- matches a non-negative integer regex — otherwise a malicious client that
    -- POSTs `{ to_slide: "foo" }` would crash the cast and the whole RPC.
    SELECT survey_submission_id, (metadata->>'to_slide')::int AS to_slide
    FROM analytics_event
    WHERE event_type = 'wizard_slide_advanced'
      AND event_time >= since_ts
      AND event_time <  until_ts
      AND survey_submission_id IS NOT NULL
      AND metadata ? 'to_slide'
      AND metadata->>'to_slide' ~ '^[0-9]+$'
  ),
  per_slide AS (
    SELECT to_slide, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM advanced
    GROUP BY to_slide
  ),
  report_viewers AS (
    SELECT COUNT(DISTINCT a.survey_submission_id)::int AS n
    FROM analytics_event a
    WHERE a.event_type = 'report_viewed'
      AND a.event_time >= since_ts
      AND a.event_time <  until_ts
      AND a.survey_submission_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM advanced w WHERE w.survey_submission_id = a.survey_submission_id
      )
  )
  SELECT json_build_object(
    'slide1',        COALESCE((SELECT n FROM per_slide WHERE to_slide = 1), 0),
    'slide2',        COALESCE((SELECT n FROM per_slide WHERE to_slide = 2), 0),
    'slide3',        COALESCE((SELECT n FROM per_slide WHERE to_slide = 3), 0),
    'slide4',        COALESCE((SELECT n FROM per_slide WHERE to_slide = 4), 0),
    'slide5',        COALESCE((SELECT n FROM per_slide WHERE to_slide = 5), 0),
    'reportViewed',  COALESCE((SELECT n FROM report_viewers),               0)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_wizard_funnel(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. get_dropoff_everywhere
-- ═══════════════════════════════════════════════════════════════════════════
-- One pass over every funnel edge from landing → purchased. Returns an
-- ordered array of {name, count} stages so the Node renderer can walk them
-- once and compute stage-kept % + biggest-leak inline.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_dropoff_everywhere(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
  since_day DATE := since_ts::date;
  until_day DATE := until_ts::date;
BEGIN
  SELECT json_build_object(
    'stages', json_build_array(
      json_build_object('name', 'unique_visitors', 'count', (
        SELECT COUNT(DISTINCT visitor_id)::int FROM funnel_event
        WHERE event_type = 'unique_visitor' AND day >= since_day AND day < until_day
      )),
      json_build_object('name', 'saw_q1', 'count', (
        SELECT COUNT(DISTINCT visitor_id)::int FROM funnel_event
        WHERE event_type = 'survey_engine_mount' AND day >= since_day AND day < until_day
      )),
      json_build_object('name', 'survey_started', 'count', (
        SELECT COUNT(DISTINCT session_id)::int FROM survey_partial_save
        WHERE started_at >= since_ts AND started_at < until_ts
      )),
      json_build_object('name', 'q1_answered', 'count', (
        SELECT COUNT(DISTINCT session_id)::int FROM survey_behavior_event
        WHERE answered = true AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'completed_all_questions', 'count', (
        SELECT COUNT(DISTINCT session_id)::int FROM survey_behavior_event
        WHERE direction = 'complete' AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'survey_submitted', 'count', (
        SELECT COUNT(*)::int FROM survey_submission
        WHERE status = 'completed'
          AND created_date_time >= since_ts AND created_date_time < until_ts
      )),
      json_build_object('name', 'wizard_slide_1', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'wizard_slide_advanced'
          AND metadata->>'to_slide' ~ '^[0-9]+$'
          AND (metadata->>'to_slide')::int = 1
          AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'wizard_slide_5', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'wizard_slide_advanced'
          AND metadata->>'to_slide' ~ '^[0-9]+$'
          AND (metadata->>'to_slide')::int = 5
          AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'report_viewed', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'report_viewed'
          AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'engagement_1min', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'report_engagement_1min'
          AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'engagement_5min', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'report_engagement_5min'
          AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'engagement_10min', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'report_engagement_10min'
          AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'paywall_initiated', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'paywall_initiated'
          AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'begin_checkout', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'begin_checkout'
          AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'purchased', 'count', (
        SELECT COUNT(*)::int FROM payment
        WHERE status = 'succeeded'
          AND created_date_time >= since_ts AND created_date_time < until_ts
      ))
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dropoff_everywhere(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. get_answer_conversion_lift
-- ═══════════════════════════════════════════════════════════════════════════
-- For each (question, answer-option) cohort with n >= min_n, compute the
-- cohort's purchase rate vs the survey-wide baseline. Returns the top 5 by
-- absolute lift %. Handles both single-select (answer_option_id on the row)
-- and multi-select (via survey_submission_answer_options join).
--
-- "Purchased" means: a personal_report exists for the submission AND that
-- report has a payment with status='succeeded' (any time, not windowed —
-- a purchase 3 days after the submission still counts for the submission's
-- cohort, which is what lift analysis needs).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_answer_conversion_lift(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ,
  min_n INT DEFAULT 10
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
  baseline_rate NUMERIC;
  baseline_total INT;
  baseline_paid INT;
BEGIN
  -- 1. baseline: all completed submissions in window + their purchase status
  WITH submissions AS (
    SELECT ss.id,
           EXISTS (
             SELECT 1 FROM personal_report pr
             JOIN payment p ON p.personal_report_id = pr.id
             WHERE pr.survey_submission_id = ss.id AND p.status = 'succeeded'
           ) AS purchased
    FROM survey_submission ss
    WHERE ss.status = 'completed'
      AND ss.created_date_time >= since_ts
      AND ss.created_date_time <  until_ts
  )
  SELECT COUNT(*)::int, COUNT(*) FILTER (WHERE purchased)::int
  INTO baseline_total, baseline_paid
  FROM submissions;

  IF baseline_total < min_n THEN
    -- Not enough sample for any meaningful lift; return shape with empty pairs.
    SELECT json_build_object(
      'baseline_pct', 0,
      'baseline_n',   baseline_total,
      'baseline_paid', baseline_paid,
      'pairs',        '[]'::json
    ) INTO result;
    RETURN result;
  END IF;

  baseline_rate := baseline_paid::numeric / baseline_total::numeric;

  -- 2. per (question, option) cohort: count + paid count
  WITH submissions AS (
    SELECT ss.id,
           EXISTS (
             SELECT 1 FROM personal_report pr
             JOIN payment p ON p.personal_report_id = pr.id
             WHERE pr.survey_submission_id = ss.id AND p.status = 'succeeded'
           ) AS purchased
    FROM survey_submission ss
    WHERE ss.status = 'completed'
      AND ss.created_date_time >= since_ts
      AND ss.created_date_time <  until_ts
  ),
  picks AS (
    -- single-select picks (scoped to window-completed submissions for index use)
    SELECT ssa.survey_submission_id, ssa.survey_question_id, ssa.answer_option_id
    FROM survey_submission_answer ssa
    WHERE ssa.answer_option_id IS NOT NULL
      AND ssa.survey_submission_id IN (SELECT id FROM submissions)
    UNION ALL
    -- multi-select picks (also window-scoped). Multi-select rows have a NULL
    -- ssa.answer_option_id with N rows in the _options join table.
    SELECT ssa.survey_submission_id, ssa.survey_question_id, ssao.answer_option_id
    FROM survey_submission_answer ssa
    JOIN survey_submission_answer_options ssao
      ON ssao.survey_submission_answer_id = ssa.id
    WHERE ssa.survey_submission_id IN (SELECT id FROM submissions)
  ),
  pairs AS (
    SELECT
      sq.frontend_qid AS q_id,
      sq.question      AS q_text,
      ao.option_text   AS answer,
      COUNT(*)::int                              AS n,
      COUNT(*) FILTER (WHERE s.purchased)::int   AS paid_n
    FROM picks p
    JOIN submissions s        ON s.id  = p.survey_submission_id
    JOIN survey_question sq   ON sq.id = p.survey_question_id
    JOIN answer_option ao     ON ao.id = p.answer_option_id
    WHERE sq.frontend_qid IS NOT NULL
      AND ao.option_text  IS NOT NULL
    GROUP BY sq.frontend_qid, sq.question, ao.option_text
    HAVING COUNT(*) >= min_n
  ),
  ranked AS (
    SELECT
      q_id, q_text, answer, n, paid_n,
      CASE WHEN n > 0 THEN ROUND(paid_n::numeric / n * 100, 1) ELSE 0 END AS rate_pct,
      CASE
        WHEN baseline_rate > 0 AND n > 0
        THEN ROUND(((paid_n::numeric / n) - baseline_rate) / baseline_rate * 100)::int
        ELSE NULL
      END AS lift_pct
    FROM pairs
  )
  SELECT json_build_object(
    'baseline_pct',  ROUND(baseline_rate * 100, 1),
    'baseline_n',    baseline_total,
    'baseline_paid', baseline_paid,
    'pairs', COALESCE((
      SELECT json_agg(row_to_json(r))
      FROM (
        SELECT q_id, q_text, answer, n, paid_n, rate_pct, lift_pct
        FROM ranked
        WHERE lift_pct IS NOT NULL
        ORDER BY ABS(lift_pct) DESC NULLS LAST, n DESC
        LIMIT 5
      ) r
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_answer_conversion_lift(TIMESTAMPTZ, TIMESTAMPTZ, INT) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. get_engagement_purchase_lift
-- ═══════════════════════════════════════════════════════════════════════════
-- Buckets submissions by their highest engagement-event reached in the
-- window (report_engagement_10min > 5min > 1min > viewed-only) and reports
-- per-bucket purchase rate. Only submissions that opened the report at
-- least once (`report_viewed`) are included — pre-report users dilute the
-- signal otherwise.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_engagement_purchase_lift(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  WITH viewed AS (
    SELECT DISTINCT survey_submission_id
    FROM analytics_event
    WHERE event_type = 'report_viewed'
      AND event_time >= since_ts AND event_time < until_ts
      AND survey_submission_id IS NOT NULL
  ),
  engaged AS (
    SELECT survey_submission_id,
           BOOL_OR(event_type = 'report_engagement_10min') AS e10,
           BOOL_OR(event_type = 'report_engagement_5min')  AS e5,
           BOOL_OR(event_type = 'report_engagement_1min')  AS e1
    FROM analytics_event
    WHERE event_type IN ('report_engagement_1min', 'report_engagement_5min', 'report_engagement_10min')
      AND event_time >= since_ts AND event_time < until_ts
      AND survey_submission_id IS NOT NULL
    GROUP BY survey_submission_id
  ),
  per_sub AS (
    SELECT v.survey_submission_id,
           CASE
             WHEN COALESCE(e.e10, false) THEN '10m+'
             WHEN COALESCE(e.e5,  false) THEN '5-10m'
             WHEN COALESCE(e.e1,  false) THEN '1-5m'
             ELSE '0-1m'
           END AS bucket,
           EXISTS (
             SELECT 1 FROM personal_report pr
             JOIN payment p ON p.personal_report_id = pr.id
             WHERE pr.survey_submission_id = v.survey_submission_id AND p.status = 'succeeded'
           ) AS purchased
    FROM viewed v
    LEFT JOIN engaged e ON e.survey_submission_id = v.survey_submission_id
  ),
  agg AS (
    SELECT bucket,
           COUNT(*)::int                              AS n,
           COUNT(*) FILTER (WHERE purchased)::int     AS paid
    FROM per_sub
    GROUP BY bucket
  )
  SELECT json_build_object(
    'buckets', COALESCE((
      SELECT json_agg(row_to_json(b) ORDER BY ord)
      FROM (
        SELECT
          bucket, n, paid,
          CASE bucket
            WHEN '0-1m'  THEN 1
            WHEN '1-5m'  THEN 2
            WHEN '5-10m' THEN 3
            WHEN '10m+'  THEN 4
            ELSE 99
          END AS ord
        FROM agg
      ) b
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_engagement_purchase_lift(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. get_funnel_sparklines
-- ═══════════════════════════════════════════════════════════════════════════
-- One row per UTC day in the window for the six top-line funnel metrics.
-- Days with zero traffic still produce a row (count = 0) so the Node-side
-- sparkline renderer can always emit a fixed-width string.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_funnel_sparklines(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
  since_day DATE := since_ts::date;
  until_day DATE := until_ts::date;
BEGIN
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(since_day, until_day - INTERVAL '1 day', INTERVAL '1 day') AS d
  ),
  visitors AS (
    SELECT day, COUNT(DISTINCT visitor_id)::int AS n
    FROM funnel_event
    WHERE event_type = 'unique_visitor' AND day >= since_day AND day < until_day
    GROUP BY day
  ),
  starts AS (
    SELECT started_at::date AS day, COUNT(DISTINCT session_id)::int AS n
    FROM survey_partial_save
    WHERE started_at >= since_ts AND started_at < until_ts
    GROUP BY started_at::date
  ),
  completions AS (
    SELECT created_date_time::date AS day, COUNT(*)::int AS n
    FROM survey_submission
    WHERE status = 'completed'
      AND created_date_time >= since_ts AND created_date_time < until_ts
    GROUP BY created_date_time::date
  ),
  rv AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'report_viewed'
      AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  pw AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'paywall_initiated'
      AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  purchases AS (
    SELECT created_date_time::date AS day, COUNT(*)::int AS n
    FROM payment
    WHERE status = 'succeeded'
      AND created_date_time >= since_ts AND created_date_time < until_ts
    GROUP BY created_date_time::date
  )
  SELECT json_build_object(
    'days', COALESCE((
      SELECT json_agg(json_build_object(
        'day',           to_char(days.day, 'YYYY-MM-DD'),
        'visitors',      COALESCE(visitors.n, 0),
        'starts',        COALESCE(starts.n, 0),
        'completions',   COALESCE(completions.n, 0),
        'report_views',  COALESCE(rv.n, 0),
        'paywall_init',  COALESCE(pw.n, 0),
        'purchases',     COALESCE(purchases.n, 0)
      ) ORDER BY days.day)
      FROM days
      LEFT JOIN visitors    ON visitors.day    = days.day
      LEFT JOIN starts      ON starts.day      = days.day
      LEFT JOIN completions ON completions.day = days.day
      LEFT JOIN rv          ON rv.day          = days.day
      LEFT JOIN pw          ON pw.day          = days.day
      LEFT JOIN purchases   ON purchases.day   = days.day
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_funnel_sparklines(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
