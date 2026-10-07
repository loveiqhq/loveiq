-- Rollback for 20261007190000_survey_starts_count_finished_surveys.
--
-- Restores both functions exactly as they were on production before it (live
-- pg_get_functiondef, 2026-10-07): starts and midway read from drafts alone again,
-- and get_midway_progress_daily stops returning `finished`. The digest code reads
-- `finished` only when present, so it needs no revert.

CREATE OR REPLACE FUNCTION public.get_funnel_cvr_sparklines(since_ts timestamp with time zone, until_ts timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
  -- Berlin, not the session TimeZone. A bare ::date on a timestamptz
  -- resolves against TimeZone (UTC on the pooler) and every caller passes
  -- Berlin midnight, which is 22:00Z the day before in summer — so these
  -- bounds landed a full day early while still spanning the right width.
  since_day DATE := (since_ts AT TIME ZONE 'Europe/Berlin')::date;
  until_day DATE := (until_ts AT TIME ZONE 'Europe/Berlin')::date;
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
    -- Berlin, like the bounds above. And current_index >= 1, because a
    -- draft with no answer in it is not a survey anyone started.
    SELECT (started_at AT TIME ZONE 'Europe/Berlin')::date AS day,
           COUNT(DISTINCT session_id)::int AS n
    FROM survey_partial_save
    WHERE started_at >= since_ts AND started_at < until_ts
      AND current_index >= 1
    GROUP BY 1
  ),
  white_checkout AS (
    SELECT (created_at AT TIME ZONE 'Europe/Berlin')::date AS day, COUNT(*)::int AS n
    FROM prepaid_report_access
    WHERE created_at >= since_ts AND created_at < until_ts
    GROUP BY (created_at AT TIME ZONE 'Europe/Berlin')::date
  ),
  white_paid AS (
    SELECT (updated_at AT TIME ZONE 'Europe/Berlin')::date AS day, COUNT(*)::int AS n
    FROM prepaid_report_access
    WHERE status = 'succeeded' AND updated_at >= since_ts AND updated_at < until_ts
    GROUP BY (updated_at AT TIME ZONE 'Europe/Berlin')::date
  ),
  completions AS (
    SELECT (created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day, COUNT(*)::int AS n
    FROM survey_submission
    WHERE status = 'completed' AND created_date_time >= since_ts AND created_date_time < until_ts
      -- Not our own test runs (owner @loveiq.org), by get_report_friction's rule.
      AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = survey_submission.user_id AND u.email ~* '@loveiq\.org$')
    GROUP BY (created_date_time AT TIME ZONE 'Europe/Berlin')::date
  ),
  eng1 AS (
    SELECT (event_time AT TIME ZONE 'Europe/Berlin')::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'report_engagement_1min' AND event_time >= since_ts AND event_time < until_ts
      AND NOT EXISTS (SELECT 1 FROM survey_submission s JOIN app_user u ON u.id = s.user_id WHERE s.id = analytics_event.survey_submission_id AND u.email ~* '@loveiq\.org$')
    GROUP BY (event_time AT TIME ZONE 'Europe/Berlin')::date
  ),
  eng5 AS (
    SELECT (event_time AT TIME ZONE 'Europe/Berlin')::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'report_engagement_5min' AND event_time >= since_ts AND event_time < until_ts
      AND NOT EXISTS (SELECT 1 FROM survey_submission s JOIN app_user u ON u.id = s.user_id WHERE s.id = analytics_event.survey_submission_id AND u.email ~* '@loveiq\.org$')
    GROUP BY (event_time AT TIME ZONE 'Europe/Berlin')::date
  ),
  eng10 AS (
    SELECT (event_time AT TIME ZONE 'Europe/Berlin')::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'report_engagement_10min' AND event_time >= since_ts AND event_time < until_ts
      AND NOT EXISTS (SELECT 1 FROM survey_submission s JOIN app_user u ON u.id = s.user_id WHERE s.id = analytics_event.survey_submission_id AND u.email ~* '@loveiq\.org$')
    GROUP BY (event_time AT TIME ZONE 'Europe/Berlin')::date
  ),
  paygate AS (
    SELECT day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM (
      SELECT (event_time AT TIME ZONE 'Europe/Berlin')::date AS day, survey_submission_id FROM analytics_event
       WHERE event_type = 'paywall_initiated' AND event_time >= since_ts AND event_time < until_ts
         AND survey_submission_id IS NOT NULL
      UNION
      SELECT (paywall_reached_at AT TIME ZONE 'Europe/Berlin')::date AS day, survey_submission_id FROM report_price_quote
       WHERE paywall_reached_at >= since_ts AND paywall_reached_at < until_ts
         AND survey_submission_id IS NOT NULL
    ) paywall_hits
    WHERE NOT EXISTS (SELECT 1 FROM survey_submission s JOIN app_user u ON u.id = s.user_id WHERE s.id = paywall_hits.survey_submission_id AND u.email ~* '@loveiq\.org$')
    GROUP BY day
  ),
  purchased AS (
    -- Succeeded, NON-TEST, and money actually moved — and counted per
    -- PERSON, because the denominators beside it are distinct submissions.
    -- Without these the 2026-09-07 device-matrix run (34 test unlocks in a
    -- day) drew a 100% conversion rate.
    SELECT (p.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day,
           COUNT(DISTINCT pr.survey_submission_id)::int AS n
    FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
    WHERE p.status = 'succeeded' AND NOT p.is_test AND p.amount > 0
      AND p.created_date_time >= since_ts AND p.created_date_time < until_ts
      AND NOT EXISTS (SELECT 1 FROM survey_submission s JOIN app_user u ON u.id = s.user_id WHERE s.id = pr.survey_submission_id AND u.email ~* '@loveiq\.org$')
    -- GROUP BY 1, not the column name: `created_date_time` exists on BOTH
    -- payment and personal_report now that they are joined, so naming it is
    -- ambiguous and the function errors at call time.
    GROUP BY 1
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
$function$;

CREATE OR REPLACE FUNCTION public.get_midway_progress_daily(since_ts timestamp with time zone, until_ts timestamp with time zone, midway_index integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
  -- The day the partial-save arm stamp shipped. Per-arm rows before it carry no
  -- landing_variant at all, so they are excluded rather than bucketed 'unknown'.
  first_arm_day CONSTANT DATE := DATE '2026-09-19';
  -- ::date on a timestamptz uses the SESSION TimeZone, so every boundary is
  -- pinned explicitly. EUROPE/BERLIN, not UTC: the caller's window is Berlin
  -- midnight, and bucketed in UTC the most recent TWENTY-TWO HOURS are silently
  -- discarded — the "Reached question N" row would cover 29d2h while Visits,
  -- Started and Finished beside it cover 30 days.
  since_day DATE := (since_ts AT TIME ZONE 'Europe/Berlin')::date;
  until_day DATE := (until_ts AT TIME ZONE 'Europe/Berlin')::date;
  arm_since_day DATE := GREATEST((since_ts AT TIME ZONE 'Europe/Berlin')::date, first_arm_day);
BEGIN
  -- A threshold outside the survey is a caller bug, not a measurement.
  IF midway_index IS NULL OR midway_index < 1 OR midway_index > 500 THEN
    RAISE EXCEPTION 'midway_index must be between 1 and 500, got %', midway_index;
  END IF;

  WITH in_window AS (
    SELECT
      (saved_at AT TIME ZONE 'Europe/Berlin')::date AS day,
      session_id,
      current_index,
      -- Reuses the repo's IMMUTABLE safe-parse rather than casting inline: a bare
      -- `utm_tracker::jsonb` throws on the first malformed blob and takes the whole
      -- report down with it, and the column is free text written from a browser.
      -- An arm-less row post-stamp is a real observation (no cookie: a crawler, a
      -- direct hit, a consent refusal) and is reported as 'unknown' rather than
      -- dropped, so the arms never silently fail to sum to the total.
      COALESCE(
        admin_extract_utm_value(utm_tracker, 'landing_variant', false),
        'unknown'
      ) AS arm
    FROM survey_partial_save
    WHERE saved_at >= since_ts AND saved_at < until_ts
  ),
  per_arm_named AS (
    SELECT day,
           arm,
           COUNT(DISTINCT session_id)::int AS sessions,
           COUNT(DISTINCT session_id) FILTER (WHERE current_index >= midway_index)::int
             AS reached
      FROM in_window
     WHERE day >= arm_since_day AND day < until_day
     GROUP BY day, arm
  )
  SELECT json_build_object(
    -- Whole population, full window, no arm and no floor. This is the funnel
    -- TABLE row, and it is correct from the day this ships.
    'overall', (
      SELECT json_build_object(
               'sessions', COALESCE(COUNT(DISTINCT session_id), 0)::int,
               'reached',  COALESCE(
                             COUNT(DISTINCT session_id)
                               FILTER (WHERE current_index >= midway_index), 0)::int
             )
        FROM in_window
       WHERE day >= since_day AND day < until_day
    ),
    'daily', COALESCE((
      SELECT json_agg(json_build_object(
               'day',      to_char(p.day, 'YYYY-MM-DD'),
               'arm',      p.arm,
               'sessions', p.sessions,
               'reached',  p.reached
             ) ORDER BY p.day, p.arm)
        FROM per_arm_named p
    ), '[]'::json),
    'totals', COALESCE((
      SELECT json_agg(json_build_object(
               'arm',      t.arm,
               'sessions', t.sessions,
               'reached',  t.reached
             ) ORDER BY t.sessions DESC, t.arm)
        FROM (
          SELECT arm, SUM(sessions)::int AS sessions, SUM(reached)::int AS reached
            FROM per_arm_named
           GROUP BY arm
        ) t
    ), '[]'::json),
    -- Echoed back so a caller can never render a chart whose threshold differs
    -- from the one it asked for, and so the number is visible in the caption.
    'midwayIndex', midway_index,
    -- Callers render days before this as ABSENT, never as zero.
    'firstArmDay', to_char(first_arm_day, 'YYYY-MM-DD')
  ) INTO result;

  RETURN result;
END;
$function$;
