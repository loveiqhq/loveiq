-- AP-Analytics reads the new tracking (14 Oct 2026): per-chapter report reading, the intro
-- cards' Back and Skip, tablets, Meta Ads and organic search as sources, per-email opens and
-- clicks, and the PostHog visit a survey was finished in (the new/returning filter). The four
-- readers are replaced whole (bodies otherwise as in 20261013120000, 20261013120200 and
-- 20261013120300); the tables and columns they read come first, in
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
  -- A session the steps flag as a tablet (is_tablet, 20261014120100) is a Tablet: only these
  -- readers say so; device_type stays the price quote's class everywhere else.
  ev AS (
    SELECT e.session_id, min(e.created_at) AS first_at,
           (bool_or(e.answered IS TRUE) OR bool_or(e.direction = 'complete')) AS answered,
           CASE WHEN bool_or(e.is_tablet) THEN 'Tablet'
                ELSE (array_agg(e.device_type ORDER BY e.created_at DESC, e.id DESC)
                        FILTER (WHERE e.device_type IS NOT NULL))[1] END AS device,
           -- A step on the email question (00000): the run reached it (the email test, #7).
           bool_or(e.q_id = '00000') AS email_step
      FROM survey_behavior_event e
     WHERE e.session_id IN (SELECT session_id FROM cand)
     GROUP BY e.session_id
  ),
  dr AS (
    SELECT d.session_id, min(d.started_at) AS started_at, max(d.current_index) AS idx,
           (array_agg(d.utm_tracker ORDER BY d.saved_at DESC NULLS LAST)
              FILTER (WHERE d.utm_tracker IS NOT NULL))[1] AS tracker,
           -- A draft holding an email answer reached the email question too.
           bool_or(jsonb_typeof(d.answers) = 'object' AND d.answers ? '00000') AS email_draft
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
           ev.device,
           (COALESCE(ev.email_step, false) OR COALESCE(dr.email_draft, false)
              OR COALESCE(sb.status = 'completed', false)) AS email_reached
      FROM cand c
      LEFT JOIN ev ON ev.session_id = c.session_id
      LEFT JOIN dr ON dr.session_id = c.session_id
      LEFT JOIN sb ON sb.session_id = c.session_id
     WHERE (COALESCE(ev.answered, false) OR COALESCE(dr.idx, 0) >= 1 OR sb.status = 'completed')
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = sb.user_id)
  ),
  start_rows AS (
    SELECT st.day, st.finished, st.known, st.device, st.email_reached, t.j
      FROM starts st, b,
           LATERAL (SELECT CASE WHEN st.tracker IS NOT NULL AND pg_input_is_valid(st.tracker, 'jsonb')
                                 AND jsonb_typeof(st.tracker::jsonb) = 'object'
                            THEN st.tracker::jsonb END AS j) t
     WHERE st.started_at >= b.since_ts AND st.started_at < b.until_ts
  ),
  subs AS (
    SELECT s.id, s.user_id, s.created_date_time, s.start_date_time, s.duration_ms, s.posthog_session_id AS ph,
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
           -- One of 4 hours or more has no plausible end and counts nothing, as the core KPIs
           -- read it (counting its 30 minutes lifted the average from 7:22 to 9:01, 14 Oct).
           coalesce(sum(least(extract(epoch FROM s.ended_at - s.started_at), 1800) * 1000)
                      FILTER (WHERE s.ended_at > s.started_at AND s.ended_at - s.started_at < interval '4 hours'), 0)::bigint AS read_ms,
           count(*) FILTER (WHERE s.ended_at > s.started_at AND s.ended_at - s.started_at < interval '4 hours') AS closed,
           -- Each session as [start (epoch s), its counted ms, end recorded 1/0, began a visit 1/0],
           -- so an earlier period can be read as it stood at the same age (ageMatched).
           json_agg(json_build_array(
             floor(extract(epoch FROM s.started_at))::bigint,
             CASE WHEN s.ended_at > s.started_at AND s.ended_at - s.started_at < interval '4 hours'
                  THEN (least(extract(epoch FROM s.ended_at - s.started_at), 1800) * 1000)::bigint
                  ELSE 0 END,
             CASE WHEN s.ended_at > s.started_at AND s.ended_at - s.started_at < interval '4 hours'
                  THEN 1 ELSE 0 END,
             CASE WHEN s.new_visit THEN 1 ELSE 0 END
           ) ORDER BY s.started_at) AS sessions
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
    -- A tablet if any step said so, as the starts, payments and quotes read it.
    SELECT DISTINCT ON (s.id) s.id AS sid, e.device_type AS device,
           EXISTS (SELECT 1 FROM survey_behavior_event t WHERE t.session_id = s.session_id AND t.is_tablet) AS tablet
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
           (array_agg(p.metadata->>'plan' ORDER BY p.created_date_time) FILTER (WHERE p.amount > 0))[1] AS plan,
           -- A full unlock: Full, Full All or Core (the top three in full), first or as an upgrade
           -- from Essentials (the plan above is the first).
           coalesce(bool_or(p.metadata->>'plan' IN ('full_report', 'all_reports', 'core')) FILTER (WHERE p.amount > 0), false) AS full_paid,
           -- The full unlocks among them, for an average full-unlock price per segment.
           count(*) FILTER (WHERE p.amount > 0 AND p.metadata->>'plan' IN ('full_report', 'all_reports', 'core')) AS full_sales,
           coalesce(sum(p.amount) FILTER (WHERE p.amount > 0 AND p.metadata->>'plan' IN ('full_report', 'all_reports', 'core')), 0) AS full_revenue,
           -- Each sale as [time (epoch s), amount, plan], so an earlier period can be read as it
           -- stood at the same age, a later upgrade left out (ageMatched).
           json_agg(json_build_array(floor(extract(epoch FROM p.created_date_time))::bigint, p.amount, p.metadata->>'plan')
                    ORDER BY p.created_date_time, p.id) FILTER (WHERE p.amount > 0) AS pays
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
           max(CASE WHEN (a.metadata->>'to_slide') ~ '^[0-5]$' THEN (a.metadata->>'to_slide')::int END)
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
  -- The report's archetype, as the pricing readers take it (20260727002336).
  arch AS (
    SELECT DISTINCT ON (sr.survey_submission_id) sr.survey_submission_id AS sid,
           coalesce(sr.v5_primary_archetype, sr.primary_archetype) AS archetype
      FROM scoring_result sr
     WHERE sr.survey_submission_id IN (SELECT id FROM subs)
     ORDER BY sr.survey_submission_id, sr.id DESC
  ),
  -- Each finisher's history, all time: their first finished survey and how many they finished,
  -- and every sale on any of their reports (amount over 0, not a test; a full refund moves a
  -- payment to 'refunded', which is kept here only to count it). For new users, assessments per
  -- user, lifetime value and the cohorts. Staff never reach subs, so never these.
  people AS (
    SELECT s.user_id AS uid, min(s.created_date_time) AS first_at, count(*) AS subs_n
      FROM survey_submission s
     WHERE s.status = 'completed' AND s.user_id IN (SELECT user_id FROM subs)
     GROUP BY 1
  ),
  people_pays AS (
    SELECT s.user_id AS uid,
           json_agg(json_build_object(
             'at', p.created_date_time, 'amount', p.amount, 'plan', p.metadata->>'plan',
             'refunded', (p.status = 'refunded' OR coalesce(p.refund_amount, 0) > 0))
             ORDER BY p.created_date_time, p.id) AS pays
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
      JOIN survey_submission s ON s.id = pr.survey_submission_id
     WHERE p.status IN ('succeeded', 'refunded') AND coalesce(p.is_test, false) = false AND p.amount > 0
       AND s.user_id IN (SELECT user_id FROM subs)
     GROUP BY 1
  ),
  sub_rows AS (
    SELECT s.id, s.created_date_time, s.start_date_time, s.duration_ms, s.j, s.ph,
           (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day,
           -- Opened: the report's first session or, where none was recorded (before 18 Sep 2026
           -- only with cookie consent), the first sign it was open: the paywall seen, a paywall
           -- click, a checkout or a payment. Never later than those, so no step after "opened"
           -- outnumbers it. A price quote is no such sign: one is made at submission.
           coalesce(r.opened_at, least(q.paywall_at, c.at, q.checkout_at, p.paid_at)) AS opened_at,
           r.visits, r.returned_at, r.read_ms, r.closed, r.sessions,
           q.paywall_at, c.at AS clicked_at, q.checkout_at,
           CASE WHEN sd.tablet THEN 'Tablet' ELSE coalesce(q.device, sd.device) END AS device, q.tier, q.price_arm,
           p.paid_at, p.sales, p.revenue, p.gifted, p.plan, p.full_paid, p.full_sales, p.full_revenue, p.pays,
           (sh.sid IS NOT NULL) AS shared, sh.at AS shared_at, coalesce(v.n, 0) AS votes, v.at AS voted_at,
           (iv.sid IS NOT NULL) AS invited, iv.at AS invited_at,
           w.slide AS wizard_slide,
           who.country, who.gender, who.relationship, age.age,
           s.user_id AS uid, pe.first_at AS user_first_at, pe.subs_n AS user_subs, pp.pays AS user_pays,
           ar.archetype
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
      LEFT JOIN people pe ON pe.uid = s.user_id
      LEFT JOIN people_pays pp ON pp.uid = s.user_id
      LEFT JOIN arch ar ON ar.sid = s.id
  ),
  money AS (
    SELECT (p.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day, p.amount, s.id AS sid,
           p.metadata->>'plan' AS plan, s.posthog_session_id AS ph, s.user_id AS uid,
           -- The price arm the checkout was made under (stamped on the payment; a quote's own arm
           -- can be re-synced later, a payment's never is).
           p.metadata->>'experimentGroup' AS price_arm,
           -- How they paid: Stripe Link or the card's brand, as Stripe reported it.
           CASE WHEN p.payment_method_type = 'card' THEN coalesce(p.card_brand, 'card')
                ELSE p.payment_method_type END AS method,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j,
           CASE WHEN EXISTS (SELECT 1 FROM survey_behavior_event e WHERE e.session_id = s.session_id AND e.is_tablet) THEN 'Tablet'
                ELSE (SELECT q2.device_type FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.device_type IS NOT NULL ORDER BY q2.created_date_time DESC LIMIT 1) END AS device,
           (SELECT q2.country_tier FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.country_tier IS NOT NULL ORDER BY q2.created_date_time DESC LIMIT 1) AS tier
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
      JOIN survey_submission s ON s.id = pr.survey_submission_id, b
     WHERE p.status = 'succeeded' AND coalesce(p.is_test, false) = false
       AND p.created_date_time >= b.since_ts AND p.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  -- Every paid checkout opened in the range (a Stripe Checkout session, written when it was paid,
  -- failed or expired): a) reached the payment page; b) attempted, i.e. paid, or a payment method
  -- or a failure is recorded; c) paid. Free (EUR 0) unlocks are left out. Opened = created.
  checkouts AS (
    SELECT (p.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day, p.status,
           (p.status = 'succeeded' OR p.payment_method_type IS NOT NULL OR p.failure_code IS NOT NULL) AS attempted,
           p.metadata->>'plan' AS plan, p.metadata->>'experimentGroup' AS price_arm,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j,
           CASE WHEN EXISTS (SELECT 1 FROM survey_behavior_event e WHERE e.session_id = s.session_id AND e.is_tablet) THEN 'Tablet'
                ELSE (SELECT q2.device_type FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.device_type IS NOT NULL ORDER BY q2.created_date_time DESC LIMIT 1) END AS device,
           (SELECT q2.country_tier FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.country_tier IS NOT NULL ORDER BY q2.created_date_time DESC LIMIT 1) AS tier
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
      JOIN survey_submission s ON s.id = pr.survey_submission_id, b
     WHERE coalesce(p.is_test, false) = false AND p.amount > 0
       AND p.created_date_time >= b.since_ts AND p.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  quotes AS (
    SELECT q.id, q.survey_submission_id AS sid, q.plan, q.experiment_group AS price_arm,
           coalesce(q.initial_price, q.current_price) AS price, q.checkout_started_at, q.paywall_reached_at,
           CASE WHEN EXISTS (SELECT 1 FROM survey_behavior_event e WHERE e.session_id = s.session_id AND e.is_tablet) THEN 'Tablet'
                ELSE q.device_type END AS device,
           q.country_tier AS tier,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j
      FROM report_price_quote q
      JOIN survey_submission s ON s.id = q.survey_submission_id, b
     WHERE q.created_date_time >= b.since_ts AND q.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  -- The cards before question 1, in order; the intro's and the consent's, and the Back and
  -- Skip steps, exist from 20261014120200. Per visitor and day, the furthest card reached is
  -- where they left, unless it is question 1.
  intro_cards (step, card) AS (
    VALUES ('intro_view', 1), ('intro_slide_1', 2), ('intro_slide_2', 3), ('intro_slide_3', 4),
           ('intro_slide_4', 5), ('consent_view', 6), ('survey_engine_mount', 7)
  ),
  intro_last AS (
    SELECT f.visitor_id, f.day, max(c.card) AS card
      FROM funnel_event f
      JOIN intro_cards c ON c.step = f.event_type
     WHERE f.day >= p_from AND f.day <= p_to
     GROUP BY 1, 2
  ),
  -- Per step and day: visitors, each one's time to the next card, those who went on to it (any
  -- time that day), those who skipped from slides 1 to 3 straight to question 1, and those who
  -- left there. Back and Skip are steps of their own, counted in n. The primary key
  -- (visitor_id, day, event_type) keeps every join to one row at most, so count(*) is still one
  -- per visitor.
  intro AS (
    SELECT f.day, f.event_type AS step, count(*) AS n,
           coalesce(array_agg(round(extract(epoch FROM coalesce(nx.first_seen, q4.first_seen) - f.first_seen) * 1000)::bigint)
                      FILTER (WHERE coalesce(nx.first_seen, q4.first_seen) > f.first_seen AND s4.visitor_id IS NULL), '{}') AS ms,
           count(*) FILTER (WHERE nx.visitor_id IS NULL AND q1.visitor_id IS NOT NULL) AS skipped,
           -- Skip Intro on slide 4 also lands on the consent: that is a skip, not going on.
           count(coalesce(nx.visitor_id, q4.visitor_id)) FILTER (WHERE s4.visitor_id IS NULL) AS went_on,
           count(*) FILTER (WHERE l.card = c.card) AS exited,
           -- Consent viewers who saw no intro that day: the landing card's starters come straight
           -- to the consent, so the consent's reach is read over those who came through the intro.
           count(*) FILTER (WHERE f.event_type = 'consent_view' AND iv.visitor_id IS NULL) AS direct
      FROM funnel_event f
      LEFT JOIN intro_cards c ON c.step = f.event_type
      LEFT JOIN funnel_event nx
        ON nx.visitor_id = f.visitor_id AND nx.day = f.day
       AND nx.event_type = CASE f.event_type
                             WHEN 'intro_view' THEN 'intro_slide_1'
                             WHEN 'intro_slide_1' THEN 'intro_slide_2'
                             WHEN 'intro_slide_2' THEN 'intro_slide_3'
                             WHEN 'intro_slide_3' THEN 'intro_slide_4'
                             WHEN 'intro_slide_4' THEN 'consent_view'
                             WHEN 'consent_view' THEN 'survey_engine_mount'
                           END
      -- Slide 4 went on to question 1 where the consent left no row (before it recorded one).
      LEFT JOIN funnel_event q4
        ON f.event_type = 'intro_slide_4' AND nx.visitor_id IS NULL
       AND q4.visitor_id = f.visitor_id AND q4.day = f.day AND q4.event_type = 'survey_engine_mount'
      LEFT JOIN funnel_event q1
        ON q1.visitor_id = f.visitor_id AND q1.day = f.day
       AND q1.event_type = 'survey_engine_mount' AND q1.first_seen > f.first_seen
       AND f.event_type IN ('intro_slide_1', 'intro_slide_2', 'intro_slide_3')
      LEFT JOIN intro_last l ON l.visitor_id = f.visitor_id AND l.day = f.day
      LEFT JOIN funnel_event s4
        ON f.event_type = 'intro_slide_4' AND s4.visitor_id = f.visitor_id AND s4.day = f.day
       AND s4.event_type = 'intro_skip_4'
      LEFT JOIN funnel_event iv
        ON f.event_type = 'consent_view' AND iv.visitor_id = f.visitor_id AND iv.day = f.day
       AND iv.event_type = 'intro_view'
     WHERE f.event_type IN ('survey_engine_mount', 'intro_view', 'intro_slide_1', 'intro_slide_2',
                            'intro_slide_3', 'intro_slide_4', 'consent_view',
                            'intro_back_1', 'intro_back_2', 'intro_back_3', 'intro_back_4',
                            'intro_skip_1', 'intro_skip_2', 'intro_skip_3', 'intro_skip_4', 'consent_back')
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
               'ref', g.ref, 'fb', g.fb,
               'device', g.device, 'finished', g.finished,
               'camp', g.camp, 'term', g.term, 'cq', g.cq, 'email', g.email_reached, 'n', g.n)), '[]'::json)
        FROM (
          SELECT sr.day, sr.known, sr.j->>'utm_source' AS src, sr.j->>'utm_medium' AS med,
                 (coalesce(sr.j->>'gclid', '') <> '' OR coalesce(sr.j->>'gbraid', '') <> '' OR coalesce(sr.j->>'wbraid', '') <> '') AS ads,
                 sr.j->>'referrer_host' AS ref, coalesce(sr.j->>'fbclid', '') <> '' AS fb,
                 sr.j->>'landing_variant' AS arm, sr.device, sr.finished,
                 -- The ad's campaign and keyword as the links tag them, and the email test's arm.
                 sr.j->>'utm_campaign' AS camp, sr.j->>'utm_term' AS term,
                 sr.j->>'contact_question_arm' AS cq, sr.email_reached, count(*) AS n
            FROM start_rows sr
           GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14
        ) g
    ),
    'subs', (
      -- Two objects joined: one call takes at most 100 arguments, and a finisher has more.
      SELECT coalesce(json_agg((jsonb_build_object(
               'id', x.id, 'day', x.day, 'at', x.created_date_time, 'startAt', x.start_date_time,
               'durationMs', x.duration_ms,
               'src', x.j->>'utm_source', 'med', x.j->>'utm_medium',
               'ref', x.j->>'referrer_host', 'fb', coalesce(x.j->>'fbclid', '') <> '',
               'ads', (coalesce(x.j->>'gclid', '') <> '' OR coalesce(x.j->>'gbraid', '') <> '' OR coalesce(x.j->>'wbraid', '') <> ''),
               'arm', x.j->>'landing_variant',
               'device', x.device, 'tier', x.tier, 'priceArm', x.price_arm,
               'country', x.country, 'gender', x.gender, 'relationship', x.relationship, 'age', x.age,
               'openedAt', x.opened_at, 'visits', coalesce(x.visits, 0), 'returnedAt', x.returned_at,
               'readMs', coalesce(x.read_ms, 0), 'closed', coalesce(x.closed, 0),
               'sessions', coalesce(x.sessions, '[]'::json)
             ) || jsonb_build_object(
               'paywallAt', x.paywall_at, 'clickedAt', x.clicked_at, 'checkoutAt', x.checkout_at,
               'paidAt', x.paid_at, 'sales', coalesce(x.sales, 0), 'revenue', coalesce(x.revenue, 0),
               'gifted', coalesce(x.gifted, false), 'plan', x.plan, 'full', coalesce(x.full_paid, false),
               'fullSales', coalesce(x.full_sales, 0), 'fullRevenue', coalesce(x.full_revenue, 0),
               'pays', coalesce(x.pays, '[]'::json),
               'shared', x.shared, 'sharedAt', x.shared_at, 'votes', x.votes, 'votedAt', x.voted_at,
               'invited', x.invited, 'invitedAt', x.invited_at, 'wizardSlide', x.wizard_slide,
               -- The visit the survey was finished in, for the new/returning filter (PostHog).
               'ph', x.ph,
               'camp', x.j->>'utm_campaign', 'term', x.j->>'utm_term', 'net', x.j->>'network',
               'cq', x.j->>'contact_question_arm', 'archetype', x.archetype,
               -- The person (an internal id, never shown) and their history, all time.
               'uid', x.uid, 'userFirstAt', x.user_first_at, 'userSubs', coalesce(x.user_subs, 0),
               'userPays', coalesce(x.user_pays, '[]'::json)
             )) ORDER BY x.created_date_time), '[]'::json)
        FROM sub_rows x
    ),
    'money', (
      SELECT coalesce(json_agg(json_build_object(
               'day', m.day, 'sid', m.sid, 'amount', m.amount, 'plan', m.plan,
               'src', m.j->>'utm_source', 'med', m.j->>'utm_medium',
               'ref', m.j->>'referrer_host', 'fb', coalesce(m.j->>'fbclid', '') <> '',
               'ads', (coalesce(m.j->>'gclid', '') <> '' OR coalesce(m.j->>'gbraid', '') <> '' OR coalesce(m.j->>'wbraid', '') <> ''),
               'arm', m.j->>'landing_variant', 'device', m.device, 'tier', m.tier, 'ph', m.ph,
               'uid', m.uid, 'method', m.method, 'priceArm', m.price_arm,
               'camp', m.j->>'utm_campaign', 'term', m.j->>'utm_term', 'net', m.j->>'network')), '[]'::json)
        FROM money m
    ),
    'checkouts', (
      SELECT coalesce(json_agg(json_build_object(
               'day', g.day, 'status', g.status, 'attempted', g.attempted, 'plan', g.plan, 'priceArm', g.price_arm,
               'src', g.src, 'med', g.med, 'ads', g.ads, 'ref', g.ref, 'fb', g.fb, 'arm', g.arm,
               'device', g.device, 'tier', g.tier, 'n', g.n)), '[]'::json)
        FROM (
          SELECT c.day, c.status, c.attempted, c.plan, c.price_arm, c.j->>'utm_source' AS src, c.j->>'utm_medium' AS med,
                 (coalesce(c.j->>'gclid', '') <> '' OR coalesce(c.j->>'gbraid', '') <> '' OR coalesce(c.j->>'wbraid', '') <> '') AS ads,
                 c.j->>'referrer_host' AS ref, coalesce(c.j->>'fbclid', '') <> '' AS fb,
                 c.j->>'landing_variant' AS arm, c.device, c.tier, count(*) AS n
            FROM checkouts c
           GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
        ) g
    ),
    'intro', (SELECT coalesce(json_agg(json_build_object('day', x.day, 'step', x.step, 'n', x.n, 'ms', x.ms, 'skipped', x.skipped,
                                                         'wentOn', x.went_on, 'left', x.exited, 'direct', x.direct)), '[]'::json) FROM intro x),
    'invites', (SELECT coalesce(json_agg(json_build_object('day', x.day, 'n', x.n)), '[]'::json) FROM invites x),
    'quotes', (
      SELECT coalesce(json_agg(json_build_object(
               'plan', g.plan, 'priceArm', g.price_arm, 'price', g.price, 'src', g.src, 'med', g.med, 'ads', g.ads,
               'ref', g.ref, 'fb', g.fb,
               'device', g.device, 'tier', g.tier, 'quoted', g.quoted, 'paywall', g.paywall, 'checkouts', g.checkouts,
               'sales', g.sales, 'revenue', g.revenue)), '[]'::json)
        FROM (
          SELECT qu.plan, qu.price_arm, qu.price, qu.j->>'utm_source' AS src, qu.j->>'utm_medium' AS med,
                 (coalesce(qu.j->>'gclid', '') <> '' OR coalesce(qu.j->>'gbraid', '') <> '' OR coalesce(qu.j->>'wbraid', '') <> '') AS ads,
                 qu.j->>'referrer_host' AS ref, coalesce(qu.j->>'fbclid', '') <> '' AS fb,
                 qu.device, qu.tier,
                 count(DISTINCT qu.sid) AS quoted,
                 -- Saw the paywall (report_price_quote.paywall_reached_at), people as quoted is.
                 count(DISTINCT qu.sid) FILTER (WHERE qu.paywall_reached_at IS NOT NULL) AS paywall,
                 count(DISTINCT qu.sid) FILTER (WHERE qu.checkout_started_at IS NOT NULL) AS checkouts,
                 -- People, as quoted and checkouts are: one person paying twice is one sale here,
                 -- so the payment CVR (sales ÷ quoted) stays a share of people.
                 count(DISTINCT qu.sid) FILTER (WHERE qs.sales > 0) AS sales,
                 coalesce(sum(qs.revenue), 0) AS revenue
            FROM quotes qu
            LEFT JOIN quote_sales qs ON qs.id = qu.id
           GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
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
    'exits', (SELECT coalesce(json_agg(json_build_object('q_id', x.q_id, 'day', x.day, 'n', x.n)), '[]'::json) FROM exits x),
    -- Our own finished test runs, for the question table to leave out (get_survey_dropoff_runs
    -- keeps everyone, as the weekly drop-off report counts them).
    'staff', (SELECT coalesce(json_agg(DISTINCT x.session_id), '[]'::json) FROM staff_sessions x)
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
           CASE WHEN (a.metadata->>'from_slide') ~ '^[0-5]$' THEN (a.metadata->>'from_slide')::int END AS from_slide,
           CASE WHEN (a.metadata->>'to_slide') ~ '^[0-5]$' THEN (a.metadata->>'to_slide')::int END AS to_slide,
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
  -- Reading per Report 3.0 chapter (report_chapter_stats): one row per save, holding only
  -- what changed since the save before, so a reader's rows add up. Readers who finished from
  -- the first day it was recorded only: an earlier reader's later visits would be part of their
  -- reading. Every value is checked before a cast: anyone with a CSRF cookie can post this
  -- metadata, and one bad cast would fail the whole page.
  chapter_start AS (
    SELECT (min(a.event_time) AT TIME ZONE 'Europe/Berlin')::date AS day
      FROM analytics_event a
     WHERE a.event_type = 'report_chapter_stats'
  ),
  chapter_reads AS (
    SELECT a.survey_submission_id AS sid, c.key AS section,
           -- Up to 30 minutes per reader and chapter: longer is mostly a tab left open.
           least(coalesce(sum(CASE WHEN c.value->>'ms' ~ '^[0-9]{1,8}$' THEN (c.value->>'ms')::int END), 0), 1800000) AS ms,
           coalesce(bool_or(c.value->>'open' ~ '^[1-9][0-9]{0,5}$'), false) AS opened,
           coalesce(bool_or(c.value->>'show_all' ~ '^[1-9][0-9]{0,5}$'), false) AS show_all,
           coalesce(bool_or(c.value->>'learn_more' ~ '^[1-9][0-9]{0,5}$'), false) AS learn_more,
           coalesce(bool_or(c.value->>'try_this' ~ '^[1-9][0-9]{0,5}$'), false) AS try_this,
           coalesce(bool_or(c.value->>'pw_seen' ~ '^[1-9][0-9]{0,5}$'), false) AS pw_seen,
           coalesce(bool_or(c.value->>'pw_click' ~ '^[1-9][0-9]{0,5}$'), false) AS pw_click
      FROM analytics_event a
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(a.metadata->'chapters') = 'object'
                                         THEN a.metadata->'chapters' ELSE '{}'::jsonb END) AS c
     WHERE a.event_type = 'report_chapter_stats'
       AND a.survey_submission_id IN (
             SELECT s.id FROM subs s, chapter_start cs
              WHERE s.created_date_time >= (cs.day::timestamp AT TIME ZONE 'Europe/Berlin'))
       AND jsonb_typeof(c.value) = 'object'
       AND c.key ~ '^[a-z][a-z0-9_]{0,79}$'
     GROUP BY 1, 2
  ),
  -- Reached: a second or more with the chapter on screen, or anything used in it.
  chapter_reached AS (
    SELECT r.* FROM chapter_reads r
     WHERE r.ms >= 1000 OR r.opened OR r.show_all OR r.learn_more OR r.try_this OR r.pw_seen OR r.pw_click
  ),
  chapter_stats AS (
    SELECT r.section, count(*) AS reached, round(avg(r.ms)) AS ms_avg,
           count(*) FILTER (WHERE r.opened) AS opened,
           count(*) FILTER (WHERE r.show_all) AS show_all,
           count(*) FILTER (WHERE r.learn_more) AS learn_more,
           count(*) FILTER (WHERE r.try_this) AS try_this,
           count(*) FILTER (WHERE r.pw_seen) AS pw_seen,
           -- Clicked a paywall they had seen: the click rate is within those who saw one.
           count(*) FILTER (WHERE r.pw_seen AND r.pw_click) AS pw_click
      FROM chapter_reached r
     GROUP BY r.section
  ),
  -- The wizard's Skip Intro (wizard_skipped): who pressed it, by the slide (0-5) it was on.
  skips AS (
    SELECT CASE WHEN (a.metadata->>'from_slide') ~ '^[0-5]$' THEN (a.metadata->>'from_slide')::int END AS slide,
           a.survey_submission_id AS sid
      FROM analytics_event a
     WHERE a.event_type = 'wizard_skipped' AND a.survey_submission_id IN (SELECT id FROM subs)
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
  open_start AS (
    SELECT min(d.first_at) AS at
      FROM email_message_event d
     WHERE d.event_type = 'delivered'
       AND EXISTS (SELECT 1 FROM email_message_event o WHERE o.resend_id = d.resend_id AND o.event_type = 'opened')
  ),
  -- delivered, opened, clicked: the readers whose email had that event after it was sent, as the
  -- Resend webhook keeps it by the stage and submission the send tagged it with (from 14 Oct 2026).
  sent AS (
    SELECT se.stage, count(DISTINCT se.sid) AS n, count(DISTINCT a.survey_submission_id) AS returned,
           count(DISTINCT m.survey_submission_id) FILTER (WHERE m.event_type = 'delivered') AS delivered,
           -- Opens and clicks only of emails known delivered: a lost delivery row would otherwise
           -- count an open over a smaller delivered count (over 100%).
           count(DISTINCT m.survey_submission_id) FILTER (
             WHERE m.event_type = 'opened'
               AND EXISTS (SELECT 1 FROM email_message_event d WHERE d.resend_id = m.resend_id AND d.event_type = 'delivered')
           ) AS opened,
           count(DISTINCT m.survey_submission_id) FILTER (
             WHERE m.event_type = 'clicked'
               AND EXISTS (SELECT 1 FROM email_message_event d WHERE d.resend_id = m.resend_id AND d.event_type = 'delivered')
           ) AS clicked,
           -- Delivered once emails carried the open image: what an open rate can be out of. The
           -- image goes in at send time, so tracking began no later than the delivery of the first
           -- email that was ever opened.
           count(DISTINCT m.survey_submission_id) FILTER (
             WHERE m.event_type = 'delivered' AND m.first_at >= (SELECT os.at FROM open_start os)
           ) AS delivered_opens
      FROM sends se
      CROSS JOIN b
      LEFT JOIN analytics_event a
        ON a.survey_submission_id = se.sid AND a.event_type = 'paywall_initiated'
       AND a.metadata->>'source' = 'offer_link' AND a.event_time >= se.sent_at
       AND (se.next_at IS NULL OR a.event_time < se.next_at)
      LEFT JOIN email_message_event m
        ON m.survey_submission_id = se.sid AND m.stage = se.stage AND m.first_at >= se.sent_at
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
    'chapter_stats', (SELECT coalesce(json_agg(json_build_object(
                        'section', cs.section, 'reached', cs.reached, 'ms_avg', cs.ms_avg, 'opened', cs.opened,
                        'show_all', cs.show_all, 'learn_more', cs.learn_more, 'try_this', cs.try_this,
                        'pw_seen', cs.pw_seen, 'pw_click', cs.pw_click) ORDER BY cs.section), '[]'::json)
                        FROM chapter_stats cs),
    -- Reach's denominator: the readers above who reached any chapter.
    'chapter_readers', (SELECT count(DISTINCT r.sid) FROM chapter_reached r),
    -- Each of those readers' chapters reached: how far into the report they got (the page
    -- orders the chapters, as the report's nav does).
    'chapter_depth', (SELECT coalesce(json_agg(json_build_object('sid', d.sid, 'chapters', d.chapters)), '[]'::json)
                        FROM (SELECT r.sid, json_agg(r.section ORDER BY r.section) AS chapters
                                FROM chapter_reached r GROUP BY r.sid) d),
    'chapter_stats_from', (SELECT st.day FROM chapter_start st),
    'wizard_skips', (SELECT coalesce(json_agg(json_build_object('slide', k.slide, 'n', k.n, 'sids', k.sids) ORDER BY k.slide), '[]'::json)
                       FROM (SELECT x.slide, count(DISTINCT x.sid) AS n, array_agg(DISTINCT x.sid) AS sids
                               FROM skips x WHERE x.slide IS NOT NULL GROUP BY x.slide) k),
    'wizard_skips_from', (SELECT (min(a.event_time) AT TIME ZONE 'Europe/Berlin')::date
                            FROM analytics_event a WHERE a.event_type = 'wizard_skipped'),
    'issues', (SELECT coalesce(json_agg(json_build_object('issue', i.issue, 'n', i.n)), '[]'::json)
                 FROM (SELECT issue, count(*) AS n FROM votes WHERE feedback = 'down' AND issue IS NOT NULL GROUP BY issue) i),
    'feedback', (SELECT coalesce(json_agg(json_build_object(
                   'at', v.created_at, 'submission', v.sid, 'section', v.section_id, 'vote', v.feedback,
                   'issue', v.issue, 'commented', v.commented) ORDER BY v.created_at DESC), '[]'::json)
                   FROM (SELECT * FROM votes ORDER BY created_at DESC LIMIT 200) v),
    'votes_total', (SELECT count(*) FROM votes),
    'emails', (SELECT coalesce(json_agg(json_build_object('stage', x.stage, 'sent', x.sent, 'returned', x.returned,
                                                          'delivered', x.delivered, 'delivered_opens', x.delivered_opens,
                                                          'opened', x.opened, 'clicked', x.clicked,
                                                          'bought', x.bought, 'revenue', x.revenue)), '[]'::json)
                 FROM (SELECT coalesce(s.stage, bo.stage) AS stage, coalesce(s.n, 0) AS sent, coalesce(s.returned, 0) AS returned,
                              coalesce(s.delivered, 0) AS delivered, coalesce(s.delivered_opens, 0) AS delivered_opens,
                              coalesce(s.opened, 0) AS opened, coalesce(s.clicked, 0) AS clicked,
                              coalesce(bo.n, 0) AS bought, coalesce(bo.revenue, 0) AS revenue
                         FROM sent s FULL JOIN bought bo ON bo.stage = s.stage) x),
    -- The first Berlin day an email's own event was kept (deliveries and clicks count from it),
    -- and the first an open was: open tracking is switched on in Resend after the rest. Null
    -- until then.
    'email_events_from', (SELECT (min(m.first_at) AT TIME ZONE 'Europe/Berlin')::date FROM email_message_event m),
    'email_opens_from', (SELECT (os.at AT TIME ZONE 'Europe/Berlin')::date FROM open_start os)
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_report_extras(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_report_extras(date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.ap_question_answers(p_from date, p_to date, p_qid text, p_other text DEFAULT NULL)
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
  subs AS (
    SELECT s.id, s.user_id, s.utm_tracker, s.session_id, s.posthog_session_id
      FROM survey_submission s, b
     WHERE s.status = 'completed'
       AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = s.user_id AND u.email ~* '@loveiq\.org$')
  ),
  q AS (
    SELECT sq.id, sq.frontend_qid, sq.type
      FROM survey_question sq
     WHERE sq.frontend_qid IN (p_qid, p_other)
       AND (sq.type IN ('scale', 'single', 'multiple') OR sq.frontend_qid = '15001')
  ),
  answers AS (
    SELECT a.survey_submission_id AS sid, q.frontend_qid AS qid,
           CASE
             WHEN q.type = 'scale' THEN array[trim(to_char(a.normalized_value, 'FM999990'))]
             WHEN q.type = 'multiple' THEN (
               SELECT array_agg(ao.option_text ORDER BY ao.display_order, ao.id)
                 FROM survey_submission_answer_options o
                 JOIN answer_option ao ON ao.id = o.answer_option_id
                WHERE o.survey_submission_answer_id = a.id)
             WHEN a.answer_option_id IS NOT NULL THEN (SELECT array[ao.option_text] FROM answer_option ao WHERE ao.id = a.answer_option_id)
             WHEN q.frontend_qid = '15001' THEN array[a.answer_text]
           END AS vals
      FROM survey_submission_answer a
      JOIN q ON q.id = a.survey_question_id
     WHERE a.survey_submission_id IN (SELECT id FROM subs)
       AND coalesce(a.was_skipped, false) = false
  )
  SELECT json_build_object(
    'rows', (
      SELECT coalesce(json_agg(json_build_object(
               'answer', mine.vals,
               'other', other.vals,
               'src', t.j->>'utm_source', 'med', t.j->>'utm_medium',
               'ads', (coalesce(t.j->>'gclid', '') <> '' OR coalesce(t.j->>'gbraid', '') <> '' OR coalesce(t.j->>'wbraid', '') <> ''),
               -- As ap_facts: the site a visit came from and Meta's click id (from 15 Oct 2026).
               'ref', t.j->>'referrer_host', 'fb', coalesce(t.j->>'fbclid', '') <> '',
               'gender', up.gender, 'relationship', up.relationship_status,
               -- As ap_facts: a tablet the survey steps flagged, else the pricing quote's device,
               -- else the survey steps' (from 12 Oct 2026).
               'device', CASE WHEN EXISTS (SELECT 1 FROM survey_behavior_event e WHERE e.session_id = s.session_id AND e.is_tablet) THEN 'Tablet'
                 ELSE coalesce(
                   (SELECT q2.device_type FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.device_type IS NOT NULL ORDER BY q2.created_date_time DESC LIMIT 1),
                   (SELECT e.device_type FROM survey_behavior_event e WHERE e.session_id = s.session_id AND e.device_type IS NOT NULL ORDER BY e.created_at DESC LIMIT 1)) END,
               'tier', (SELECT q2.country_tier FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.country_tier IS NOT NULL ORDER BY q2.created_date_time DESC LIMIT 1),
               -- As ap_facts: the visit the survey was finished in, for the new/returning filter.
               'ph', s.posthog_session_id
             )), '[]'::json)
        FROM subs s
        JOIN answers mine ON mine.sid = s.id AND mine.qid = p_qid
        LEFT JOIN answers other ON other.sid = s.id AND other.qid = p_other
        LEFT JOIN app_user u ON u.id = s.user_id
        LEFT JOIN user_profile up ON up.id = u.user_profile_id,
        LATERAL (SELECT CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                              AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                         THEN s.utm_tracker::jsonb END AS j) t
       WHERE mine.vals IS NOT NULL
    ),
    'finished', (SELECT count(*) FROM subs)
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_question_answers(date, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_question_answers(date, date, text, text) TO service_role;
