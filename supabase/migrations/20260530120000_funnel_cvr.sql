-- Phase 3 — Strategy-Lead Refocus: CVR-over-time + price-bucket + drop-out
-- funnel + reactivation-email performance (2026-05-30).
--
-- Four read-only RPCs powering the slimmed chart-dominant funnel digest. Each
-- returns numerator + denominator per UTC day where applicable so the Node
-- side owns the rate math via one tested computeRate() helper (RPCs stay dumb).
--
-- Conventions (match prior digest RPCs):
--   * SECURITY DEFINER + GRANT EXECUTE TO service_role
--   * Half-open [since_ts, until_ts) windows
--   * COALESCE-shaped JSON, never NULL
--   * generate_series day spine so zero-traffic days still emit a row
--
-- Payment -> bucket join chain (no direct FK):
--   payment.pricing_quote_id -> report_price_quote.id -> .base_price_bucket

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. get_funnel_cvr_sparklines — numerator+denominator per day for charts 1-5
-- ═══════════════════════════════════════════════════════════════════════════

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
  starts AS (
    SELECT started_at::date AS day, COUNT(DISTINCT session_id)::int AS n
    FROM survey_partial_save
    WHERE started_at >= since_ts AND started_at < until_ts
    GROUP BY started_at::date
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
        'visitors',    COALESCE(visitors.n, 0),
        'starts',      COALESCE(starts.n, 0),
        'completions', COALESCE(completions.n, 0),
        'eng_1m',      COALESCE(eng1.n, 0),
        'eng_5m',      COALESCE(eng5.n, 0),
        'eng_10m',     COALESCE(eng10.n, 0),
        'paygate',     COALESCE(paygate.n, 0),
        'purchased',   COALESCE(purchased.n, 0)
      ) ORDER BY days.day)
      FROM days
      LEFT JOIN visitors    ON visitors.day    = days.day
      LEFT JOIN starts      ON starts.day      = days.day
      LEFT JOIN completions ON completions.day = days.day
      LEFT JOIN eng1        ON eng1.day        = days.day
      LEFT JOIN eng5        ON eng5.day        = days.day
      LEFT JOIN eng10       ON eng10.day       = days.day
      LEFT JOIN paygate     ON paygate.day     = days.day
      LEFT JOIN purchased   ON purchased.day   = days.day
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_funnel_cvr_sparklines(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. get_bucket_performance — per day per price-bucket: shown / purchases / rev
-- ═══════════════════════════════════════════════════════════════════════════
-- denom (shown): DISTINCT survey_submission_id that saw a price_shown for the
--   bucket on that day (a submission can see several buckets across the ladder;
--   distinct-per-bucket avoids double counting within a bucket).
-- num (purchases) + revenue: payment JOIN report_price_quote on the bucket.

CREATE OR REPLACE FUNCTION get_bucket_performance(
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
  shown AS (
    SELECT event_time::date AS day,
           LOWER(TRIM(metadata->>'bucket')) AS bucket,
           COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'price_shown'
      AND event_time >= since_ts AND event_time < until_ts
      AND metadata ? 'bucket'
      AND NULLIF(TRIM(metadata->>'bucket'), '') IS NOT NULL
    GROUP BY event_time::date, LOWER(TRIM(metadata->>'bucket'))
  ),
  purch AS (
    SELECT p.created_date_time::date AS day,
           LOWER(TRIM(rpq.base_price_bucket)) AS bucket,
           COUNT(*)::int AS purchases,
           COALESCE(SUM(p.amount), 0)::numeric(12,2) AS revenue
    FROM payment p
    JOIN report_price_quote rpq ON rpq.id = p.pricing_quote_id
    WHERE p.status = 'succeeded'
      AND p.created_date_time >= since_ts AND p.created_date_time < until_ts
      AND NULLIF(TRIM(rpq.base_price_bucket), '') IS NOT NULL
    GROUP BY p.created_date_time::date, LOWER(TRIM(rpq.base_price_bucket))
  ),
  per_bucket_day AS (
    SELECT day, bucket,
           SUM(shown_n) AS shown,
           SUM(purch_n) AS purchases,
           SUM(rev)     AS revenue
    FROM (
      SELECT day, bucket, n AS shown_n, 0 AS purch_n, 0::numeric AS rev FROM shown
      UNION ALL
      SELECT day, bucket, 0, purchases, revenue FROM purch
    ) u
    GROUP BY day, bucket
  )
  SELECT json_build_object(
    'days', COALESCE((
      SELECT json_agg(json_build_object(
        'day', to_char(days.day, 'YYYY-MM-DD'),
        'buckets', COALESCE((
          SELECT json_object_agg(
            bucket,
            json_build_object('shown', shown, 'purchases', purchases, 'revenue', revenue)
          )
          FROM per_bucket_day pbd WHERE pbd.day = days.day
        ), '{}'::json)
      ) ORDER BY days.day)
      FROM days
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_bucket_performance(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. get_dropout_funnel — per question_index, DISTINCT sessions that reached it
-- ═══════════════════════════════════════════════════════════════════════════
-- Window-snapshot retention curve. Node computes retention% vs the first
-- question and flags the steepest single-question drops.

CREATE OR REPLACE FUNCTION get_dropout_funnel(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  WITH per_q AS (
    SELECT question_index,
           MIN(q_id) AS q_id,
           COUNT(DISTINCT session_id)::int AS sessions
    FROM survey_behavior_event
    WHERE event_time >= since_ts AND event_time < until_ts
      AND question_index IS NOT NULL
    GROUP BY question_index
  )
  SELECT json_build_object(
    'questions', COALESCE((
      SELECT json_agg(json_build_object(
        'question_index', question_index,
        'q_id', q_id,
        'sessions', sessions
      ) ORDER BY question_index)
      FROM per_q
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dropout_funnel(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. get_nurture_performance — per reactivation-email stage: sent / purchased
-- ═══════════════════════════════════════════════════════════════════════════
-- Window totals (not per-day): the send timestamp is approximated by the
-- quote's updated_date_time (when nurtureEmailsSent was last appended), so
-- per-day bucketing would be unreliable. sent = quotes touched in-window whose
-- nurtureEmailsSent array contains the stage. purchased = payments in-window
-- whose metadata.promoStage equals the stage. CVR computed Node-side.
--
-- NOTE: payment.metadata.promoStage is currently unpopulated (0 rows) — the
-- purchased column reads 0 until the checkout stamping path is confirmed. The
-- chart degrades gracefully (sent shown, 0% CVR).

CREATE OR REPLACE FUNCTION get_nurture_performance(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
  stages TEXT[] := ARRAY['6h_no_view', '6h_no_unlock', '30h_no_unlock', '54h_no_unlock'];
BEGIN
  SELECT json_build_object(
    'stages', COALESCE((
      SELECT json_agg(json_build_object(
        'stage', s.stage,
        'sent', (
          SELECT COUNT(*)::int FROM report_price_quote rpq
          WHERE rpq.metadata -> 'nurtureEmailsSent' ? s.stage
            AND rpq.updated_date_time >= since_ts AND rpq.updated_date_time < until_ts
        ),
        'purchased', (
          SELECT COUNT(*)::int FROM payment p
          WHERE p.status = 'succeeded'
            AND p.metadata->>'promoStage' = s.stage
            AND p.created_date_time >= since_ts AND p.created_date_time < until_ts
        )
      ) ORDER BY s.ord)
      FROM unnest(stages) WITH ORDINALITY AS s(stage, ord)
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_nurture_performance(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
