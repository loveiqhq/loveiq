-- Pay to start (20261018120000, features/pay-to-start) out of the free funnel's readouts.
--
-- A visitor on /sexual-archetype pays before the survey. Its visits are labelled
-- `pay_to_start` in funnel_event (never a landing arm), its buyers' surveys claim a
-- prepaid_report_access row (and their tracker carries "journey":"pay_to_start" when there
-- is one), and its pre-report wizard shows slides 0, 3, 4 and 5 under `wizard_variant`.
-- PR #608 kept them out of the TypeScript readouts (experiment-readouts, the funnel
-- digest's visitor count). The SQL ones still counted them:
--
--   get_arm_cohorts, get_axis_funnel_daily   a buyer as a pricing-arm reader who never paid
--                                            (their report mints quotes for All 14)
--   get_landing_arm_funnel_daily,            the page's visits as free-funnel visits
--   get_landing_start_funnel_daily,          (the conversion digest's Visits, the
--   get_funnel_cvr_sparklines,               "reach the survey" line, the drop-off funnel,
--   get_dropoff_everywhere                   whose first survey step counts the buyers'
--                                            survey views as the TypeScript digest does not)
--   get_wizard_funnel, get_dropoff_everywhere   a 4-slide reader at slide 3 but never 1 or 2
--
-- Each body is production's live pg_get_functiondef (2026-10-18) with lines added and none
-- changed. Signatures, volatility, SECURITY DEFINER and search_path are unchanged, so CREATE
-- OR REPLACE keeps each function's grants and adds no overload. get_funnel_cvr_sparklines'
-- white_checkout / white_paid (June's pay-first test, read by no code today) keep to June's
-- rows (offer IS NULL), which is what they meant.
--
-- What stays: its finishers, payments and revenue in the digests' totals and later stages,
-- as in the TypeScript digest, so rates per visit read slightly high while the page sells.
-- Left for a decision on how AP-Analytics, Jarvis and the KPI week should show this journey
-- (ap_facts, get_kpi_week, brain_daily_rollup): they see it as before, visits included, so
-- their visits run above the digests' by the page's.
-- Rollback: supabase/rollbacks/20261018130000_pay_to_start_out_of_free_funnel_readouts_down.sql

-- Whether a submission was bought before it was taken: it claimed a pay-to-start entitlement
-- (the record, whatever the tracker), or its tracker carries the server's journey label (a
-- claim that failed before it bound). Never NULL: every caller writes `AND NOT` this, and
-- NOT NULL would drop the row, as it did in the first draft for every tracker without a
-- `journey` key (each landing arm vanished from the readouts on staging). The CASE checks
-- the text before the cast: a tracker comes from the browser, and one bad cast would fail
-- the whole readout.
CREATE OR REPLACE FUNCTION public.pay_to_start_submission(p_submission_id bigint, p_utm_tracker text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
           SELECT 1 FROM prepaid_report_access p
            WHERE p.consumed_submission_id = p_submission_id AND p.offer IS NOT NULL
         )
      OR CASE
           WHEN p_utm_tracker IS NOT NULL AND pg_input_is_valid(p_utm_tracker, 'jsonb')
             THEN coalesce(
                    jsonb_typeof(p_utm_tracker::jsonb) = 'object'
                      AND p_utm_tracker::jsonb->>'journey' = 'pay_to_start',
                    false)
           ELSE false
         END;
$function$;

REVOKE ALL ON FUNCTION public.pay_to_start_submission(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_to_start_submission(bigint, text) TO service_role;

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
             (SELECT COALESCE((SELECT h.old_experiment_group FROM report_price_quote_arm_history h WHERE h.quote_id = q.id ORDER BY h.changed_at, h.id LIMIT 1), q.experiment_group, q.base_price_bucket)
                FROM report_price_quote q
               WHERE q.survey_submission_id = ss.id
                 AND COALESCE((SELECT h.old_experiment_group FROM report_price_quote_arm_history h WHERE h.quote_id = q.id ORDER BY h.changed_at, h.id LIMIT 1), q.experiment_group, q.base_price_bucket) IS NOT NULL
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
       -- Not a survey bought before it was taken (pay to start): its buyer is in no arm,
       -- and its EUR 29 is no arm's sale. The TypeScript readout leaves claimed surveys out too.
       AND NOT pay_to_start_submission(ss.id, ss.utm_tracker)
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
       -- Not a survey bought before it was taken (pay to start): its buyer is in no arm,
       -- and its EUR 29 is no arm's sale. The TypeScript readout leaves claimed surveys out too.
       AND NOT pay_to_start_submission(ss.id, ss.utm_tracker)
  ),
  quote AS (
    SELECT q.survey_submission_id                     AS id,
           -- Same expression as get_arm_cohorts, so the two cannot disagree.
           MIN(COALESCE((SELECT h.old_experiment_group FROM report_price_quote_arm_history h WHERE h.quote_id = q.id ORDER BY h.changed_at, h.id LIMIT 1), q.experiment_group, q.base_price_bucket)) AS pricing_arm,
           COUNT(DISTINCT COALESCE((SELECT h.old_experiment_group FROM report_price_quote_arm_history h WHERE h.quote_id = q.id ORDER BY h.changed_at, h.id LIMIT 1), q.experiment_group, q.base_price_bucket)) AS arm_variants,
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
       -- Not a visit to the pay-to-start page (labelled in proxy.ts): it cannot start the free
       -- survey, so it is no free-funnel visit. It stays in funnel_event and in AP.
       AND landing_variant IS DISTINCT FROM 'pay_to_start'
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

CREATE OR REPLACE FUNCTION public.get_landing_start_funnel_daily(since_ts timestamp with time zone, until_ts timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
  -- ::date on a timestamptz uses the SESSION TimeZone. Pin it so the visit-day
  -- buckets cannot drift a day relative to the window on a non-UTC session.
  -- Floored at the first day BOTH sides were instrumented.
  --
  -- Without this the chart draws a solid measured 0% across almost the whole
  -- window instead of a gap, and the caller cannot detect it: `unique_visitor`
  -- rows have carried `landing_variant` since 2026-06-14, so the DENOMINATOR
  -- exists for every past day, while the numerator (`survey_engine_mount`) only
  -- began carrying an arm at this deploy. The caller gaps a day only when its
  -- visits are missing, so it sees visits>0, starts=0 and plots a real zero. The
  -- headline is worse: it sums a post-deploy numerator over a 30-day
  -- denominator, understating the rate by roughly the window length.
  --
  -- 08-25, measured rather than assumed. The stale-bundle argument is real — a
  -- browser on the old bundle writes an arm-less row and the client insert uses
  -- `resolution=ignore-duplicates` against a (visitor_id, day, event_type) key,
  -- so that arm-less row wins for the rest of that UTC day — but the deploy that
  -- started attaching the arm landed on 08-24, not 08-25. Counted in production:
  --
  --   08-23:  13 mounts,  13 arm-less,   0 with an arm
  --   08-24:  24 mounts,  22 arm-less,   2 with an arm   <- the poisoned day
  --   08-25:  23 mounts,   0 arm-less,  23 with an arm   <- clean
  --
  -- So 08-24 is the day to exclude and 08-25 is the first honest one. The old
  -- floor of 08-26 threw away a complete day, which delays the caller's chart by
  -- one run: the caller needs SEVEN points, not two, because buildStartSeries
  -- gaps any day without a full 7-day window behind it.
  first_instrumented_day CONSTANT DATE := DATE '2026-08-25';
  since_day DATE := GREATEST((since_ts AT TIME ZONE 'Europe/Berlin')::date, first_instrumented_day);
  until_day DATE := (until_ts AT TIME ZONE 'Europe/Berlin')::date;
BEGIN
  WITH visits AS (
    SELECT day,
           COALESCE(landing_variant, 'unknown') AS arm,
           COUNT(DISTINCT visitor_id)::int      AS n
      FROM funnel_event
     WHERE event_type = 'unique_visitor'
       AND day >= since_day AND day < until_day
       -- Not a visit to the pay-to-start page (labelled in proxy.ts): it cannot start the free
       -- survey, so it is no free-funnel visit. It stays in funnel_event and in AP.
       AND landing_variant IS DISTINCT FROM 'pay_to_start'
     GROUP BY 1, 2
  ),
  starts AS (
    SELECT day,
           COALESCE(landing_variant, 'unknown') AS arm,
           COUNT(DISTINCT visitor_id)::int      AS n
      FROM funnel_event
     WHERE event_type = 'survey_engine_mount'
       AND day >= since_day AND day < until_day
       -- A buyer's survey (pay to start) is no landing visit's start.
       AND landing_variant IS DISTINCT FROM 'pay_to_start'
     GROUP BY 1, 2
  ),
  day_arm AS (
    SELECT day, arm FROM visits
    UNION SELECT day, arm FROM starts
  )
  SELECT json_build_object(
    'daily', COALESCE((
      SELECT json_agg(json_build_object(
               'day',    to_char(da.day, 'YYYY-MM-DD'),
               'arm',    da.arm,
               'visits', COALESCE(v.n, 0),
               'starts', COALESCE(s.n, 0)
             ) ORDER BY da.day, da.arm)
        FROM day_arm da
        LEFT JOIN visits v ON v.day = da.day AND v.arm = da.arm
        LEFT JOIN starts s ON s.day = da.day AND s.arm = da.arm
    ), '[]'::json),
    -- Window totals per arm, for the chart's headline. Deliberately NOT a
    -- significance input: see the id-space note in the header — these are not
    -- two measurements of the same population.
    'totals', COALESCE((
      SELECT json_agg(json_build_object(
               'arm',    t.arm,
               'visits', t.visits,
               'starts', t.starts
             ) ORDER BY t.visits DESC, t.arm)
        FROM (
          -- Stacked then summed, rather than joined: an outer join on (arm, day)
          -- is correct here but only after reasoning about which side is null on
          -- an arm that has visits on one day and starts on another. This form
          -- cannot get that wrong.
          SELECT arm,
                 SUM(visits)::int AS visits,
                 SUM(starts)::int AS starts
            FROM (
              SELECT arm, n AS visits, 0 AS starts FROM visits
              UNION ALL
              SELECT arm, 0 AS visits, n AS starts FROM starts
            ) u
           GROUP BY arm
        ) t
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
      -- Not the pay-to-start page's visits: no free-funnel visit (20261018130000).
      AND landing_variant IS DISTINCT FROM 'pay_to_start'
    GROUP BY day
  ),
  visitors_control AS (
    SELECT day, COUNT(DISTINCT visitor_id)::int AS n
    FROM funnel_event
    WHERE event_type = 'unique_visitor' AND day >= since_day AND day < until_day
      AND COALESCE(landing_variant, 'control') <> 'white'
      AND landing_variant IS DISTINCT FROM 'pay_to_start'
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
    --
    -- A FINISHED survey is a start too. A submit deletes its draft, and since
    -- 2026-10-05 nothing re-creates it, so drafts alone stopped counting anyone who
    -- finished: "Started" fell by the day's finishers and the site-wide "reach the
    -- survey" line dipped from that day. Each session counts once (a finisher from
    -- before then still has its draft), on the day it started, which is the same
    -- day for its draft and its submission. Our own test runs are left out, as in
    -- `completions` below.
    SELECT day, COUNT(DISTINCT session_id)::int AS n
    FROM (
      SELECT (started_at AT TIME ZONE 'Europe/Berlin')::date AS day, session_id
      FROM survey_partial_save
      WHERE started_at >= since_ts AND started_at < until_ts
        AND current_index >= 1
      UNION
      SELECT (ss.start_date_time AT TIME ZONE 'Europe/Berlin')::date AS day, ss.session_id
      FROM survey_submission ss
      WHERE ss.status = 'completed' AND ss.session_id IS NOT NULL
        AND ss.start_date_time >= since_ts AND ss.start_date_time < until_ts
        AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = ss.user_id AND u.email ~* '@loveiq\.org$')
    ) started
    GROUP BY 1
  ),
  white_checkout AS (
    SELECT (created_at AT TIME ZONE 'Europe/Berlin')::date AS day, COUNT(*)::int AS n
    FROM prepaid_report_access
    WHERE created_at >= since_ts AND created_at < until_ts
      AND offer IS NULL  -- June's pay-first test only; pay to start has its own readout
    GROUP BY (created_at AT TIME ZONE 'Europe/Berlin')::date
  ),
  white_paid AS (
    SELECT (updated_at AT TIME ZONE 'Europe/Berlin')::date AS day, COUNT(*)::int AS n
    FROM prepaid_report_access
    WHERE status = 'succeeded' AND updated_at >= since_ts AND updated_at < until_ts
      AND offer IS NULL
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

CREATE OR REPLACE FUNCTION public.get_wizard_funnel(since_ts timestamp with time zone, until_ts timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
BEGIN
  WITH advanced AS (
    SELECT survey_submission_id, (metadata->>'to_slide')::int AS to_slide
    FROM analytics_event
    WHERE event_type = 'wizard_slide_advanced'
      AND event_time >= since_ts
      AND event_time <  until_ts
      AND survey_submission_id IS NOT NULL
      AND metadata ? 'to_slide'
      AND metadata->>'to_slide' ~ '^[0-9]+$'
      -- The six-slide wizard only: pay to start's four (wizard_variant) skip slides 1 and 2.
      AND metadata->>'wizard_variant' IS NULL
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
$function$;

CREATE OR REPLACE FUNCTION public.get_dropoff_everywhere(since_ts timestamp with time zone, until_ts timestamp with time zone)
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
  SELECT json_build_object(
    'stages', json_build_array(
      json_build_object('name', 'unique_visitors', 'count', (
        SELECT COUNT(DISTINCT visitor_id)::int FROM funnel_event
        WHERE event_type = 'unique_visitor' AND day >= since_day AND day < until_day
          AND landing_variant IS DISTINCT FROM 'pay_to_start'
      )),
      json_build_object('name', 'saw_q1', 'count', (
        SELECT COUNT(DISTINCT visitor_id)::int FROM funnel_event
        WHERE event_type = 'survey_engine_mount' AND day >= since_day AND day < until_day
          AND landing_variant IS DISTINCT FROM 'pay_to_start'
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
          AND metadata->>'wizard_variant' IS NULL
          AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'wizard_slide_5', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'wizard_slide_advanced'
          AND metadata->>'to_slide' ~ '^[0-9]+$'
          AND (metadata->>'to_slide')::int = 5
          AND metadata->>'wizard_variant' IS NULL
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
        SELECT COUNT(*)::int FROM (
          SELECT survey_submission_id FROM report_price_quote
           WHERE paywall_reached_at >= since_ts AND paywall_reached_at < until_ts
             AND survey_submission_id IS NOT NULL
          UNION
          SELECT survey_submission_id FROM analytics_event
           WHERE event_type = 'paywall_initiated'
             AND event_time >= since_ts AND event_time < until_ts
             AND survey_submission_id IS NOT NULL
        ) reached
      )),
      json_build_object('name', 'begin_checkout', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM report_price_quote
        WHERE checkout_started_at >= since_ts AND checkout_started_at < until_ts
      )),
      json_build_object('name', 'purchased', 'count', (
        SELECT COUNT(*)::int FROM payment
        WHERE status = 'succeeded'
          AND is_test = false
          AND created_date_time >= since_ts AND created_date_time < until_ts
      ))
    )
  ) INTO result;
  RETURN result;
END;
$function$;

