-- ap_facts: what AP-Analytics (/admin/ap, the analytics admin Marcus designed on 12 Oct
-- 2026) counts, for one range of Berlin days, both ends included. The pages filter and
-- add up these facts in TypeScript (features/admin/server/ap/), so every page reads the
-- same people the same way.
--
-- Definitions, shared with the morning message and get_kpi_week where they overlap:
--   visits    funnel_event 'unique_visitor': one row per browser per Berlin day (the
--             visitor id is new every day), by landing arm and the visit's own
--             utm_source tag. That tag misses most ad clicks, so visits are never split
--             by source on the pages.
--   starts    survey sessions that answered at least one question, first seen in the
--             range, from any of three records: survey steps (never cleared; written
--             without consent since 18 Sep 2026), saved drafts (cleared after about 30
--             days) and finished surveys. Source and arm come from the draft's or the
--             submission's tracker; a session with neither (a draft cleared, never
--             finished) has no source. Device from the steps, recorded from 12 Oct 2026.
--   subs      finished surveys (survey_submission completed) in the range, one row each,
--             with what happened after: report opens and reading time (report_session;
--             reading time only for closed sessions under 4 hours, as the core KPIs),
--             the paywall (paywall_reached_at, or a click on a paywall button), checkout,
--             money (the payment ledger: succeeded, not a test; a sale takes money, a
--             gift is EUR 0), shares, chapter votes, invites and the pre-report wizard.
--             Device from the reader's price quote (made when the report is opened), else
--             from the survey steps (recorded from 12 Oct 2026); country tier from the quote.
--   money     payments made in the range (attributed to the payment day), sales and gifts.
--   quotes    prices quoted in the range by plan and list price, with the checkouts and
--             sales on those quotes.
--   intro     the survey's intro slides and the survey engine's start, per day. The browser
--             sends these only after the cookie banner is accepted, and files them under
--             the UTC day, so they are rates among those visitors, not counts of everyone.
--             With each step: per visitor who reached the next step that day, the ms
--             until they did (slide 4's next step is question 1, past the consent card);
--             and, on slides 1 to 3, the visitors who went on to question 1 without the
--             next slide (they skipped the rest).
--   invites   invitations sent to a friend, per day.
-- Staff (an owner email ending @loveiq.org) are left out wherever an owner is known.
--
-- One JSON value, service role only: trackers are read here.

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
           coalesce(sum(extract(epoch FROM s.ended_at - s.started_at) * 1000)
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
