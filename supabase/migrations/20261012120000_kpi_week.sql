-- get_kpi_week: one window's numbers for the live 📊 KPI database in Notion (Eman,
-- 2026-10-12: "make sure it is always updated"). The kpi-weekly cron calls it once per
-- Monday-to-Sunday week (Berlin days) and writes every High and Medium KPI from it.
--
-- Same definitions as the morning message, copied rather than re-invented, so a KPI
-- never disagrees with the digest:
--   visits      get_funnel_cvr_sparklines.visitors: distinct visitor per Berlin day in
--               funnel_event, added up (the visitor id is new every day, so visit-days).
--   starts      get_funnel_cvr_sparklines.starts: drafts past question 1 by started_at,
--               and finished surveys by start_date_time, staff out of the latter.
--               Drafts of people who never finish are cleared after about 30 days, so
--               a week older than that is undercounted; the cron keeps such weeks blank.
--   finished    survey_submission completed in the window, staff out.
--   checkout    readers whose checkout began in the window (report_price_quote).
--   paywall     get_funnel_cvr_sparklines.paygate: readers who reached the paywall.
--   sales       the payment ledger (decided 19 Sep): succeeded, not a test, money taken;
--   gifted      the same at EUR 0 (coupons), counted apart. revenue = money taken, gross.
-- Staff = an owner email ending @loveiq.org, as everywhere.
--
-- Added, because nothing computed them:
--   google_ads        a Google Ads click id (gclid, gbraid or wbraid) in the survey's
--                     tracker, the rule of get_survey_dropoff_runs and classifyTraffic.
--   by_arm            the landing page arm (funnel_event.landing_variant; the tracker's
--                     landing_variant on drafts and submissions).
--   finish_cohort     of the window's finishers, how many have paid with money since
--                     (grows as late buyers pay).
--   start_cohort      of the people whose first survey step fell in the window and who
--                     answered a question, how many finished; from survey events, which
--                     are never cleared (complete from 2026-09-21). By source and device
--                     (device from 2026-10-12, migration 20261012093000).
--   survey_minutes    median and 90th percentile of the window's finishers'
--                     survey_submission.duration_ms, in minutes.
--   report_minutes    the same for closed report sessions begun in the window, staff
--                     out, under four hours (reader-sessions.ts, the core KPIs' cap).
--   thumbs            chapter ratings (report_section_feedback) in the window, staff out.
--
-- One JSON value, service role only: session ids and trackers are read here.

CREATE OR REPLACE FUNCTION public.get_kpi_week(
  since_ts timestamp with time zone,
  until_ts timestamp with time zone
)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
  b AS (
    SELECT (since_ts AT TIME ZONE 'Europe/Berlin')::date AS since_day,
           (until_ts AT TIME ZONE 'Europe/Berlin')::date AS until_day
  ),
  staff AS (SELECT u.id FROM app_user u WHERE u.email ~* '@loveiq\.org$'),
  visits AS (
    SELECT DISTINCT f.day, f.visitor_id, COALESCE(f.landing_variant, 'unknown') AS arm
      FROM funnel_event f, b
     WHERE f.event_type = 'unique_visitor' AND f.day >= b.since_day AND f.day < b.until_day
  ),
  starts AS (
    SELECT DISTINCT ON (x.session_id) x.session_id, x.tracker,
           (tracker_arm(x.tracker, 'gclid') <> 'unknown' OR tracker_arm(x.tracker, 'gbraid') <> 'unknown' OR tracker_arm(x.tracker, 'wbraid') <> 'unknown') AS google_ads
      FROM (
        SELECT d.session_id, d.utm_tracker AS tracker, 1 AS pri
          FROM survey_partial_save d
         WHERE d.started_at >= since_ts AND d.started_at < until_ts AND d.current_index >= 1
        UNION ALL
        SELECT s.session_id, s.utm_tracker, 0
          FROM survey_submission s
         WHERE s.status = 'completed' AND s.session_id IS NOT NULL
           AND s.start_date_time >= since_ts AND s.start_date_time < until_ts
           AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
      ) x
     ORDER BY x.session_id, x.pri
  ),
  subs AS (
    SELECT s.id, s.utm_tracker AS tracker, s.duration_ms,
           (tracker_arm(s.utm_tracker, 'gclid') <> 'unknown' OR tracker_arm(s.utm_tracker, 'gbraid') <> 'unknown' OR tracker_arm(s.utm_tracker, 'wbraid') <> 'unknown') AS google_ads
      FROM survey_submission s
     WHERE s.status = 'completed'
       AND s.created_date_time >= since_ts AND s.created_date_time < until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  checkout AS (
    SELECT DISTINCT q.survey_submission_id AS id
      FROM report_price_quote q
      JOIN survey_submission s ON s.id = q.survey_submission_id
     WHERE q.checkout_started_at >= since_ts AND q.checkout_started_at < until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  paywall AS (
    SELECT DISTINCT h.id
      FROM (
        SELECT a.survey_submission_id AS id FROM analytics_event a
         WHERE a.event_type = 'paywall_initiated' AND a.event_time >= since_ts AND a.event_time < until_ts
           AND a.survey_submission_id IS NOT NULL
        UNION
        SELECT q.survey_submission_id FROM report_price_quote q
         WHERE q.paywall_reached_at >= since_ts AND q.paywall_reached_at < until_ts
           AND q.survey_submission_id IS NOT NULL
      ) h
     WHERE NOT EXISTS (SELECT 1 FROM survey_submission s JOIN staff ON staff.id = s.user_id WHERE s.id = h.id)
  ),
  money AS (
    SELECT p.amount, (tracker_arm(s.utm_tracker, 'gclid') <> 'unknown' OR tracker_arm(s.utm_tracker, 'gbraid') <> 'unknown' OR tracker_arm(s.utm_tracker, 'wbraid') <> 'unknown') AS google_ads
      FROM payment p
      JOIN personal_report pr   ON pr.id = p.personal_report_id
      JOIN survey_submission s  ON s.id = pr.survey_submission_id
     WHERE p.status = 'succeeded' AND NOT p.is_test
       AND p.created_date_time >= since_ts AND p.created_date_time < until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  -- A session whose first step fell in the window has a step in the window: only those
  -- sessions are grouped, so a call does not scan the whole, never-cleared table.
  first_step AS (
    SELECT e.session_id
      FROM survey_behavior_event e
     WHERE e.session_id IN (
             SELECT w.session_id FROM survey_behavior_event w
              WHERE w.created_at >= since_ts AND w.created_at < until_ts
                AND w.session_id IS NOT NULL)
     GROUP BY e.session_id
    HAVING min(e.created_at) >= since_ts AND min(e.created_at) < until_ts
  ),
  start_cohort AS (
    SELECT f.session_id,
           bool_or(e.direction = 'complete') AS finished,
           (array_agg(e.device_type ORDER BY e.created_at DESC, e.id DESC)
              FILTER (WHERE e.device_type IS NOT NULL))[1] AS device,
           (bool_or(e.answered) OR bool_or(e.direction = 'complete')) AS answered
      FROM first_step f
      JOIN survey_behavior_event e ON e.session_id = f.session_id
     GROUP BY f.session_id
  ),
  start_src AS (
    SELECT c.session_id, c.finished, c.device,
           bool_or(tracker_arm(t.tracker, 'gclid') <> 'unknown'
                OR tracker_arm(t.tracker, 'gbraid') <> 'unknown'
                OR tracker_arm(t.tracker, 'wbraid') <> 'unknown') AS ads,
           bool_or(t.tracker IS NOT NULL OR t.has_row) AS known
      FROM start_cohort c
      LEFT JOIN LATERAL (
        SELECT s.utm_tracker AS tracker, true AS has_row FROM survey_submission s WHERE s.session_id = c.session_id
        UNION ALL
        SELECT d.utm_tracker, true FROM survey_partial_save d WHERE d.session_id = c.session_id
      ) t ON true
     WHERE c.answered
     GROUP BY c.session_id, c.finished, c.device
  ),
  sessions AS (
    SELECT (rs.ended_at - rs.started_at) AS took
      FROM report_session rs
     WHERE rs.started_at >= since_ts AND rs.started_at < until_ts
       AND rs.ended_at IS NOT NULL
       AND rs.ended_at > rs.started_at
       AND rs.ended_at - rs.started_at < interval '4 hours'
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = rs.user_id)
  ),
  thumbs AS (
    SELECT r.feedback
      FROM report_section_feedback r
     WHERE r.created_at >= since_ts AND r.created_at < until_ts
       AND NOT EXISTS (SELECT 1 FROM survey_submission s JOIN staff ON staff.id = s.user_id WHERE s.id = r.survey_submission_id)
  )
  SELECT json_build_object(
    'visits', json_build_object(
      'all', (SELECT count(*) FROM (SELECT DISTINCT day, visitor_id FROM visits) v),
      'by_arm', (SELECT coalesce(json_object_agg(arm, n), '{}'::json)
                   FROM (SELECT arm, count(*) AS n FROM visits GROUP BY arm) a)
    ),
    'starts', json_build_object(
      'all', (SELECT count(*) FROM starts),
      'google_ads', (SELECT count(*) FROM starts WHERE google_ads),
      'by_arm', (SELECT coalesce(json_object_agg(arm, n), '{}'::json)
                   FROM (SELECT tracker_arm(tracker, 'landing_variant') AS arm, count(*) AS n FROM starts GROUP BY 1) a)
    ),
    'finished', json_build_object(
      'all', (SELECT count(*) FROM subs),
      'google_ads', (SELECT count(*) FROM subs WHERE google_ads)
    ),
    'checkout', (SELECT count(*) FROM checkout),
    'paywall', (SELECT count(*) FROM paywall),
    'sales', (SELECT count(*) FROM money WHERE amount > 0),
    'sales_google_ads', (SELECT count(*) FROM money WHERE amount > 0 AND google_ads),
    'gifted', (SELECT count(*) FROM money WHERE coalesce(amount, 0) = 0),
    'revenue', (SELECT coalesce(sum(amount) FILTER (WHERE amount > 0), 0) FROM money),
    'finish_cohort', json_build_object(
      'finished', (SELECT count(*) FROM subs),
      'paid', (SELECT count(*) FROM subs s
                WHERE EXISTS (SELECT 1 FROM personal_report pr JOIN payment p ON p.personal_report_id = pr.id
                               WHERE pr.survey_submission_id = s.id
                                 AND p.status = 'succeeded' AND NOT p.is_test AND p.amount > 0))
    ),
    'start_cohort', (
      SELECT json_object_agg(slice, json_build_object('started', started, 'finished', finished))
        FROM (
          SELECT 'all' AS slice, count(*) AS started, count(*) FILTER (WHERE finished) AS finished FROM start_src
          UNION ALL
          SELECT 'google_ads', count(*), count(*) FILTER (WHERE finished) FROM start_src WHERE coalesce(ads, false)
          UNION ALL
          SELECT 'other', count(*), count(*) FILTER (WHERE finished) FROM start_src WHERE NOT coalesce(ads, false) AND coalesce(known, false)
          UNION ALL
          SELECT 'phone', count(*), count(*) FILTER (WHERE finished) FROM start_src WHERE device IN ('iOS', 'Android')
          UNION ALL
          SELECT 'computer', count(*), count(*) FILTER (WHERE finished) FROM start_src WHERE device = 'Desktop'
        ) c
    ),
    'survey_minutes', (
      SELECT json_build_object(
               'n', count(*),
               'median', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) / 60000.0)::numeric, 1),
               'p90', round((percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_ms) / 60000.0)::numeric, 1))
        FROM subs WHERE duration_ms > 0
    ),
    'report_minutes', (
      SELECT json_build_object(
               'n', count(*),
               'median', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM took)) / 60.0)::numeric, 1),
               'p90', round((percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM took)) / 60.0)::numeric, 1))
        FROM sessions
    ),
    'thumbs', json_build_object(
      'up', (SELECT count(*) FROM thumbs WHERE feedback = 'up'),
      'down', (SELECT count(*) FROM thumbs WHERE feedback = 'down')
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.get_kpi_week(timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_kpi_week(timestamp with time zone, timestamp with time zone) TO service_role;
