-- AP-Analytics reads the new tracking (14 Oct 2026): per-chapter report reading, the intro
-- cards' Back and Skip, tablets, Meta Ads and organic search as sources, and per-email opens
-- and clicks. The three readers are replaced whole (bodies otherwise as in 20261013120000,
-- 20261013120200 and 20261013120300); the tables and columns they read come first, in
-- 20261014120100..20261014120300. Rollback: supabase/rollbacks/20261014130000_ap_tracking_down.sql.

CREATE OR REPLACE FUNCTION public.ap_facts(p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
  b AS (
    SELECT (p_from::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
           ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
  ),
  staff AS (SELECT u.id FROM app_user u WHERE u.email ~* '@loveiq\.org$'),
  visits AS (
    SELECT f.day, COALESCE(f.landing_variant, 'unknown') AS arm, f.utm_source AS src, count(*) AS n
      FROM funnel_event f
     WHERE f.event_type = 'unique_visitor' AND f.day >= p_from AND f.day <= p_to
     GROUP BY 1, 2, 3
  ),
  cand AS (
    SELECT e.session_id FROM survey_behavior_event e, b
     WHERE e.created_at >= b.since_ts AND e.created_at < b.until_ts AND e.session_id IS NOT NULL
    UNION
    SELECT d.session_id FROM survey_partial_save d, b
     WHERE d.started_at >= b.since_ts AND d.started_at < b.until_ts AND d.session_id IS NOT NULL
    UNION
    SELECT s.session_id FROM survey_submission s, b
     WHERE s.start_date_time >= b.since_ts AND s.start_date_time < b.until_ts AND s.session_id IS NOT NULL
  ),
  ev AS (
    SELECT e.session_id, min(e.created_at) AS first_at,
           (bool_or(e.answered IS TRUE) OR bool_or(e.direction = 'complete')) AS answered,
           (array_agg(e.device_type ORDER BY e.created_at DESC, e.id DESC)
              FILTER (WHERE e.device_type IS NOT NULL))[1] AS device
      FROM survey_behavior_event e
     WHERE e.session_id IN (SELECT session_id FROM cand)
     GROUP BY e.session_id
  ),
  dr AS (
    SELECT d.session_id, min(d.started_at) AS started_at, max(d.current_index) AS idx,
           (array_agg(d.utm_tracker ORDER BY d.saved_at DESC NULLS LAST)
              FILTER (WHERE d.utm_tracker IS NOT NULL))[1] AS tracker
      FROM survey_partial_save d
     WHERE d.session_id IN (SELECT session_id FROM cand)
     GROUP BY d.session_id
  ),
  sb AS (
    SELECT DISTINCT ON (s.session_id) s.session_id, s.user_id, s.status, s.start_date_time, s.utm_tracker
      FROM survey_submission s
     WHERE s.session_id IN (SELECT session_id FROM cand)
     ORDER BY s.session_id, (s.status = 'completed') DESC, s.id
  ),
  starts AS (
    SELECT (LEAST(ev.first_at, dr.started_at, sb.start_date_time) AT TIME ZONE 'Europe/Berlin')::date AS day,
           LEAST(ev.first_at, dr.started_at, sb.start_date_time) AS started_at,
           COALESCE(sb.status = 'completed', false) AS finished,
           (dr.session_id IS NOT NULL OR sb.session_id IS NOT NULL) AS known,
           COALESCE(sb.utm_tracker, dr.tracker) AS tracker,
           ev.device
      FROM cand c
      LEFT JOIN ev ON ev.session_id = c.session_id
      LEFT JOIN dr ON dr.session_id = c.session_id
      LEFT JOIN sb ON sb.session_id = c.session_id
     WHERE (COALESCE(ev.answered, false) OR COALESCE(dr.idx, 0) >= 1 OR sb.status = 'completed')
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = sb.user_id)
  ),
  start_rows AS (
    SELECT st.day, st.finished, st.known, st.device, t.j
      FROM starts st, b,
           LATERAL (SELECT CASE WHEN st.tracker IS NOT NULL AND pg_input_is_valid(st.tracker, 'jsonb')
                                 AND jsonb_typeof(st.tracker::jsonb) = 'object'
                            THEN st.tracker::jsonb END AS j) t
     WHERE st.started_at >= b.since_ts AND st.started_at < b.until_ts
  ),
  subs AS (
    SELECT s.id, s.user_id, s.created_date_time, s.start_date_time, s.duration_ms,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j
      FROM survey_submission s, b
     WHERE s.status = 'completed'
       AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  rep AS (
    SELECT pr.id AS report_id, pr.survey_submission_id AS sid
      FROM personal_report pr
     WHERE pr.survey_submission_id IN (SELECT id FROM subs)
  ),
  -- Report sessions a reader starts within 30 minutes of the latest END of the ones before
  -- (a session's start when no plausible end was recorded) are one visit: a reload, a long
  -- read, a second tab or a quick reopen is not a return.
  sess0 AS (
    SELECT r.sid, rs.started_at, rs.ended_at,
           lag(rs.started_at) OVER w AS prev_start,
           max(CASE WHEN rs.ended_at > rs.started_at AND rs.ended_at - rs.started_at < interval '4 hours'
                    THEN rs.ended_at ELSE rs.started_at END)
             OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_end
      FROM report_session rs
      JOIN rep r ON r.report_id = rs.personal_report_id
     WHERE NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = rs.user_id)
    WINDOW w AS (PARTITION BY r.sid ORDER BY rs.started_at)
  ),
  sess AS (
    SELECT s.sid, s.started_at, s.ended_at,
           (s.prev_start IS NULL OR s.started_at - s.prev_end >= interval '30 minutes') AS new_visit
      FROM sess0 s
  ),
  reading AS (
    SELECT s.sid,
           min(s.started_at) AS opened_at,
           count(*) FILTER (WHERE s.new_visit) AS visits,
           min(s.started_at) FILTER (WHERE s.new_visit AND s.started_at > (SELECT min(x.started_at) FROM sess x WHERE x.sid = s.sid)) AS returned_at,
           -- A session counts up to 30 minutes: longer is mostly a tab left open (14 Oct 2026).
           coalesce(sum(least(extract(epoch FROM s.ended_at - s.started_at), 1800) * 1000)
                      FILTER (WHERE s.ended_at > s.started_at AND s.ended_at - s.started_at < interval '4 hours'), 0)::bigint AS read_ms,
           count(*) FILTER (WHERE s.ended_at > s.started_at AND s.ended_at - s.started_at < interval '4 hours') AS closed
      FROM sess s
     GROUP BY s.sid
  ),
  q AS (
    SELECT q.survey_submission_id AS sid,
           min(q.paywall_reached_at) AS paywall_at,
           min(q.checkout_started_at) AS checkout_at,
           (array_agg(q.device_type ORDER BY q.created_date_time DESC) FILTER (WHERE q.device_type IS NOT NULL))[1] AS device,
           (array_agg(q.country_tier ORDER BY q.created_date_time DESC) FILTER (WHERE q.country_tier IS NOT NULL))[1] AS tier,
           (array_agg(q.experiment_group ORDER BY q.created_date_time DESC) FILTER (WHERE q.experiment_group IS NOT NULL))[1] AS price_arm
      FROM report_price_quote q
     WHERE q.survey_submission_id IN (SELECT id FROM subs)
     GROUP BY 1
  ),
  -- The device the survey itself recorded (survey steps, from 12 Oct 2026), for readers with no
  -- price quote yet: a quote is made only when the report is opened.
  step_device AS (
    SELECT DISTINCT ON (s.id) s.id AS sid, e.device_type AS device
      FROM survey_submission s
      JOIN survey_behavior_event e ON e.session_id = s.session_id
     WHERE s.id IN (SELECT id FROM subs) AND e.device_type IS NOT NULL
     ORDER BY s.id, e.created_at DESC
  ),
  clicked AS (
    SELECT a.survey_submission_id AS sid, min(a.event_time) AS at
      FROM analytics_event a
     WHERE a.event_type = 'paywall_initiated' AND a.survey_submission_id IN (SELECT id FROM subs)
     GROUP BY 1
  ),
  paid AS (
    SELECT pr.survey_submission_id AS sid,
           min(p.created_date_time) FILTER (WHERE p.amount > 0) AS paid_at,
           count(*) FILTER (WHERE p.amount > 0) AS sales,
           coalesce(sum(p.amount) FILTER (WHERE p.amount > 0), 0) AS revenue,
           bool_or(coalesce(p.amount, 0) = 0) AS gifted,
           (array_agg(p.metadata->>'plan' ORDER BY p.created_date_time) FILTER (WHERE p.amount > 0))[1] AS plan
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
     WHERE p.status = 'succeeded' AND coalesce(p.is_test, false) = false
       AND pr.survey_submission_id IN (SELECT id FROM subs)
     GROUP BY 1
  ),
  -- Shares, votes and invites with the first one's time, so a comparison with an earlier
  -- period can count them at the same age.
  shared AS (
    SELECT r.sid, min(x.created_at) AS at
      FROM report_share x JOIN rep r ON r.report_id = x.personal_report_id
     GROUP BY 1
  ),
  votes AS (
    SELECT f.survey_submission_id AS sid, count(*) AS n, min(f.created_at) AS at
      FROM report_section_feedback f
     WHERE f.survey_submission_id IN (SELECT id FROM subs)
     GROUP BY 1
  ),
  invited AS (
    SELECT s.id AS sid, min(i.created_at) AS at
      FROM subs s
      JOIN app_user u ON u.id = s.user_id
      JOIN invite_event i ON lower(i.referrer_email) = lower(u.email) AND i.created_at >= s.created_date_time
     GROUP BY 1
  ),
  wizard AS (
    SELECT a.survey_submission_id AS sid,
           max(CASE WHEN (a.metadata->>'to_slide') ~ '^[0-9]+$' THEN (a.metadata->>'to_slide')::int END)
             FILTER (WHERE a.metadata->>'direction' = 'next') AS slide
      FROM analytics_event a
     WHERE a.event_type = 'wizard_slide_advanced' AND a.survey_submission_id IN (SELECT id FROM subs)
     GROUP BY 1
  ),
  who AS (
    SELECT s.id AS sid, up.location_primary AS country, up.gender, up.relationship_status AS relationship
      FROM subs s
      JOIN app_user u ON u.id = s.user_id
      JOIN user_profile up ON up.id = u.user_profile_id
  ),
  age AS (
    SELECT DISTINCT ON (a.survey_submission_id) a.survey_submission_id AS sid, ao.option_text AS age
      FROM survey_submission_answer a
      JOIN survey_question sq ON sq.id = a.survey_question_id AND sq.frontend_qid = '15003'
      JOIN answer_option ao ON ao.id = a.answer_option_id
     WHERE a.survey_submission_id IN (SELECT id FROM subs)
     ORDER BY a.survey_submission_id, a.id DESC
  ),
  sub_rows AS (
    SELECT s.id, s.created_date_time, s.start_date_time, s.duration_ms, s.j,
           (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day,
           r.opened_at, r.visits, r.returned_at, r.read_ms, r.closed,
           q.paywall_at, c.at AS clicked_at, q.checkout_at, coalesce(q.device, sd.device) AS device, q.tier, q.price_arm,
           p.paid_at, p.sales, p.revenue, p.gifted, p.plan,
           (sh.sid IS NOT NULL) AS shared, sh.at AS shared_at, coalesce(v.n, 0) AS votes, v.at AS voted_at,
           (iv.sid IS NOT NULL) AS invited, iv.at AS invited_at,
           w.slide AS wizard_slide,
           who.country, who.gender, who.relationship, age.age
      FROM subs s
      LEFT JOIN reading r ON r.sid = s.id
      LEFT JOIN q ON q.sid = s.id
      LEFT JOIN step_device sd ON sd.sid = s.id
      LEFT JOIN clicked c ON c.sid = s.id
      LEFT JOIN paid p ON p.sid = s.id
      LEFT JOIN shared sh ON sh.sid = s.id
      LEFT JOIN votes v ON v.sid = s.id
      LEFT JOIN invited iv ON iv.sid = s.id
      LEFT JOIN wizard w ON w.sid = s.id
      LEFT JOIN who ON who.sid = s.id
      LEFT JOIN age ON age.sid = s.id
  ),
  money AS (
    SELECT (p.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day, p.amount, s.id AS sid,
           p.metadata->>'plan' AS plan,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j,
           (SELECT q2.device_type FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.device_type IS NOT NULL ORDER BY q2.created_date_time DESC LIMIT 1) AS device,
           (SELECT q2.country_tier FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.country_tier IS NOT NULL ORDER BY q2.created_date_time DESC LIMIT 1) AS tier
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
      JOIN survey_submission s ON s.id = pr.survey_submission_id, b
     WHERE p.status = 'succeeded' AND coalesce(p.is_test, false) = false
       AND p.created_date_time >= b.since_ts AND p.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  quotes AS (
    SELECT q.id, q.survey_submission_id AS sid, q.plan, q.experiment_group AS price_arm,
           coalesce(q.initial_price, q.current_price) AS price, q.checkout_started_at, q.device_type AS device,
           q.country_tier AS tier,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j
      FROM report_price_quote q
      JOIN survey_submission s ON s.id = q.survey_submission_id, b
     WHERE q.created_date_time >= b.since_ts AND q.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  -- The primary key (visitor_id, day, event_type) keeps both joins to one row at most, so
  -- count(*) is still one per visitor.
  intro AS (
    SELECT f.day, f.event_type AS step, count(*) AS n,
           coalesce(array_agg(round(extract(epoch FROM nx.first_seen - f.first_seen) * 1000)::bigint)
                      FILTER (WHERE nx.first_seen > f.first_seen), '{}') AS ms,
           count(*) FILTER (WHERE nx.visitor_id IS NULL AND q1.visitor_id IS NOT NULL) AS skipped
      FROM funnel_event f
      LEFT JOIN funnel_event nx
        ON nx.visitor_id = f.visitor_id AND nx.day = f.day
       AND nx.event_type = CASE f.event_type
                             WHEN 'intro_slide_1' THEN 'intro_slide_2'
                             WHEN 'intro_slide_2' THEN 'intro_slide_3'
                             WHEN 'intro_slide_3' THEN 'intro_slide_4'
                             WHEN 'intro_slide_4' THEN 'survey_engine_mount'
                           END
      LEFT JOIN funnel_event q1
        ON q1.visitor_id = f.visitor_id AND q1.day = f.day
       AND q1.event_type = 'survey_engine_mount' AND q1.first_seen > f.first_seen
       AND f.event_type IN ('intro_slide_1', 'intro_slide_2', 'intro_slide_3')
     WHERE f.event_type IN ('survey_engine_mount', 'intro_slide_1', 'intro_slide_2', 'intro_slide_3', 'intro_slide_4')
       AND f.day >= p_from AND f.day <= p_to
     GROUP BY 1, 2
  ),
  invites AS (
    SELECT (i.created_at AT TIME ZONE 'Europe/Berlin')::date AS day, count(*) AS n
      FROM invite_event i, b
     WHERE i.created_at >= b.since_ts AND i.created_at < b.until_ts
       AND coalesce(i.referrer_email, '') !~* '@loveiq\.org$'
     GROUP BY 1
  ),
  quote_sales AS (
    SELECT p.pricing_quote_id AS id, count(*) AS sales, sum(p.amount) AS revenue
      FROM payment p
     WHERE p.status = 'succeeded' AND coalesce(p.is_test, false) = false AND p.amount > 0
       AND p.pricing_quote_id IN (SELECT id FROM quotes)
     GROUP BY 1
  )
  SELECT json_build_object(
    'visits', (SELECT coalesce(json_agg(json_build_object('day', v.day, 'arm', v.arm, 'src', v.src, 'n', v.n)), '[]'::json) FROM visits v),
    'starts', (
      SELECT coalesce(json_agg(json_build_object(
               'day', g.day, 'known', g.known, 'src', g.src, 'med', g.med, 'ads', g.ads, 'arm', g.arm,
               'device', g.device, 'finished', g.finished, 'n', g.n)), '[]'::json)
        FROM (
          SELECT sr.day, sr.known, sr.j->>'utm_source' AS src, sr.j->>'utm_medium' AS med,
                 (coalesce(sr.j->>'gclid', '') <> '' OR coalesce(sr.j->>'gbraid', '') <> '' OR coalesce(sr.j->>'wbraid', '') <> '') AS ads,
                 sr.j->>'landing_variant' AS arm, sr.device, sr.finished, count(*) AS n
            FROM start_rows sr
           GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
        ) g
    ),
    'subs', (
      SELECT coalesce(json_agg(json_build_object(
               'id', x.id, 'day', x.day, 'at', x.created_date_time, 'startAt', x.start_date_time,
               'durationMs', x.duration_ms,
               'src', x.j->>'utm_source', 'med', x.j->>'utm_medium',
               'ads', (coalesce(x.j->>'gclid', '') <> '' OR coalesce(x.j->>'gbraid', '') <> '' OR coalesce(x.j->>'wbraid', '') <> ''),
               'arm', x.j->>'landing_variant',
               'device', x.device, 'tier', x.tier, 'priceArm', x.price_arm,
               'country', x.country, 'gender', x.gender, 'relationship', x.relationship, 'age', x.age,
               'openedAt', x.opened_at, 'visits', coalesce(x.visits, 0), 'returnedAt', x.returned_at,
               'readMs', coalesce(x.read_ms, 0), 'closed', coalesce(x.closed, 0),
               'paywallAt', x.paywall_at, 'clickedAt', x.clicked_at, 'checkoutAt', x.checkout_at,
               'paidAt', x.paid_at, 'sales', coalesce(x.sales, 0), 'revenue', coalesce(x.revenue, 0),
               'gifted', coalesce(x.gifted, false), 'plan', x.plan,
               'shared', x.shared, 'sharedAt', x.shared_at, 'votes', x.votes, 'votedAt', x.voted_at,
               'invited', x.invited, 'invitedAt', x.invited_at, 'wizardSlide', x.wizard_slide
             ) ORDER BY x.created_date_time), '[]'::json)
        FROM sub_rows x
    ),
    'money', (
      SELECT coalesce(json_agg(json_build_object(
               'day', m.day, 'sid', m.sid, 'amount', m.amount, 'plan', m.plan,
               'src', m.j->>'utm_source', 'med', m.j->>'utm_medium',
               'ads', (coalesce(m.j->>'gclid', '') <> '' OR coalesce(m.j->>'gbraid', '') <> '' OR coalesce(m.j->>'wbraid', '') <> ''),
               'arm', m.j->>'landing_variant', 'device', m.device, 'tier', m.tier)), '[]'::json)
        FROM money m
    ),
    'intro', (SELECT coalesce(json_agg(json_build_object('day', x.day, 'step', x.step, 'n', x.n, 'ms', x.ms, 'skipped', x.skipped)), '[]'::json) FROM intro x),
    'invites', (SELECT coalesce(json_agg(json_build_object('day', x.day, 'n', x.n)), '[]'::json) FROM invites x),
    'quotes', (
      SELECT coalesce(json_agg(json_build_object(
               'plan', g.plan, 'priceArm', g.price_arm, 'price', g.price, 'src', g.src, 'med', g.med, 'ads', g.ads,
               'device', g.device, 'tier', g.tier, 'quoted', g.quoted, 'checkouts', g.checkouts,
               'sales', g.sales, 'revenue', g.revenue)), '[]'::json)
        FROM (
          SELECT qu.plan, qu.price_arm, qu.price, qu.j->>'utm_source' AS src, qu.j->>'utm_medium' AS med,
                 (coalesce(qu.j->>'gclid', '') <> '' OR coalesce(qu.j->>'gbraid', '') <> '' OR coalesce(qu.j->>'wbraid', '') <> '') AS ads,
                 qu.device, qu.tier,
                 count(DISTINCT qu.sid) AS quoted,
                 count(DISTINCT qu.sid) FILTER (WHERE qu.checkout_started_at IS NOT NULL) AS checkouts,
                 coalesce(sum(qs.sales), 0) AS sales,
                 coalesce(sum(qs.revenue), 0) AS revenue
            FROM quotes qu
            LEFT JOIN quote_sales qs ON qs.id = qu.id
           GROUP BY 1, 2, 3, 4, 5, 6, 7, 8
        ) g
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_facts(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_facts(date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.ap_survey_steps(p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
  b AS (
    SELECT (p_from::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
           ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
  ),
  staff_sessions AS (
    SELECT s.session_id
      FROM survey_submission s
      JOIN app_user u ON u.id = s.user_id
     WHERE u.email ~* '@loveiq\.org$' AND s.session_id IS NOT NULL
  ),
  ev AS (
    SELECT e.session_id, e.q_id, e.direction, e.answered,
           CASE WHEN e.time_spent_ms >= 0 AND e.time_spent_ms < 1800000 THEN e.time_spent_ms END AS ms
      FROM survey_behavior_event e, b
     WHERE e.created_at >= b.since_ts AND e.created_at < b.until_ts
       AND e.session_id IS NOT NULL AND e.q_id IS NOT NULL
       AND e.session_id NOT IN (SELECT session_id FROM staff_sessions)
  ),
  steps AS (
    SELECT q_id,
           count(DISTINCT session_id) FILTER (WHERE direction = 'back') AS went_back,
           count(DISTINCT session_id) FILTER (WHERE answered IS FALSE AND direction = 'forward') AS skipped,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE ms IS NOT NULL) AS median_ms,
           count(ms) AS timed
      FROM ev
     GROUP BY q_id
  ),
  last_step AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.q_id, e.created_at
      FROM survey_behavior_event e
     WHERE e.session_id IN (SELECT DISTINCT session_id FROM ev) AND e.q_id IS NOT NULL
     ORDER BY e.session_id, e.created_at DESC, e.id DESC
  ),
  done AS (
    SELECT DISTINCT e.session_id
      FROM survey_behavior_event e
     WHERE e.direction = 'complete' AND e.session_id IN (SELECT DISTINCT session_id FROM ev)
  ),
  exits AS (
    SELECT l.q_id, (l.created_at AT TIME ZONE 'Europe/Berlin')::date AS day, count(*) AS n
      FROM last_step l, b
     WHERE l.created_at >= b.since_ts AND l.created_at < b.until_ts
       AND l.session_id NOT IN (SELECT session_id FROM done)
     GROUP BY 1, 2
  )
  SELECT json_build_object(
    'steps', (SELECT coalesce(json_agg(json_build_object(
                'q_id', s.q_id, 'went_back', s.went_back, 'skipped', s.skipped,
                'median_ms', round(s.median_ms), 'timed', s.timed)), '[]'::json) FROM steps s),
    'exits', (SELECT coalesce(json_agg(json_build_object('q_id', x.q_id, 'day', x.day, 'n', x.n)), '[]'::json) FROM exits x)
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_survey_steps(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_survey_steps(date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.ap_report_extras(p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
  b AS (
    SELECT (p_from::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
           ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
  ),
  staff AS (SELECT u.id FROM app_user u WHERE u.email ~* '@loveiq\.org$'),
  subs AS (
    SELECT s.id, s.created_date_time
      FROM survey_submission s, b
     WHERE s.status = 'completed'
       AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  moves AS (
    SELECT a.survey_submission_id AS sid, a.event_time,
           CASE WHEN (a.metadata->>'from_slide') ~ '^[0-9]+$' THEN (a.metadata->>'from_slide')::int END AS from_slide,
           CASE WHEN (a.metadata->>'to_slide') ~ '^[0-9]+$' THEN (a.metadata->>'to_slide')::int END AS to_slide,
           a.metadata->>'direction' AS direction
      FROM analytics_event a
     WHERE a.event_type = 'wizard_slide_advanced' AND a.survey_submission_id IN (SELECT id FROM subs)
  ),
  arrivals AS (
    SELECT s.id AS sid, 0 AS slide, s.created_date_time AS at FROM subs s
    UNION ALL
    SELECT m.sid, m.to_slide, min(m.event_time) FROM moves m WHERE m.direction = 'next' AND m.to_slide IS NOT NULL GROUP BY 1, 2
  ),
  leaves AS (
    SELECT m.sid, m.from_slide AS slide, min(m.event_time) AS at
      FROM moves m WHERE m.direction = 'next' AND m.from_slide IS NOT NULL GROUP BY 1, 2
  ),
  dwell AS (
    SELECT l.slide, extract(epoch FROM l.at - a.at) * 1000 AS ms
      FROM leaves l JOIN arrivals a ON a.sid = l.sid AND a.slide = l.slide
     WHERE l.at > a.at AND l.at - a.at < interval '30 minutes'
  ),
  wizard AS (
    SELECT sl.slide,
           (SELECT count(DISTINCT m.sid) FROM moves m WHERE m.direction = 'next' AND m.from_slide = sl.slide) AS went_on,
           (SELECT count(DISTINCT m.sid) FROM moves m WHERE m.direction = 'previous' AND m.from_slide = sl.slide) AS went_back,
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY d.ms) FROM dwell d WHERE d.slide = sl.slide) AS median_ms,
           (SELECT count(*) FROM dwell d WHERE d.slide = sl.slide) AS timed
      FROM generate_series(0, 5) AS sl(slide)
  ),
  votes AS (
    SELECT f.created_at, f.survey_submission_id AS sid, f.section_id, f.feedback, f.issue,
           (coalesce(btrim(f.comment), '') <> '') AS commented
      FROM report_section_feedback f, b
     WHERE f.created_at >= b.since_ts AND f.created_at < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM survey_submission s JOIN staff ON staff.id = s.user_id WHERE s.id = f.survey_submission_id)
  ),
  paywall_clicks AS (
    SELECT a.metadata->>'section_id' AS section_id, count(DISTINCT a.survey_submission_id) AS readers
      FROM analytics_event a
     WHERE a.event_type IN ('paywall_initiated', 'lock_icon_clicked')
       AND a.survey_submission_id IN (SELECT id FROM subs)
       AND coalesce(a.metadata->>'section_id', '') <> ''
     GROUP BY 1
  ),
  -- Every nurture send of a reader, whenever it was, and their next one: a return counts for
  -- the email it came after, not for every earlier email too.
  all_sends AS (
    SELECT st.stage, q.survey_submission_id AS sid,
           min((q.metadata->'nurturePromoCodes'->st.stage->>'expiresAt')::timestamptz) - interval '24 hours' AS sent_at
      FROM report_price_quote q
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(q.metadata->'nurtureEmailsSent') = 'array' THEN q.metadata->'nurtureEmailsSent' ELSE '[]'::jsonb END
      ) AS st(stage)
     WHERE (q.metadata->'nurturePromoCodes'->st.stage->>'expiresAt') IS NOT NULL
     GROUP BY 1, 2
  ),
  sends AS (
    SELECT x.stage, x.sid, x.sent_at, lead(x.sent_at) OVER (PARTITION BY x.sid ORDER BY x.sent_at) AS next_at
      FROM all_sends x
  ),
  sent AS (
    SELECT se.stage, count(DISTINCT se.sid) AS n, count(DISTINCT a.survey_submission_id) AS returned
      FROM sends se
      CROSS JOIN b
      LEFT JOIN analytics_event a
        ON a.survey_submission_id = se.sid AND a.event_type = 'paywall_initiated'
       AND a.metadata->>'source' = 'offer_link' AND a.event_time >= se.sent_at
       AND (se.next_at IS NULL OR a.event_time < se.next_at)
     WHERE se.sent_at >= b.since_ts AND se.sent_at < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM survey_submission s JOIN staff ON staff.id = s.user_id WHERE s.id = se.sid)
     GROUP BY se.stage
  ),
  bought AS (
    SELECT p.metadata->>'promoStage' AS stage, count(*) AS n, sum(p.amount) AS revenue
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
      JOIN survey_submission s ON s.id = pr.survey_submission_id, b
     WHERE p.status = 'succeeded' AND coalesce(p.is_test, false) = false AND p.amount > 0
       AND p.metadata->>'promoStage' IS NOT NULL
       AND p.created_date_time >= b.since_ts AND p.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
     GROUP BY 1
  )
  SELECT json_build_object(
    'wizard', (SELECT coalesce(json_agg(json_build_object(
                 'slide', w.slide, 'went_on', w.went_on, 'went_back', w.went_back,
                 'median_ms', round(w.median_ms), 'timed', w.timed) ORDER BY w.slide), '[]'::json) FROM wizard w),
    'map_steppers', (SELECT coalesce(json_agg(DISTINCT a.survey_submission_id), '[]'::json)
                       FROM analytics_event a
                      WHERE a.event_type = 'wizard_map_step' AND a.metadata->>'control' IN ('next', 'previous')
                        AND a.survey_submission_id IN (SELECT id FROM subs)),
    'chapters', (SELECT coalesce(json_agg(json_build_object('section', c.section_id, 'up', c.up, 'down', c.down)), '[]'::json)
                   FROM (SELECT section_id, count(*) FILTER (WHERE feedback = 'up') AS up, count(*) FILTER (WHERE feedback = 'down') AS down
                           FROM votes GROUP BY section_id) c),
    'paywall_clicks', (SELECT coalesce(json_agg(json_build_object('section', pc.section_id, 'readers', pc.readers)), '[]'::json) FROM paywall_clicks pc),
    'issues', (SELECT coalesce(json_agg(json_build_object('issue', i.issue, 'n', i.n)), '[]'::json)
                 FROM (SELECT issue, count(*) AS n FROM votes WHERE feedback = 'down' AND issue IS NOT NULL GROUP BY issue) i),
    'feedback', (SELECT coalesce(json_agg(json_build_object(
                   'at', v.created_at, 'submission', v.sid, 'section', v.section_id, 'vote', v.feedback,
                   'issue', v.issue, 'commented', v.commented) ORDER BY v.created_at DESC), '[]'::json)
                   FROM (SELECT * FROM votes ORDER BY created_at DESC LIMIT 200) v),
    'votes_total', (SELECT count(*) FROM votes),
    'emails', (SELECT coalesce(json_agg(json_build_object('stage', x.stage, 'sent', x.sent, 'returned', x.returned, 'bought', x.bought, 'revenue', x.revenue)), '[]'::json)
                 FROM (SELECT coalesce(s.stage, bo.stage) AS stage, coalesce(s.n, 0) AS sent, coalesce(s.returned, 0) AS returned,
                              coalesce(bo.n, 0) AS bought, coalesce(bo.revenue, 0) AS revenue
                         FROM sent s FULL JOIN bought bo ON bo.stage = s.stage) x)
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_report_extras(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_report_extras(date, date) TO service_role;
