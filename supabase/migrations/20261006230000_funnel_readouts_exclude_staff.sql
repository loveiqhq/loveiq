-- The funnel and A/B readouts behind the daily conversion digest counted our own test runs.
--
-- Pricing 3.0 launched on production at 18:18 UTC on 2026-10-06, and the team's first test
-- purchases (#2416: a B3 run paid with three EUR 0 test payments) went straight into
-- tomorrow's 09:00 digest as a finished survey, a checkout and a paywall hit on the live
-- price test. `payment.is_test` already keeps staff MONEY out; nothing kept staff READERS out
-- of completions, report opens, checkouts, unlocks or paywall hits.
--
-- The rule is get_report_friction's, the one SQL already uses for staff: a submission whose
-- owner's email matches '@loveiq\.org$' (case-insensitive). It mirrors isStaffEmail
-- (shared/env/staff-email.ts), which decides `payment.is_test`.
--
-- Each body is production's live pg_get_functiondef with lines added and none changed: a
-- NOT EXISTS on every count keyed on a submission, and one comment. Signatures, defaults,
-- volatility and SECURITY DEFINER are unchanged, so CREATE OR REPLACE keeps each
-- function's grants and adds no overload. Staging's live definitions run the same code
-- and differ from production's only in comments, which this makes production's on both.
--
-- Left alone on purpose: visits, survey starts and survey behaviour (funnel_event,
-- survey_partial_save, survey_behavior_event) carry no owner, so they cannot tell staff
-- apart. That is all get_landing_start_funnel_daily, get_midway_progress_daily and
-- get_survey_friction read, and the visit and start columns here. get_report_friction
-- already excludes staff; get_email_experiment_results counts email events.

CREATE OR REPLACE FUNCTION public.get_axis_funnel_daily(since_ts timestamp with time zone, until_ts timestamp with time zone)
 RETURNS TABLE(axis text, arm text, day date, completions integer, checkouts integer, paid integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH cohort AS (
    SELECT ss.id,
           (ss.created_date_time AT TIME ZONE 'Europe/Berlin')::date                    AS day,
           tracker_arm(ss.utm_tracker, 'landing_variant') AS landing_arm,
           tracker_arm(ss.utm_tracker, 'survey_variant')  AS survey_arm
      FROM survey_submission ss
     WHERE ss.status = 'completed'
       AND ss.created_date_time >= since_ts
       AND ss.created_date_time <  until_ts
       -- Not our own test runs (owner @loveiq.org), by get_report_friction's rule.
       AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = ss.user_id AND u.email ~* '@loveiq\.org$')
  ),
  quote AS (
    SELECT q.survey_submission_id                     AS id,
           -- Same expression as get_arm_cohorts, so the two cannot disagree.
           MIN(COALESCE(q.experiment_group, q.base_price_bucket)) AS pricing_arm,
           COUNT(DISTINCT COALESCE(q.experiment_group, q.base_price_bucket)) AS arm_variants,
           bool_or(q.checkout_started_at IS NOT NULL) AS reached_checkout,
           bool_or(q.purchased_at IS NOT NULL AND NOT quote_purchase_is_test(q.id)) AS reached_paid
      FROM report_price_quote q
     WHERE q.survey_submission_id IN (SELECT id FROM cohort)
     GROUP BY q.survey_submission_id
  ),
  tagged AS (
    SELECT c.id,
           c.day,
           v.axis,
           v.arm,
           COALESCE(q.reached_checkout, FALSE) AS reached_checkout,
           COALESCE(q.reached_paid, FALSE)     AS is_paid
      FROM cohort c
      LEFT JOIN quote q ON q.id = c.id
      CROSS JOIN LATERAL (
        VALUES
          ('landing', c.landing_arm),
          ('survey',  c.survey_arm),
          -- arm_variants > 1 would mean one submission's plans disagree on the
          -- pricing arm. It should be impossible; discarding it is honest,
          -- whereas MIN() would silently pick a side.
          ('pricing', CASE WHEN q.arm_variants = 1 THEN q.pricing_arm END)
      ) AS v(axis, arm)
     -- A submission with no arm on an axis is not IN that experiment, so it must
     -- not pad that axis's denominator. Pricing has none until the reader first
     -- opens their report and a quote is minted.
     WHERE v.arm IS NOT NULL
  )
  SELECT t.axis,
         t.arm,
         t.day,
         COUNT(*)::int                                    AS completions,
         COUNT(*) FILTER (WHERE t.reached_checkout)::int   AS checkouts,
         COUNT(*) FILTER (WHERE t.is_paid)::int            AS paid
    FROM tagged t
   GROUP BY t.axis, t.arm, t.day
   ORDER BY t.axis, t.arm, t.day;
$function$;

CREATE OR REPLACE FUNCTION public.get_arm_cohorts(since_ts timestamp with time zone, until_ts timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
BEGIN
  WITH subs AS (
    SELECT ss.id,
           tracker_arm(ss.utm_tracker, 'landing_variant') AS landing_arm,
           tracker_arm(ss.utm_tracker, 'survey_variant')  AS survey_arm,
           COALESCE(
             (SELECT COALESCE(q.experiment_group, q.base_price_bucket)
                FROM report_price_quote q
               WHERE q.survey_submission_id = ss.id
                 AND COALESCE(q.experiment_group, q.base_price_bucket) IS NOT NULL
               ORDER BY q.created_date_time ASC
               LIMIT 1),
             'unknown'
           ) AS pricing_arm,
           EXISTS (
             SELECT 1 FROM report_price_quote q2
             WHERE q2.survey_submission_id = ss.id AND q2.purchased_at IS NOT NULL
               AND NOT quote_purchase_is_test(q2.id)
           ) AS ever_paid
      FROM survey_submission ss
     WHERE ss.status = 'completed'
       AND ss.created_date_time >= since_ts
       AND ss.created_date_time < until_ts
       -- Not our own test runs (owner @loveiq.org), by get_report_friction's rule.
       AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = ss.user_id AND u.email ~* '@loveiq\.org$')
  ),
  unpivoted AS (
    SELECT 'landing'::text AS axis, landing_arm AS arm, ever_paid FROM subs
    UNION ALL
    SELECT 'survey', survey_arm, ever_paid FROM subs
    UNION ALL
    SELECT 'pricing', pricing_arm, ever_paid FROM subs
  )
  SELECT COALESCE(json_agg(json_build_object(
           'axis', axis,
           'arm',  arm,
           'n',    n,
           'conversions', conversions
         ) ORDER BY axis, conversions DESC, arm), '[]'::json)
    INTO result
    FROM (
      SELECT axis, arm,
             COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE ever_paid)::int AS conversions
        FROM unpivoted
       GROUP BY axis, arm
    ) g;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_paywall_hits(since_ts timestamp with time zone, until_ts timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'hits', (
      SELECT COUNT(*)::int FROM (
        SELECT DISTINCT s.id
          FROM survey_submission s
         WHERE s.created_date_time >= since_ts
           AND s.created_date_time <  until_ts
           -- Not our own test runs (owner @loveiq.org), by get_report_friction's rule.
           AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = s.user_id AND u.email ~* '@loveiq\.org$')
           AND (
             EXISTS (SELECT 1 FROM report_price_quote q
                      WHERE q.survey_submission_id = s.id
                        AND q.paywall_reached_at IS NOT NULL)
             OR
             EXISTS (SELECT 1 FROM analytics_event a
                      WHERE a.survey_submission_id = s.id
                        AND a.event_type = 'paywall_initiated')
           )
      ) reached
    ),
    'firstRowDay', (
      SELECT to_char(MAX(t) AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD')
        FROM (
          SELECT MIN(paywall_reached_at) AS t FROM report_price_quote
           WHERE paywall_reached_at IS NOT NULL
          UNION ALL
          SELECT MIN(event_time) FROM analytics_event WHERE event_type = 'paywall_initiated'
        ) f
    )
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_landing_arm_funnel_daily(since_ts timestamp with time zone, until_ts timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
  since_day DATE := (since_ts AT TIME ZONE 'Europe/Berlin')::date;
  until_day DATE := (until_ts AT TIME ZONE 'Europe/Berlin')::date;
BEGIN
  WITH
  visitors AS (
    SELECT day,
           COALESCE(landing_variant, 'unknown') AS arm,
           COUNT(DISTINCT visitor_id)::int      AS n
      FROM funnel_event
     WHERE event_type = 'unique_visitor'
       AND day >= since_day AND day < until_day
     GROUP BY 1, 2
  ),
  subs AS (
    SELECT ss.id,
           (ss.created_date_time AT TIME ZONE 'Europe/Berlin')::date              AS day,
           landing_arm_from_tracker(ss.utm_tracker) AS arm
      FROM survey_submission ss
     WHERE ss.status = 'completed'
       AND ss.created_date_time >= since_ts
       AND ss.created_date_time < until_ts
       -- Not our own test runs (owner @loveiq.org), by get_report_friction's rule.
       AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = ss.user_id AND u.email ~* '@loveiq\.org$')
  ),
  opens AS (
    SELECT (rs.started_at AT TIME ZONE 'Europe/Berlin')::date AS day,
           landing_arm_from_tracker(ss.utm_tracker) AS arm,
           COUNT(DISTINCT rs.personal_report_id)::int AS n
      FROM report_session rs
      JOIN personal_report pr  ON pr.id = rs.personal_report_id
      JOIN survey_submission ss ON ss.id = pr.survey_submission_id
     WHERE rs.started_at >= since_ts AND rs.started_at < until_ts
       AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = ss.user_id AND u.email ~* '@loveiq\.org$')
     GROUP BY 1, 2
  ),
  checkout AS (
    SELECT (q.checkout_started_at AT TIME ZONE 'Europe/Berlin')::date AS day,
           landing_arm_from_tracker(ss.utm_tracker) AS arm,
           COUNT(DISTINCT q.survey_submission_id)::int AS n
      FROM report_price_quote q
      JOIN survey_submission ss ON ss.id = q.survey_submission_id
     WHERE q.checkout_started_at >= since_ts AND q.checkout_started_at < until_ts
       AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = ss.user_id AND u.email ~* '@loveiq\.org$')
     GROUP BY 1, 2
  ),
  paid AS (
    SELECT (q.purchased_at AT TIME ZONE 'Europe/Berlin')::date AS day,
           landing_arm_from_tracker(ss.utm_tracker) AS arm,
           COUNT(DISTINCT q.survey_submission_id)::int AS n
      FROM report_price_quote q
      JOIN survey_submission ss ON ss.id = q.survey_submission_id
     WHERE q.purchased_at >= since_ts AND q.purchased_at < until_ts
       AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = ss.user_id AND u.email ~* '@loveiq\.org$')
       AND NOT quote_purchase_is_test(q.id)
     GROUP BY 1, 2
  ),
  money AS (
    SELECT (p.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day,
           landing_arm_from_tracker(ss.utm_tracker) AS arm,
           COUNT(*) FILTER (WHERE p.amount > 0)::int  AS charges,
           COUNT(*) FILTER (WHERE COALESCE(p.amount, 0) = 0)::int AS free_unlocks,
           COALESCE(SUM(p.amount) FILTER (WHERE p.amount > 0), 0)::numeric AS revenue
      FROM payment p
      JOIN personal_report pr   ON pr.id = p.personal_report_id
      JOIN survey_submission ss ON ss.id = pr.survey_submission_id
     WHERE p.status = 'succeeded'
       AND NOT p.is_test
       AND p.created_date_time >= since_ts
       AND p.created_date_time < until_ts
       AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = ss.user_id AND u.email ~* '@loveiq\.org$')
     GROUP BY 1, 2
  ),
  completions AS (
    SELECT day, arm, COUNT(*)::int AS n FROM subs GROUP BY 1, 2
  ),
  day_arm AS (
    SELECT day, arm FROM completions
    UNION SELECT day, arm FROM opens
    UNION SELECT day, arm FROM checkout
    UNION SELECT day, arm FROM paid
    UNION SELECT day, arm FROM money
  ),
  cohort AS (
    SELECT s.arm,
           COUNT(*)::int AS completions,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM personal_report pr2
              JOIN report_session rs2 ON rs2.personal_report_id = pr2.id
             WHERE pr2.survey_submission_id = s.id
           ))::int AS report_opens,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM report_price_quote q2
             WHERE q2.survey_submission_id = s.id AND q2.checkout_started_at IS NOT NULL
           ))::int AS checkout,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM report_price_quote q2
             WHERE q2.survey_submission_id = s.id AND q2.purchased_at IS NOT NULL
               AND NOT quote_purchase_is_test(q2.id)
           ))::int AS paid,
           COALESCE(SUM((
             SELECT COALESCE(SUM(p2.amount) FILTER (WHERE p2.amount > 0), 0)
               FROM personal_report pr3
               JOIN payment p2 ON p2.personal_report_id = pr3.id
              WHERE pr3.survey_submission_id = s.id AND p2.status = 'succeeded' AND NOT p2.is_test
           )), 0)::numeric AS revenue
      FROM subs s
     GROUP BY s.arm
  )
  SELECT json_build_object(
    'visitors', COALESCE((
      SELECT json_agg(json_build_object(
               'day', to_char(v.day, 'YYYY-MM-DD'), 'arm', v.arm, 'n', v.n
             ) ORDER BY v.day, v.arm)
        FROM visitors v
    ), '[]'::json),
    'daily', COALESCE((
      SELECT json_agg(json_build_object(
               'day',          to_char(da.day, 'YYYY-MM-DD'),
               'arm',          da.arm,
               'completions',  COALESCE(c.n, 0),
               'report_opens', COALESCE(o.n, 0),
               'checkout',     COALESCE(ck.n, 0),
               'paid',         COALESCE(pd.n, 0),
               'charges',      COALESCE(m.charges, 0),
               'free_unlocks', COALESCE(m.free_unlocks, 0),
               'revenue',      COALESCE(m.revenue, 0)
             ) ORDER BY da.day, da.arm)
        FROM day_arm da
        LEFT JOIN completions c ON c.day = da.day AND c.arm = da.arm
        LEFT JOIN opens o       ON o.day  = da.day AND o.arm  = da.arm
        LEFT JOIN checkout ck   ON ck.day = da.day AND ck.arm = da.arm
        LEFT JOIN paid pd       ON pd.day = da.day AND pd.arm = da.arm
        LEFT JOIN money m       ON m.day  = da.day AND m.arm  = da.arm
    ), '[]'::json),
    'cohort', COALESCE((
      SELECT json_agg(json_build_object(
               'arm',          ch.arm,
               'completions',  ch.completions,
               'report_opens', ch.report_opens,
               'checkout',     ch.checkout,
               'paid',         ch.paid,
               'revenue',      ch.revenue
             ) ORDER BY ch.completions DESC, ch.arm)
        FROM cohort ch
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$function$;

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
