-- Extend get_funnel_cvr_sparklines with per-landing-variant fields so the daily
-- digest can render two extra charts:
--   • Dark  — Visitor → Survey-start  (control visitors → free-survey starts)
--   • White — pay funnel: Visitor → Started-checkout → Paid (white pays first)
--
-- New per-day fields (everything else unchanged):
--   visitors_control — unique_visitor rows tagged control (or legacy/untagged → control)
--   visitors_white   — unique_visitor rows tagged white
--   white_checkout   — prepaid_report_access rows created that day (white "clicked pay")
--   white_paid       — prepaid_report_access that reached status='succeeded' that day
--
-- The dark numerator reuses `starts` (survey_partial_save) — white users pay
-- BEFORE the survey engine, so partial-saves are effectively the dark cohort.

CREATE OR REPLACE FUNCTION get_funnel_cvr_sparklines(
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
  visitors_control AS (
    SELECT day, COUNT(DISTINCT visitor_id)::int AS n
    FROM funnel_event
    WHERE event_type = 'unique_visitor' AND day >= since_day AND day < until_day
      AND COALESCE(landing_variant, 'control') <> 'white'
    GROUP BY day
  ),
  visitors_white AS (
    SELECT day, COUNT(DISTINCT visitor_id)::int AS n
    FROM funnel_event
    WHERE event_type = 'unique_visitor' AND day >= since_day AND day < until_day
      AND landing_variant = 'white'
    GROUP BY day
  ),
  starts AS (
    SELECT started_at::date AS day, COUNT(DISTINCT session_id)::int AS n
    FROM survey_partial_save
    WHERE started_at >= since_ts AND started_at < until_ts
    GROUP BY started_at::date
  ),
  white_checkout AS (
    SELECT created_at::date AS day, COUNT(*)::int AS n
    FROM prepaid_report_access
    WHERE created_at >= since_ts AND created_at < until_ts
    GROUP BY created_at::date
  ),
  white_paid AS (
    SELECT updated_at::date AS day, COUNT(*)::int AS n
    FROM prepaid_report_access
    WHERE status = 'succeeded' AND updated_at >= since_ts AND updated_at < until_ts
    GROUP BY updated_at::date
  ),
  completions AS (
    SELECT created_date_time::date AS day, COUNT(*)::int AS n
    FROM survey_submission
    WHERE status = 'completed' AND created_date_time >= since_ts AND created_date_time < until_ts
    GROUP BY created_date_time::date
  ),
  eng1 AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'report_engagement_1min' AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  eng5 AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'report_engagement_5min' AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  eng10 AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'report_engagement_10min' AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  paygate AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'paywall_initiated' AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  purchased AS (
    SELECT created_date_time::date AS day, COUNT(*)::int AS n
    FROM payment
    WHERE status = 'succeeded' AND created_date_time >= since_ts AND created_date_time < until_ts
    GROUP BY created_date_time::date
  )
  SELECT json_build_object(
    'days', COALESCE((
      SELECT json_agg(json_build_object(
        'day', to_char(days.day, 'YYYY-MM-DD'),
        'visitors',         COALESCE(visitors.n, 0),
        'visitors_control', COALESCE(visitors_control.n, 0),
        'visitors_white',   COALESCE(visitors_white.n, 0),
        'starts',           COALESCE(starts.n, 0),
        'white_checkout',   COALESCE(white_checkout.n, 0),
        'white_paid',       COALESCE(white_paid.n, 0),
        'completions',      COALESCE(completions.n, 0),
        'eng_1m',           COALESCE(eng1.n, 0),
        'eng_5m',           COALESCE(eng5.n, 0),
        'eng_10m',          COALESCE(eng10.n, 0),
        'paygate',          COALESCE(paygate.n, 0),
        'purchased',        COALESCE(purchased.n, 0)
      ) ORDER BY days.day)
      FROM days
      LEFT JOIN visitors         ON visitors.day         = days.day
      LEFT JOIN visitors_control ON visitors_control.day = days.day
      LEFT JOIN visitors_white   ON visitors_white.day   = days.day
      LEFT JOIN starts           ON starts.day           = days.day
      LEFT JOIN white_checkout   ON white_checkout.day   = days.day
      LEFT JOIN white_paid       ON white_paid.day       = days.day
      LEFT JOIN completions      ON completions.day      = days.day
      LEFT JOIN eng1             ON eng1.day             = days.day
      LEFT JOIN eng5             ON eng5.day             = days.day
      LEFT JOIN eng10            ON eng10.day            = days.day
      LEFT JOIN paygate          ON paygate.day          = days.day
      LEFT JOIN purchased        ON purchased.day        = days.day
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_funnel_cvr_sparklines(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
