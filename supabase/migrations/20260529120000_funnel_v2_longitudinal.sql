-- Longitudinal funnel coverage — strategy-lead-driven addition (2026-05-29).
--
-- Goal: extend the daily + weekly Slack digest with per-stage time-series
-- charts covering EVERY drop-off edge from /survey intro → paid report.
-- Today only six top-line metrics (visitors, starts, completions, report_views,
-- paywall_init, purchases) have longitudinal coverage via
-- get_funnel_sparklines. This migration adds:
--
--   1. Pre-survey intro tracking — the 4 intro slides in SurveyPage.tsx fire
--      BEFORE survey_submission exists, so they piggy-back on funnel_event
--      (same pattern as `unique_visitor` and `survey_engine_mount`). Four new
--      event_types extend the existing CHECK constraint.
--
--   2. get_funnel_sparklines_v2 — one row per UTC day with four phase buckets
--      (intro / survey-by-chapter / wizard-by-slide / monetize-ladder). Powers
--      four new chart images in the Slack digest. Zero-traffic days still emit
--      rows so renderers can draw fixed-width line charts.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Widen funnel_event CHECK
-- ═══════════════════════════════════════════════════════════════════════════
-- The CHECK on event_type was added inline in the original CREATE TABLE
-- (20260523231351_create_funnel_event.sql). Inline table-level CHECKs are
-- autonamed by Postgres as `<table>_check`, `<table>_check1`, etc. — NOT
-- `<table>_<column>_check`. To survive both naming conventions across staging
-- and prod, we look up the actual constraint name via pg_constraint and drop
-- it dynamically. Idempotent: if the constraint was already dropped (e.g. a
-- prior run), the loop just exits.

DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.funnel_event'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE public.funnel_event DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE public.funnel_event
  ADD CONSTRAINT funnel_event_event_type_check CHECK (
    event_type IN (
      'unique_visitor',
      'survey_engine_mount',
      'intro_slide_1',
      'intro_slide_2',
      'intro_slide_3',
      'intro_slide_4'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. get_funnel_sparklines_v2
-- ═══════════════════════════════════════════════════════════════════════════
-- One pass per phase via individual CTEs joined onto a `days` generate_series
-- spine. Half-open [since_ts, until_ts) window matches every other digest RPC.
-- Survey chapters derive from q_id's first 2 chars (per the 5-digit "CCQQQ"
-- format documented in CLAUDE.md / memory). Days with no traffic still emit
-- zero-filled rows so a line-chart renderer always sees N points.

CREATE OR REPLACE FUNCTION get_funnel_sparklines_v2(
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
  intro AS (
    SELECT day, event_type, COUNT(DISTINCT visitor_id)::int AS n
    FROM funnel_event
    WHERE event_type IN ('intro_slide_1', 'intro_slide_2', 'intro_slide_3', 'intro_slide_4')
      AND day >= since_day AND day < until_day
    GROUP BY day, event_type
  ),
  intro_pivot AS (
    SELECT day,
           COALESCE(SUM(n) FILTER (WHERE event_type = 'intro_slide_1'), 0)::int AS s1,
           COALESCE(SUM(n) FILTER (WHERE event_type = 'intro_slide_2'), 0)::int AS s2,
           COALESCE(SUM(n) FILTER (WHERE event_type = 'intro_slide_3'), 0)::int AS s3,
           COALESCE(SUM(n) FILTER (WHERE event_type = 'intro_slide_4'), 0)::int AS s4
    FROM intro
    GROUP BY day
  ),
  survey_chapter AS (
    -- Strict regex on q_id keeps a malformed event from crashing LEFT(...).
    -- DISTINCT session_id = one row per unique survey attempt that touched
    -- this chapter on this UTC day.
    SELECT event_time::date AS day,
           LEFT(q_id, 2) AS chapter,
           COUNT(DISTINCT session_id)::int AS n
    FROM survey_behavior_event
    WHERE event_time >= since_ts AND event_time < until_ts
      AND answered = true
      AND q_id ~ '^[0-9]{5}$'
    GROUP BY event_time::date, LEFT(q_id, 2)
  ),
  survey_pivot AS (
    SELECT day,
           json_object_agg(chapter, n) AS chapters
    FROM survey_chapter
    GROUP BY day
  ),
  wizard AS (
    -- Wizard PreReportWizard has 6 slides (memory + CLAUDE.md). Cast guarded
    -- by a tight 1–2 digit regex so a malicious POST with `{ to_slide: "9999...9" }`
    -- can't trigger an int4 overflow on the cast — real slide indices are 1-6.
    SELECT event_time::date AS day,
           (metadata->>'to_slide')::int AS to_slide,
           COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'wizard_slide_advanced'
      AND event_time >= since_ts AND event_time < until_ts
      AND survey_submission_id IS NOT NULL
      AND metadata ? 'to_slide'
      AND metadata->>'to_slide' ~ '^[0-9]{1,2}$'
    GROUP BY event_time::date, (metadata->>'to_slide')::int
  ),
  wizard_pivot AS (
    SELECT day,
           COALESCE(SUM(n) FILTER (WHERE to_slide = 1), 0)::int AS s1,
           COALESCE(SUM(n) FILTER (WHERE to_slide = 2), 0)::int AS s2,
           COALESCE(SUM(n) FILTER (WHERE to_slide = 3), 0)::int AS s3,
           COALESCE(SUM(n) FILTER (WHERE to_slide = 4), 0)::int AS s4,
           COALESCE(SUM(n) FILTER (WHERE to_slide = 5), 0)::int AS s5,
           COALESCE(SUM(n) FILTER (WHERE to_slide = 6), 0)::int AS s6
    FROM wizard
    GROUP BY day
  ),
  rv AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'report_viewed'
      AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  e5 AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'report_engagement_5min'
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
  bc AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'begin_checkout'
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
        'day', to_char(days.day, 'YYYY-MM-DD'),
        'intro', json_build_object(
          's1', COALESCE(intro_pivot.s1, 0),
          's2', COALESCE(intro_pivot.s2, 0),
          's3', COALESCE(intro_pivot.s3, 0),
          's4', COALESCE(intro_pivot.s4, 0)
        ),
        'survey', COALESCE(survey_pivot.chapters, '{}'::json),
        'wizard', json_build_object(
          's1', COALESCE(wizard_pivot.s1, 0),
          's2', COALESCE(wizard_pivot.s2, 0),
          's3', COALESCE(wizard_pivot.s3, 0),
          's4', COALESCE(wizard_pivot.s4, 0),
          's5', COALESCE(wizard_pivot.s5, 0),
          's6', COALESCE(wizard_pivot.s6, 0),
          'report_viewed', COALESCE(rv.n, 0)
        ),
        'monetize', json_build_object(
          'report_viewed', COALESCE(rv.n, 0),
          'engagement_5min', COALESCE(e5.n, 0),
          'paywall_init', COALESCE(pw.n, 0),
          'begin_checkout', COALESCE(bc.n, 0),
          'purchased', COALESCE(purchases.n, 0)
        )
      ) ORDER BY days.day)
      FROM days
      LEFT JOIN intro_pivot  ON intro_pivot.day  = days.day
      LEFT JOIN survey_pivot ON survey_pivot.day = days.day
      LEFT JOIN wizard_pivot ON wizard_pivot.day = days.day
      LEFT JOIN rv           ON rv.day           = days.day
      LEFT JOIN e5           ON e5.day           = days.day
      LEFT JOIN pw           ON pw.day           = days.day
      LEFT JOIN bc           ON bc.day           = days.day
      LEFT JOIN purchases    ON purchases.day    = days.day
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_funnel_sparklines_v2(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
