/**
 * The Survey page's fields (Assessment A · Survey): its tiles, the question funnel, the question
 * detail, the core demographics and the intro wizard. Every query here was run read-only on
 * production for 21 Sep – 20 Oct 2026 and gave the page's own figures for "Last 30 days"
 * (the intro's skip, back and exit columns, recorded from 17 Oct 2026, for 17 – 20 Oct).
 */
import type { FieldDef, FieldRegistry, FieldTable } from "./types";

/** Shared by the queries below. */
const FUNNEL = `-- The question funnel, in one question order: per question, the survey runs (sessions) that
-- reached it, and those whose last step it was and who never finished (exits). 'control' is
-- the survey's own order (every run before the opening-order test, and the test's control
-- half); 'variant' is the test's order (C13). The range's Berlin days are written in.
WITH b AS (
  SELECT (:from::date::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
         ((:to::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
),
-- The two orders the questions are asked in (the survey code's; stored nowhere else).
orders (arm, qs) AS (VALUES
  ('control', ARRAY['00001','01002','01005','01006','02001','02002','02003','02004','03003','03004','03005','03006','03008','03009','03010','03011','03012','03013','08002','08003','08004','08005','08006','08012','09013','10002','10003','10004','10005','11001','11002','11003','11004','14020','14021','15001','15002','15003','15004','15005','15006','15007','15008','15009','15010','16001','16002','16005','16006','16007','16009','16011','16012','16013','16014','16019','16020','16016','16017','16018','00000','16015']),
  ('variant', ARRAY['00001','01002','03011','10005','11004','10004','02002','10003','02004','03003','03004','03005','03006','03008','03009','03010','03012','03013','08002','08003','08004','08005','08006','08012','09013','10002','01005','01006','02001','02003','11001','11002','11003','14020','14021','15001','15002','15003','15004','15005','15006','15007','15008','15009','15010','16001','16002','16005','16006','16007','16009','16011','16012','16013','16014','16019','16020','16016','16017','16018','00000','16015'])
),
-- The team's runs: its own finished surveys, and unfinished runs from the networks they came from.
staff_sessions AS (
  SELECT s.session_id FROM survey_submission s
   WHERE s.user_id IN (SELECT id FROM ap_team_user) AND s.session_id IS NOT NULL
),
staff_ips AS (
  SELECT client_ip FROM survey_behavior_event
   WHERE session_id IN (SELECT session_id FROM staff_sessions) AND client_ip IS NOT NULL
  UNION
  SELECT client_ip FROM survey_partial_save
   WHERE session_id IN (SELECT session_id FROM staff_sessions) AND client_ip IS NOT NULL
),
team AS (
  SELECT session_id FROM staff_sessions
  UNION
  SELECT e.session_id FROM survey_behavior_event e, b
   WHERE e.created_at >= b.since_ts AND e.created_at < b.until_ts
     AND e.client_ip IN (SELECT client_ip FROM staff_ips)
     AND NOT EXISTS (SELECT 1 FROM survey_submission s
                      WHERE s.session_id = e.session_id AND s.status = 'completed')
),
-- The questions each run had a step on in the range, with the place each had on its screen
-- (question_index: steps are saved in batches with one time) and when it was first reached.
reached AS (
  SELECT e.session_id, e.q_id, min(e.question_index) AS first_idx, min(e.created_at) AS first_at
    FROM survey_behavior_event e, b
   WHERE e.created_at >= b.since_ts AND e.created_at < b.until_ts
     AND e.question_index IS NOT NULL AND e.q_id IS NOT NULL AND e.session_id IS NOT NULL
     AND e.session_id NOT IN (SELECT session_id FROM team)
   GROUP BY 1, 2
),
-- Each run: when it began (its first step ever), its last step, and where it left: its last
-- step, when that was in the range and it never finished.
steps_of AS (
  SELECT e.session_id, min(e.created_at) AS started_at,
         (array_agg(e.q_id ORDER BY e.created_at DESC, e.id DESC)
            FILTER (WHERE e.created_at >= b.since_ts AND e.question_index IS NOT NULL))[1] AS last_q,
         max(e.created_at) FILTER (WHERE e.created_at >= b.since_ts AND e.question_index IS NOT NULL) AS last_at,
         coalesce(bool_or(e.direction = 'complete' AND e.created_at >= b.since_ts), false) AS finished
    FROM survey_behavior_event e, b
   WHERE e.session_id IN (SELECT session_id FROM reached)
   GROUP BY e.session_id
),
-- A run whose steps after its last forward (or complete) step went back was walking back out of
-- the questions (the browser's Back, pressed again and again or held, passes each in a fraction
-- of a second; a tab hidden on the way records an abandon): it left where that walk began, the
-- question it had got to.
walk AS (
  SELECT DISTINCT ON (e.session_id) e.session_id, e.q_id
    FROM survey_behavior_event e, b
   WHERE e.created_at >= b.since_ts AND e.direction = 'back' AND e.question_index IS NOT NULL
     AND e.session_id IN (SELECT session_id FROM reached)
     AND NOT EXISTS (SELECT 1 FROM survey_behavior_event o
                      WHERE o.session_id = e.session_id AND o.question_index IS NOT NULL
                        AND o.direction IN ('forward', 'complete')
                        AND (o.created_at, o.id) > (e.created_at, e.id))
   ORDER BY e.session_id, e.created_at, e.id
),
-- Begun in the range: not a draft resumed in it, nor a survey that ran past midnight into it
-- (an earlier period's start, as Survey starts dates it).
runs AS (
  SELECT s.session_id, s.started_at, s.last_at,
         CASE WHEN NOT s.finished AND s.last_at < b.until_ts THEN coalesce(w.q_id, s.last_q) END AS left_at
    FROM steps_of s LEFT JOIN walk w ON w.session_id = s.session_id CROSS JOIN b
   WHERE s.started_at >= b.since_ts
     AND NOT EXISTS (SELECT 1 FROM survey_partial_save d
                      WHERE d.session_id = s.session_id AND d.started_at < b.since_ts)
     AND NOT EXISTS (SELECT 1 FROM survey_submission x
                      WHERE x.session_id = s.session_id AND x.start_date_time < b.since_ts)
),
-- Which order each run was asked in. Runs begun before the test (6 Oct 2026, 18:40 UTC) were
-- asked the survey's. A later run: the order its first six questions (by their place on its
-- screen) follow with the fewest questions passed over; a tie (it left within the shared
-- opening) goes to the order its session was dealt (c13_arm).
firsts AS (
  SELECT f.session_id, (array_agg(f.q_id ORDER BY f.first_idx, f.first_at, f.q_id))[1:6] AS qs
    FROM reached f
   WHERE f.session_id IN (SELECT session_id FROM runs)
   GROUP BY 1
  HAVING min(f.first_at) >= TIMESTAMPTZ '2026-10-06 18:40:00+00'
),
fit AS (
  SELECT fr.session_id, o.arm,
         CASE WHEN bool_and(p.pos IS NOT NULL AND (p.prev IS NULL OR p.pos > p.prev))
              THEN max(p.pos) - count(*) END AS passed_over
    FROM firsts fr CROSS JOIN orders o
    CROSS JOIN LATERAL (
      SELECT array_position(o.qs, u.q) AS pos,
             lag(array_position(o.qs, u.q)) OVER (ORDER BY u.k) AS prev
        FROM unnest(fr.qs) WITH ORDINALITY AS u (q, k)) p
   GROUP BY 1, 2
),
arms AS (
  SELECT r.session_id, r.started_at, r.last_at, r.left_at,
         CASE WHEN fr.session_id IS NULL THEN 'control'
              WHEN v.passed_over IS NULL AND c.passed_over IS NOT NULL THEN 'control'
              WHEN c.passed_over IS NULL AND v.passed_over IS NOT NULL THEN 'variant'
              WHEN c.passed_over < v.passed_over THEN 'control'
              WHEN c.passed_over > v.passed_over THEN 'variant'
              ELSE c13_arm(r.session_id::text) END AS arm
    FROM runs r
    LEFT JOIN firsts fr ON fr.session_id = r.session_id
    LEFT JOIN fit c ON c.session_id = r.session_id AND c.arm = 'control'
    LEFT JOIN fit v ON v.session_id = r.session_id AND v.arm = 'variant'
),
-- Each run's questions in the order it was asked them, and where each sits in its order.
asked_in AS (
  SELECT x.session_id, a.arm, a.started_at, x.q_id, array_position(o.qs, x.q_id) AS pos,
         row_number() OVER (PARTITION BY x.session_id ORDER BY x.first_idx, x.first_at, x.q_id) AS k
    FROM reached x JOIN arms a ON a.session_id = x.session_id JOIN orders o ON o.arm = a.arm
),
-- How far each run got along its order: the furthest place of the questions it was asked, and
-- the first, where it began (a run recorded from part-way, as steps were before cookies were
-- accepted until 18 Sep 2026, still passed the questions before). The email question asked
-- first, by a run begun before 17 Aug 2026, is left out: placed on today's order it would
-- "reach" question 61; a run that answered only it is in no row. A later run first recorded on
-- it got there along the order.
span AS (
  SELECT i.session_id, i.arm, i.started_at, min(i.pos) AS lo, max(i.pos) AS hi
    FROM asked_in i
   WHERE i.pos IS NOT NULL
     AND (i.started_at >= TIMESTAMPTZ '2026-08-17 00:00:00+02'
          OR i.k >= (SELECT min(j.k) FROM asked_in j
                      WHERE j.session_id = i.session_id AND j.pos IS NOT NULL AND j.q_id <> '00000'))
   GROUP BY 1, 2, 3
),
-- When each question was first asked, by anyone but the team (who try a question before its
-- release): its first step or its first answer.
first_asked AS (
  SELECT x.q_id, min(x.at) AS at
    FROM (SELECT e.q_id, min(e.created_at) AS at FROM survey_behavior_event e
           WHERE e.q_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM staff_sessions t WHERE t.session_id = e.session_id)
             AND NOT (coalesce(e.client_ip IN (SELECT client_ip FROM staff_ips), false)
                      AND NOT EXISTS (SELECT 1 FROM survey_submission s
                                       WHERE s.session_id = e.session_id AND s.status = 'completed'))
           GROUP BY 1
          UNION ALL
          SELECT sq.frontend_qid, min(coalesce(a.answered_at, a.created_date_time))
            FROM survey_submission_answer a JOIN survey_question sq ON sq.id = a.survey_question_id
            JOIN survey_submission s ON s.id = a.survey_submission_id
           WHERE sq.frontend_qid IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM ap_team_user t WHERE t.id = s.user_id)
           GROUP BY 1) x
   GROUP BY 1
),
-- Reached: every question of its order up to the furthest a run got (a step lost while the tab
-- was in the background, an answer given on the landing page's card, a question added after it
-- began), so no question has more than the one before.
passed AS (
  SELECT s.session_id, s.arm, o.qs[i] AS q_id
    FROM span s JOIN orders o ON o.arm = s.arm
   CROSS JOIN generate_series(1, s.hi) AS i
),
-- Shown: what each run was put, from where it began to its furthest, but not a question first
-- asked after the run began. The drop-out rate and Skipped are shares of these.
shown AS (
  SELECT s.session_id, s.arm, o.qs[i] AS q_id
    FROM span s JOIN orders o ON o.arm = s.arm
   CROSS JOIN generate_series(s.lo, s.hi) AS i
    LEFT JOIN first_asked f ON f.q_id = o.qs[i]
   WHERE f.at IS NULL OR f.at <= s.started_at
      OR EXISTS (SELECT 1 FROM reached x WHERE x.session_id = s.session_id AND x.q_id = o.qs[i])
),
-- Exits: a run left at its last question when that is on its way along its order, or is a
-- question no longer asked (its own row), unless it is still on it (a step in the last half
-- hour).
exit_runs AS (
  SELECT a.session_id, a.arm, a.left_at AS q_id, a.last_at
    FROM arms a JOIN orders o ON o.arm = a.arm LEFT JOIN span s ON s.session_id = a.session_id
   WHERE a.left_at IS NOT NULL AND a.last_at < now() - interval '30 minutes'
     AND (array_position(o.qs, a.left_at) BETWEEN s.lo AND s.hi OR NOT a.left_at = ANY (o.qs))
),
funnel AS (
  SELECT o.arm, u.k AS n, u.q AS q_id,
         coalesce(r.reached, 0) AS reached, coalesce(w.shown, 0) AS shown,
         coalesce(x.exits, 0) AS exits,
         coalesce((fa.at AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to, false) AS added
    FROM orders o CROSS JOIN unnest(o.qs) WITH ORDINALITY AS u (q, k)
    LEFT JOIN first_asked fa ON fa.q_id = u.q
    LEFT JOIN (SELECT arm, q_id, count(*) AS reached FROM passed GROUP BY 1, 2) r
           ON r.arm = o.arm AND r.q_id = u.q
    LEFT JOIN (SELECT arm, q_id, count(*) AS shown FROM shown GROUP BY 1, 2) w
           ON w.arm = o.arm AND w.q_id = u.q
    LEFT JOIN (SELECT arm, q_id, count(*) AS exits FROM exit_runs GROUP BY 1, 2) x
           ON x.arm = o.arm AND x.q_id = u.q
   -- A question first asked after the range wasn't asked in it.
   WHERE fa.at IS NULL OR (fa.at AT TIME ZONE 'Europe/Berlin')::date <= :to
),
-- Each question against the first and the one before it, in its order.
steps AS (
  SELECT f.*,
         first_value(f.reached) OVER w AS first_step,
         lag(f.reached) OVER w AS before
    FROM funnel f
  WINDOW w AS (PARTITION BY f.arm ORDER BY f.n)
)
`;

/** Shared by the queries below. */
const TEAM = `WITH b AS (
  SELECT (:from::date::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
         ((:to::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
),
-- The team's runs: its own finished surveys, and unfinished runs from the networks they came from.
staff_sessions AS (
  SELECT s.session_id FROM survey_submission s
   WHERE s.user_id IN (SELECT id FROM ap_team_user) AND s.session_id IS NOT NULL
),
staff_ips AS (
  SELECT client_ip FROM survey_behavior_event
   WHERE session_id IN (SELECT session_id FROM staff_sessions) AND client_ip IS NOT NULL
  UNION
  SELECT client_ip FROM survey_partial_save
   WHERE session_id IN (SELECT session_id FROM staff_sessions) AND client_ip IS NOT NULL
),
team AS (
  SELECT session_id FROM staff_sessions
  UNION
  SELECT e.session_id FROM survey_behavior_event e, b
   WHERE e.created_at >= b.since_ts AND e.created_at < b.until_ts
     AND e.client_ip IN (SELECT client_ip FROM staff_ips)
     AND NOT EXISTS (SELECT 1 FROM survey_submission s
                      WHERE s.session_id = e.session_id AND s.status = 'completed')
)
`;

/** Shared by the queries below. */
const STARTS_CTES = `-- Survey starts and submissions for the range, and Completion (submissions ÷ starts). A start:
-- a survey session whose first activity (a step, a draft or a submission) falls in the range
-- and that answered at least the first question. The team's runs and our test probes are out.
WITH b AS (
  SELECT (:from::date::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
         ((:to::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
),
staff AS (SELECT id FROM ap_team_user),
-- The networks the team's own surveys came from: an unfinished run from one is the team testing.
staff_ips AS (
  SELECT e.client_ip FROM survey_behavior_event e
    JOIN survey_submission s ON s.session_id = e.session_id
   WHERE s.user_id IN (SELECT id FROM staff) AND e.client_ip IS NOT NULL
  UNION
  SELECT d.client_ip FROM survey_partial_save d
    JOIN survey_submission s ON s.session_id = d.session_id
   WHERE s.user_id IN (SELECT id FROM staff) AND d.client_ip IS NOT NULL
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
steps AS (
  SELECT e.session_id, min(e.created_at) AS first_at,
         bool_or(e.answered IS TRUE OR e.direction = 'complete') AS answered,
         bool_or(e.client_ip IN (SELECT client_ip FROM staff_ips)) AS staff_ip
    FROM survey_behavior_event e
   WHERE e.session_id IN (SELECT session_id FROM cand)
   GROUP BY 1
),
drafts AS (
  SELECT d.session_id, min(d.started_at) AS started_at, max(d.current_index) AS idx,
         (array_agg(d.utm_tracker ORDER BY d.saved_at DESC NULLS LAST)
            FILTER (WHERE d.utm_tracker IS NOT NULL))[1] AS tracker,
         bool_or(d.client_ip IN (SELECT client_ip FROM staff_ips)) AS staff_ip
    FROM survey_partial_save d
   WHERE d.session_id IN (SELECT session_id FROM cand)
   GROUP BY 1
),
subs_of AS (
  SELECT DISTINCT ON (s.session_id) s.session_id, s.user_id, s.status, s.start_date_time, s.utm_tracker
    FROM survey_submission s
   WHERE s.session_id IN (SELECT session_id FROM cand)
   ORDER BY s.session_id, (s.status = 'completed') DESC, s.id
),
starts AS (
  SELECT LEAST(st.first_at, d.started_at, s.start_date_time) AS started_at,
         (d.session_id IS NOT NULL OR s.session_id IS NOT NULL) AS known,
         CASE WHEN pg_input_is_valid(coalesce(s.utm_tracker, d.tracker), 'jsonb')
              THEN coalesce(s.utm_tracker, d.tracker)::jsonb END AS tag
    FROM cand c
    LEFT JOIN steps st ON st.session_id = c.session_id
    LEFT JOIN drafts d ON d.session_id = c.session_id
    LEFT JOIN subs_of s ON s.session_id = c.session_id
   WHERE (coalesce(st.answered, false) OR coalesce(d.idx, 0) >= 1 OR s.status = 'completed')
     AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
     AND (s.status = 'completed' OR NOT (coalesce(st.staff_ip, false) OR coalesce(d.staff_ip, false)))
),
subs AS (
  SELECT CASE WHEN pg_input_is_valid(s.utm_tracker, 'jsonb') THEN s.utm_tracker::jsonb END AS tag
    FROM survey_submission s, b
   WHERE s.status = 'completed'
     AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
     AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
)`;

/** Shared by the queries below. */
const DEMO = `-- Who finished the survey: every finished survey in the range, against the benchmark (all
-- finished surveys from launch, 21 Mar 2026, to yesterday). The team and our probes are out.
WITH b AS (
  SELECT (:from::date::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
         ((:to::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts,
         ('2026-03-21'::date::timestamp AT TIME ZONE 'Europe/Berlin') AS launch_ts,
         (date_trunc('day', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin') AS today_ts
),
staff AS (SELECT id FROM ap_team_user),
subs AS (
  SELECT s.id, s.user_id, s.session_id,
         (s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts) AS in_range,
         (s.created_date_time < b.today_ts) AS in_benchmark
    FROM survey_submission s, b,
         LATERAL (SELECT CASE WHEN pg_input_is_valid(s.utm_tracker, 'jsonb') THEN s.utm_tracker::jsonb END AS tag) t
   WHERE s.status = 'completed' AND s.created_date_time >= b.launch_ts
     AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
     -- our own test probes
     AND NOT coalesce(jsonb_typeof(t.tag) = 'object'
           AND (lower(trim(t.tag->>'utm_medium')) = 'probe'
                OR lower(trim(t.tag->>'utm_source')) IN ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')), false)
),
-- The survey's own answers: country (15001), gender (15010), age (15003).
own AS (
  SELECT a.survey_submission_id AS sid,
         max(CASE WHEN sq.frontend_qid = '15001' THEN coalesce(ao.option_text, a.answer_text) END) AS country,
         max(CASE WHEN sq.frontend_qid = '15010' THEN ao.option_text END) AS gender,
         (array_agg(ao.option_text ORDER BY a.id DESC) FILTER (WHERE sq.frontend_qid = '15003' AND ao.id IS NOT NULL))[1] AS age
    FROM survey_submission_answer a
    JOIN survey_question sq ON sq.id = a.survey_question_id AND sq.frontend_qid IN ('15001', '15010', '15003')
    LEFT JOIN answer_option ao ON ao.id = a.answer_option_id
   WHERE a.survey_submission_id IN (SELECT id FROM subs)
   GROUP BY 1
),
-- Quotes a reminder job made (no browser, so the pricing code wrote "Desktop"): not the reader's.
cron_quote AS (
  SELECT q.id FROM report_price_quote q JOIN survey_submission s ON s.id = q.survey_submission_id
   WHERE q.device_type = 'Desktop' AND q.created_date_time > s.created_date_time + interval '1 hour'
     AND q.paywall_reached_at IS NULL AND q.checkout_started_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM report_price_quote o
                      WHERE o.survey_submission_id = q.survey_submission_id AND o.id <> q.id
                        AND o.created_date_time BETWEEN q.created_date_time - interval '5 minutes'
                                                    AND q.created_date_time + interval '5 minutes')
),
who AS (
  SELECT s.in_range, s.in_benchmark,
         coalesce(o.country, up.location_primary, 'Not stated') AS country,
         CASE WHEN coalesce(o.gender, up.gender) IS NULL THEN 'Not stated'
              WHEN coalesce(o.gender, up.gender) ~* 'rather not' THEN 'Rather not label'
              WHEN coalesce(o.gender, up.gender) = 'Woman' THEN 'Women'
              WHEN coalesce(o.gender, up.gender) = 'Man' THEN 'Men'
              WHEN coalesce(o.gender, up.gender) = 'Nonbinary' THEN 'Non-binary'
              ELSE coalesce(o.gender, up.gender) END AS gender,
         CASE WHEN o.age IS NULL THEN 'Not stated' WHEN o.age IN ('55–64', '65+') THEN '55+' ELSE o.age END AS age,
         -- A tablet the survey steps flagged: the range's rows only, in ranges from 17 Oct 2026
         -- (the benchmark reads back to launch, before tablets were told apart).
         (s.in_range AND :from::date >= DATE '2026-10-17'
          AND EXISTS (SELECT 1 FROM survey_behavior_event e
                       WHERE e.session_id = s.session_id AND e.is_tablet)) AS tablet,
         -- the reader's latest price quote's device, else the survey's latest step's
         CASE coalesce(
                (SELECT q.device_type FROM report_price_quote q
                  WHERE q.survey_submission_id = s.id AND q.device_type IS NOT NULL
                    AND q.id NOT IN (SELECT id FROM cron_quote)
                  ORDER BY q.created_date_time DESC LIMIT 1),
                (SELECT e.device_type FROM survey_behavior_event e
                  WHERE e.session_id = s.session_id AND e.device_type IS NOT NULL
                  ORDER BY e.created_at DESC LIMIT 1))
           WHEN 'iOS' THEN 'Mobile' WHEN 'Android' THEN 'Mobile' WHEN 'Desktop' THEN 'Desktop'
           ELSE 'Unknown' END AS device
    FROM subs s
    LEFT JOIN own o ON o.sid = s.id
    LEFT JOIN app_user u ON u.id = s.user_id
    LEFT JOIN user_profile up ON up.id = u.user_profile_id
)
`;

/** Shared by the queries below. */
const ANSWERS_CTES = `-- One question's answers (here 01005) among the range's finished surveys: per answer, the
-- share of the people who answered it. A scale answer is its step (1 to 7); a multiple-choice
-- person counts once for each option picked, so those shares add up to more than 100%.
WITH b AS (
  SELECT (:from::date::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
         ((:to::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
),
subs AS (
  SELECT s.id, s.user_id
    FROM survey_submission s, b,
         LATERAL (SELECT CASE WHEN pg_input_is_valid(s.utm_tracker, 'jsonb') THEN s.utm_tracker::jsonb END AS tag) t
   WHERE s.status = 'completed'
     AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
     AND NOT EXISTS (SELECT 1 FROM ap_team_user t WHERE t.id = s.user_id)
     -- our own test probes
     AND NOT coalesce(jsonb_typeof(t.tag) = 'object'
           AND (lower(trim(t.tag->>'utm_medium')) = 'probe'
                OR lower(trim(t.tag->>'utm_source')) IN ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')), false)
),
answers AS (
  SELECT a.survey_submission_id AS sid, v.answer
    FROM survey_submission_answer a
    JOIN survey_question sq ON sq.id = a.survey_question_id AND sq.frontend_qid = '01005'
   CROSS JOIN LATERAL (
     SELECT trim(to_char(a.normalized_value, 'FM999990')) AS answer WHERE sq.type = 'scale'
     UNION ALL
     SELECT ao.option_text FROM survey_submission_answer_options o
       JOIN answer_option ao ON ao.id = o.answer_option_id
      WHERE sq.type = 'multiple' AND o.survey_submission_answer_id = a.id
     UNION ALL
     SELECT ao.option_text FROM answer_option ao
      WHERE sq.type NOT IN ('scale', 'multiple') AND ao.id = a.answer_option_id) v
   WHERE a.survey_submission_id IN (SELECT id FROM subs) AND NOT coalesce(a.was_skipped, false)
)
`;

/** The question funnel, per question, in one order (the survey's; 'variant' for the test's). */
const FUNNEL_ROWS =
  FUNNEL +
  `SELECT s.n, s.q_id AS question, s.reached, s.shown, s.exits,
       round(100.0 * s.exits / nullif(s.shown, 0), 2) AS drop_out_pct,
       round(100.0 * s.reached / nullif(s.first_step, 0), 1) AS of_start_pct,
       round(100.0 * s.reached / nullif(s.before, 0), 1) AS of_prev_pct,
       s.added AS added_during_range
  FROM steps s
 WHERE s.arm = 'control'  -- the test's order: 'variant' (here and below)
UNION ALL
-- Questions no longer asked that runs in the range still reached, after the asked ones.
SELECT NULL, x.q_id, count(*), count(*), count(*) FILTER (WHERE a.left_at = x.q_id AND a.last_at < now() - interval '30 minutes'),
       round(100.0 * count(*) FILTER (WHERE a.left_at = x.q_id AND a.last_at < now() - interval '30 minutes') / count(*), 2), NULL, NULL, NULL
  FROM reached x JOIN arms a ON a.session_id = x.session_id AND a.arm = 'control'
 WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.arm = 'control' AND x.q_id = ANY (o.qs))
 GROUP BY x.q_id
 ORDER BY 1 NULLS LAST, 2;
`;

const ORDER_RUNS =
  FUNNEL +
  `SELECT arm, count(*) AS runs FROM arms GROUP BY arm ORDER BY arm;
`;

const SKIPPED =
  FUNNEL +
  `-- Skipped: runs that went on from the question without answering it, over every run it was
-- put to in either order (the steps don't record the order).
SELECT f.q_id AS question, sk.skipped, sum(f.shown) AS shown_both_orders,
       round(100.0 * sk.skipped / nullif(sum(f.shown), 0), 1) AS skipped_pct
  FROM funnel f
  JOIN (SELECT e.q_id, count(DISTINCT e.session_id) AS skipped
          FROM survey_behavior_event e, b
         WHERE e.created_at >= b.since_ts AND e.created_at < b.until_ts
           -- The range's runs: begun in it, the team's left out.
           AND e.session_id IN (SELECT session_id FROM runs)
           AND e.answered IS FALSE AND e.direction = 'forward'
         GROUP BY e.q_id) sk ON sk.q_id = f.q_id
 GROUP BY f.q_id, sk.skipped
 ORDER BY f.q_id;
`;

const MEDIAN_TIME =
  `-- Each question's median time: half of the steps on it were quicker, half slower. A step is
-- one stay on the question's screen until moving on (forward, back, or leaving the page);
-- stays of 30 minutes or more (a tab left open) are left out, and so are the team's runs and
-- runs begun before the range.
` +
  TEAM.trimEnd() +
  `,
earlier AS (
  -- Runs begun before the range (a draft resumed in it, a survey that ran past midnight into
  -- it): an earlier period's, left out as the funnel leaves them out.
  SELECT w.session_id
    FROM (SELECT DISTINCT e.session_id FROM survey_behavior_event e, b
           WHERE e.created_at >= b.since_ts AND e.created_at < b.until_ts
             AND e.session_id IS NOT NULL) w, b
   WHERE EXISTS (SELECT 1 FROM survey_behavior_event e
                  WHERE e.session_id = w.session_id AND e.created_at < b.since_ts)
      OR EXISTS (SELECT 1 FROM survey_partial_save d
                  WHERE d.session_id = w.session_id AND d.started_at < b.since_ts)
      OR EXISTS (SELECT 1 FROM survey_submission s
                  WHERE s.session_id = w.session_id AND s.start_date_time < b.since_ts)
),
-- Where a run began walking back out of the questions: the first Back after its last forward
-- (or complete) step (the browser's Back passes each question in a fraction of a second; a
-- hidden tab on the way records an abandon). From there no Back is Went back, and after that
-- first Back (its stay on the question it had got to) no step is a time on a question.
walk AS (
  SELECT DISTINCT ON (e.session_id) e.session_id, e.created_at, e.id
    FROM survey_behavior_event e, b
   WHERE e.created_at >= b.since_ts AND e.direction = 'back'
     AND e.question_index IS NOT NULL AND e.session_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM survey_behavior_event o
                      WHERE o.session_id = e.session_id AND o.question_index IS NOT NULL
                        AND o.direction IN ('forward', 'complete')
                        AND (o.created_at, o.id) > (e.created_at, e.id))
   ORDER BY e.session_id, e.created_at, e.id
)
SELECT e.q_id AS question,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY e.time_spent_ms)
               FILTER (WHERE e.time_spent_ms >= 0 AND e.time_spent_ms < 1800000 AND NOT e.after_walk)) AS median_ms,
       count(DISTINCT e.session_id) FILTER (WHERE e.direction = 'back' AND NOT e.walking_out) AS went_back
  FROM (SELECT e.q_id, e.session_id, e.time_spent_ms, e.direction,
               coalesce((e.created_at, e.id) >= (w.created_at, w.id), false) AS walking_out,
               coalesce((e.created_at, e.id) > (w.created_at, w.id), false) AS after_walk
          FROM survey_behavior_event e
          LEFT JOIN walk w ON w.session_id = e.session_id
          CROSS JOIN b
         WHERE e.created_at >= b.since_ts AND e.created_at < b.until_ts
           AND e.session_id IS NOT NULL AND e.q_id IS NOT NULL
           AND e.session_id NOT IN (SELECT session_id FROM team)
           AND e.session_id NOT IN (SELECT session_id FROM earlier)) e
 GROUP BY e.q_id
 ORDER BY e.q_id;
`;

const EXITS_WEEK =
  FUNNEL +
  `-- Exits per day, week or month (by the range's length, as the column), in one order: the runs
-- that left at the question, as Exits counts them, by the day of their last step.
SELECT q_id AS question,
       date_trunc(:grain, last_at AT TIME ZONE 'Europe/Berlin')::date AS period_from,
       count(*) AS exits
  FROM exit_runs
 WHERE arm = 'control'  -- the test's order: 'variant'
 GROUP BY 1, 2
 ORDER BY 1, 2;
`;

const STARTS =
  STARTS_CTES +
  `,
counted AS (
  SELECT
    -- our own test probes (tagged utm_medium=probe, or a verification source) are not counted
    (SELECT count(*) FROM starts, b
      WHERE started_at >= b.since_ts AND started_at < b.until_ts
        AND NOT coalesce(known AND jsonb_typeof(tag) = 'object'
              AND (lower(trim(tag->>'utm_medium')) = 'probe'
                   OR lower(trim(tag->>'utm_source')) IN ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')), false)
    ) AS survey_starts,
    (SELECT count(*) FROM subs
      WHERE NOT coalesce(jsonb_typeof(tag) = 'object'
              AND (lower(trim(tag->>'utm_medium')) = 'probe'
                   OR lower(trim(tag->>'utm_source')) IN ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')), false)
    ) AS submissions
)
SELECT survey_starts FROM counted;
`;

const SUBS = `-- Submissions: surveys finished in the range (by the day they were finished). The team's
-- accounts and our test probes are left out.
SELECT count(*) AS submissions
  FROM survey_submission s,
       LATERAL (SELECT CASE WHEN pg_input_is_valid(s.utm_tracker, 'jsonb') THEN s.utm_tracker::jsonb END AS tag) t
 WHERE s.status = 'completed'
   AND s.created_date_time >= (:from::date::timestamp AT TIME ZONE 'Europe/Berlin')
   AND s.created_date_time < ((:to::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
   AND NOT EXISTS (SELECT 1 FROM ap_team_user t WHERE t.id = s.user_id)
   AND NOT coalesce(jsonb_typeof(t.tag) = 'object'
         AND (lower(trim(t.tag->>'utm_medium')) = 'probe'
              OR lower(trim(t.tag->>'utm_source')) IN ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')), false);
`;

const COMPLETION =
  STARTS_CTES +
  `,
counted AS (
  SELECT
    -- our own test probes (tagged utm_medium=probe, or a verification source) are not counted
    (SELECT count(*) FROM starts, b
      WHERE started_at >= b.since_ts AND started_at < b.until_ts
        AND NOT coalesce(known AND jsonb_typeof(tag) = 'object'
              AND (lower(trim(tag->>'utm_medium')) = 'probe'
                   OR lower(trim(tag->>'utm_source')) IN ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')), false)
    ) AS survey_starts,
    (SELECT count(*) FROM subs
      WHERE NOT coalesce(jsonb_typeof(tag) = 'object'
              AND (lower(trim(tag->>'utm_medium')) = 'probe'
                   OR lower(trim(tag->>'utm_source')) IN ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')), false)
    ) AS submissions
)
SELECT survey_starts, submissions,
       round(100.0 * submissions / nullif(survey_starts, 0), 1) AS completion_pct
  FROM counted;
`;

const DEMO_N =
  DEMO +
  `SELECT count(*) FILTER (WHERE in_range) AS this_survey_completed,
       count(*) FILTER (WHERE in_benchmark) AS benchmark_completed
  FROM who;
`;

const DEMO_COUNTRY =
  DEMO +
  `-- the card names the four largest countries and adds up the rest as Other
SELECT country,
       round(100.0 * count(*) FILTER (WHERE in_range)
             / nullif(sum(count(*) FILTER (WHERE in_range)) OVER (), 0), 1) AS this_range_pct,
       round(100.0 * count(*) FILTER (WHERE in_benchmark)
             / nullif(sum(count(*) FILTER (WHERE in_benchmark)) OVER (), 0), 1) AS benchmark_pct
  FROM who
 GROUP BY country
 ORDER BY this_range_pct DESC NULLS LAST;
`;

const DEMO_GENDER =
  DEMO +
  `SELECT gender,
       round(100.0 * count(*) FILTER (WHERE in_range)
             / nullif(sum(count(*) FILTER (WHERE in_range)) OVER (), 0), 1) AS this_range_pct,
       round(100.0 * count(*) FILTER (WHERE in_benchmark)
             / nullif(sum(count(*) FILTER (WHERE in_benchmark)) OVER (), 0), 1) AS benchmark_pct
  FROM who
 GROUP BY gender
 ORDER BY this_range_pct DESC NULLS LAST;
`;

const DEMO_AGE =
  DEMO +
  `SELECT age,
       round(100.0 * count(*) FILTER (WHERE in_range)
             / nullif(sum(count(*) FILTER (WHERE in_range)) OVER (), 0), 1) AS this_range_pct,
       round(100.0 * count(*) FILTER (WHERE in_benchmark)
             / nullif(sum(count(*) FILTER (WHERE in_benchmark)) OVER (), 0), 1) AS benchmark_pct
  FROM who
 GROUP BY age
 ORDER BY this_range_pct DESC NULLS LAST;
`;

const DEMO_DEVICE =
  DEMO +
  `SELECT device,
       round(100.0 * count(*) FILTER (WHERE in_range)
             / nullif(sum(count(*) FILTER (WHERE in_range)) OVER (), 0), 1) AS this_range_pct,
       round(100.0 * count(*) FILTER (WHERE in_benchmark)
             / nullif(sum(count(*) FILTER (WHERE in_benchmark)) OVER (), 0), 1) AS benchmark_pct
  -- A survey in both is the range's (a tablet there) and the benchmark's (as its own device).
  FROM (SELECT CASE WHEN tablet THEN 'Tablet' ELSE device END AS device, true AS in_range, false AS in_benchmark
          FROM who WHERE in_range
        UNION ALL
        SELECT device, false, true FROM who WHERE in_benchmark) d
 GROUP BY device
 ORDER BY this_range_pct DESC NULLS LAST;
`;

const ANSWERS =
  ANSWERS_CTES +
  `SELECT answer, count(DISTINCT sid) AS people,
       round(100.0 * count(DISTINCT sid) / (SELECT count(DISTINCT sid) FROM answers), 1) AS share_pct,
       (SELECT count(DISTINCT sid) FROM answers) AS n
  FROM answers
 GROUP BY answer
 ORDER BY answer;
`;

const CARDS = `-- The cards before question 1, from the visit log (funnel_event: one row per visitor, day and
-- step). Per card: the visitors who reached it; of them, those who went on to the next card
-- that day; the median time to it; and (recorded from 17 Oct 2026) Skip intro, Back and Exit.
WITH cards (card, step, next_step, back_step, skip_step) AS (VALUES
  (1, 'intro_view', 'intro_slide_1', NULL, NULL),
  (2, 'intro_slide_1', 'intro_slide_2', 'intro_back_1', 'intro_skip_1'),
  (3, 'intro_slide_2', 'intro_slide_3', 'intro_back_2', 'intro_skip_2'),
  (4, 'intro_slide_3', 'intro_slide_4', 'intro_back_3', 'intro_skip_3'),
  (5, 'intro_slide_4', 'consent_view', 'intro_back_4', 'intro_skip_4'),
  (6, 'consent_view', 'survey_engine_mount', 'consent_back', NULL)
),
seen AS (
  SELECT c.card, f.visitor_id, f.day, f.first_seen,
         -- the next card that day; slide 4 also went on to question 1 before the consent had a row
         coalesce(nx.first_seen, q1.first_seen) AS next_at,
         -- Skip Intro on slide 4 lands on the consent too: a skip, not going on
         EXISTS (SELECT 1 FROM funnel_event s WHERE c.card = 5 AND s.visitor_id = f.visitor_id
                    AND s.day = f.day AND s.event_type = 'intro_skip_4') AS skipped_4,
         EXISTS (SELECT 1 FROM funnel_event s WHERE s.visitor_id = f.visitor_id AND s.day = f.day
                    AND s.event_type = c.skip_step) AS skipped,
         -- Back before question 1 only: after it, the browser's Back leaving the questions
         -- through the intro's pages (all five within seconds) is no card read again.
         EXISTS (SELECT 1 FROM funnel_event s WHERE s.visitor_id = f.visitor_id AND s.day = f.day
                    AND s.event_type = c.back_step
                    AND NOT EXISTS (SELECT 1 FROM funnel_event q WHERE q.visitor_id = s.visitor_id
                                       AND q.day = s.day AND q.event_type = 'survey_engine_mount'
                                       AND q.first_seen < s.first_seen)) AS went_back,
         -- left here: the furthest card (or question 1) this visitor reached that day
         c.card = (SELECT max(c2.card) FROM funnel_event f2
                     JOIN (SELECT card, step FROM cards UNION ALL SELECT 7, 'survey_engine_mount') c2
                       ON c2.step = f2.event_type
                    WHERE f2.visitor_id = f.visitor_id AND f2.day = f.day) AS left_here,
         -- a consent visitor who saw no intro that day came from the landing page's question card
         (c.card = 6 AND NOT EXISTS (SELECT 1 FROM funnel_event i WHERE i.visitor_id = f.visitor_id
                    AND i.day = f.day AND i.event_type = 'intro_view')) AS direct
    FROM funnel_event f
    JOIN cards c ON c.step = f.event_type
    LEFT JOIN funnel_event nx ON nx.visitor_id = f.visitor_id AND nx.day = f.day AND nx.event_type = c.next_step
    LEFT JOIN funnel_event q1 ON c.card = 5 AND nx.visitor_id IS NULL AND q1.visitor_id = f.visitor_id
                             AND q1.day = f.day AND q1.event_type = 'survey_engine_mount'
   WHERE f.day BETWEEN :from::date AND :to::date
)
-- The intro's and consent's own rows and Skip intro, Back and Exit are recorded from 17 Oct 2026:
-- a range starting earlier leaves them blank, as the page does (they'd read low).
SELECT card,
       CASE WHEN tracked OR card BETWEEN 2 AND 5 THEN count(*) END AS reached,
       CASE WHEN tracked THEN count(*) FILTER (WHERE direct) END AS from_landing_card,
       CASE WHEN tracked OR card BETWEEN 2 AND 5
            THEN round(100.0 * count(next_at) FILTER (WHERE NOT skipped_4) / count(*), 1) END AS continue_pct,
       CASE WHEN tracked OR card BETWEEN 2 AND 5
            THEN percentile_cont(0.5) WITHIN GROUP (ORDER BY round(extract(epoch FROM next_at - first_seen) * 1000))
                   FILTER (WHERE next_at > first_seen AND NOT skipped_4) END AS median_ms,
       -- Skip intro is on slides 1-4 (cards 2-5), Back on the slides and the consent (cards 2-6).
       CASE WHEN tracked AND card BETWEEN 2 AND 5
            THEN round(100.0 * count(*) FILTER (WHERE skipped) / count(*), 1) END AS skip_intro_pct,
       CASE WHEN tracked AND card >= 2
            THEN round(100.0 * count(*) FILTER (WHERE went_back) / count(*), 1) END AS back_pct,
       CASE WHEN tracked THEN round(100.0 * count(*) FILTER (WHERE left_here) / count(*), 1) END AS exit_pct
  FROM seen, (SELECT :from::date >= DATE '2026-10-17' AS tracked) t
 GROUP BY card, tracked
 ORDER BY card;
`;

const INTRO_CLICKS = `-- PostHog's visits (sessions) to the survey page and what they clicked before question 1.
-- The team's own people are left out by the PostHog visits of their finished surveys
-- (survey_submission.posthog_session_id of staff accounts).
SELECT uniqExact($session_id) AS opened,
       uniqExactIf($session_id, properties.$el_text = 'Skip Intro'
                                AND elements_chain NOT LIKE '%wz-skip%') AS skipped,
       uniqExactIf($session_id, properties.$el_text = 'I agree') AS agreed,
       uniqExactIf($session_id, event IN ('survey_answer', 'survey_started')) AS reached_q1,
       uniqExactIf($session_id, event = '$autocapture'
                                AND elements_chain LIKE '%Continue to survey introduction%') AS silhouette,
       uniqExactIf($session_id, properties.$el_text = '> Trust Zone') AS trust_zone,
       uniqExactIf($session_id, lower(properties.$el_text) = 'return to site') AS return_to_site,
       uniqExactIf($session_id, properties.$el_text IN ('Terms & Conditions',
                     'Digital Content & Subscription Terms', 'Terms of Use')) AS terms
  FROM events
 WHERE properties.$host = 'www.loveiq.org' AND properties.$pathname = '/survey'
   AND timestamp >= toDateTime(:from, 'Europe/Berlin')
   AND timestamp < toDateTime(:to, 'Europe/Berlin') + INTERVAL 1 DAY
   AND person_id NOT IN (SELECT person_id FROM events
                          WHERE $session_id IN :team_visits
                            AND timestamp >= toDateTime('2026-08-23', 'Europe/Berlin'))
 LIMIT 1
`;

/** The intro's four tiles: our own visit log from 17 Oct 2026, PostHog's clicks before it. */
const INTRO_TILES = `-- Part 1, production (SQL): a range from 17 Oct 2026 reads our own visit log (funnel_event: one
-- row per visitor, day and step), as the page does; a range starting earlier gets no row here.
-- Began: on the intro, or on the consent from the landing page's question card (no intro that
-- day). Left: the furthest card that day was before question 1 (card 7).
WITH cards (step, card) AS (VALUES ('intro_view', 1), ('intro_slide_1', 2), ('intro_slide_2', 3),
  ('intro_slide_3', 4), ('intro_slide_4', 5), ('consent_view', 6), ('survey_engine_mount', 7)),
per AS (
  SELECT f.visitor_id, f.day,
         bool_or(f.event_type = 'intro_view') AS saw,
         bool_or(f.event_type IN ('intro_view', 'consent_view')) AS began,
         bool_or(f.event_type = 'consent_view') AND bool_or(f.event_type = 'survey_engine_mount') AS agreed,
         count(*) FILTER (WHERE f.event_type IN ('intro_skip_1', 'intro_skip_2', 'intro_skip_3', 'intro_skip_4')) AS skips,
         max(c.card) AS furthest
    FROM funnel_event f
    LEFT JOIN cards c ON c.step = f.event_type
   WHERE f.day BETWEEN :from::date AND :to::date
   GROUP BY 1, 2
)
SELECT count(*) FILTER (WHERE saw) AS saw_the_intro,
       count(*) FILTER (WHERE began) AS began,
       round(100.0 * count(*) FILTER (WHERE agreed) / nullif(count(*) FILTER (WHERE began), 0), 1) AS agreed_pct,
       round(100.0 * sum(skips) / nullif(count(*) FILTER (WHERE saw), 0), 1) AS skipped_pct,
       round(100.0 * count(*) FILTER (WHERE furthest <= 6) / nullif(count(*) FILTER (WHERE began), 0), 1) AS left_pct
  FROM per
HAVING :from::date >= DATE '2026-10-17';

${INTRO_CLICKS.replace(
  "-- PostHog's visits",
  "-- Part 2, PostHog (HogQL): a range starting before 17 Oct 2026 reads PostHog's visits"
)}`;

/** The intro tiles' visit-log table. */
const INTRO_LOG: FieldTable = {
  source: "production",
  table: "funnel_event",
  columns: "visitor_id, day, event_type",
  filters: "Period (day), for a range from 17 Oct 2026. No other filter.",
  watch: "One row per visitor, day and step: someone back on another day counts again.",
};

/** The tables the funnel reads, with what each gives it. */
const FUNNEL_TABLES: FieldDef["tables"] = [
  {
    source: "production",
    table: "survey_behavior_event",
    columns: "session_id, q_id, question_index, created_at, direction, client_ip, device_type",
    filters:
      "Period (created_at: a step in the range). Device: phone or computer only, from the last step's device_type, from 13 Oct 2026. Tablet, country tier and new or returning can't be split: the funnel then shows all traffic.",
    watch:
      "One row per step: a run with no step in the range is not in it, and one that began before the range (a draft picked up in it) is left out, as Survey starts dates it.",
  },
  {
    source: "production",
    table: "survey_submission",
    columns: "session_id, status, user_id, utm_tracker",
    filters:
      "Source: Google Ads only (its click id in utm_tracker, here or in the run's draft), within the last 30 days. Leaves out the team's runs (user_id of a staff account).",
  },
  {
    source: "production",
    table: "survey_partial_save",
    columns: "session_id, client_ip, utm_tracker",
    filters:
      "Source: an unfinished run's tag (utm_tracker), kept while its draft is (30 days). Leaves out unfinished runs from the team's networks (client_ip).",
  },
];

const FUNNEL_CAVEAT =
  "Counts survey runs (one browser's go at the survey) begun in the range, not people: someone who restarts in another browser counts twice. A run begun earlier and carried on in the range (a saved draft picked up again, or a survey that ran past midnight into it) belongs to the period it began in, as Survey starts counts it, so it is left out. Since 6 Oct 2026 half of the new runs are asked the opening questions in a different order (the C13 test); each order has its own funnel (the toggle). A run counts as reaching every question up to the furthest it got to, in its order (a step lost while the tab was in the background, an answer given on the landing page's card, steps recorded only from part-way before 18 Sep 2026), so no question has more runs than the one before it. The email question asked first (by a run begun before 17 Aug 2026) is not how far a run got. A run that leaves by walking back through the questions with the browser's Back (a fraction of a second on each) left where that walk began, and its Backs aren't Went back. The drop-out rate and Skipped are shares of the runs a question was put to. A question first asked during the range (marked) was put only to the runs begun after; one first asked after the range isn't listed. The team's runs are left out. Under a device filter the survey's steps class Android tablets as phones and iPads as computers.";

export const fields: FieldRegistry = {
  "survey.starts": {
    label: "Survey starts",
    what: "Survey runs begun in the range that answered at least the first question (a run is one browser's go at the survey). It is the top of the survey funnel: fewer starts means fewer people trying the survey.",
    good: "up",
    stat: "Count",
    per: "per survey session (one browser's run of the survey)",
    formula: { num: "Survey sessions begun in the range that answered the first question" },
    caveat:
      "Counted on the day the run began. The team's own runs (staff accounts, and unfinished runs from the networks the team's surveys came from) and our test probes are left out. Before 18 Sep 2026 starts read low (drafts of people who declined cookies were cleared after 30 days), so a range starting earlier is blank. A start can be split by source only within the last 30 days (an unfinished run keeps its source only in its draft) and by device from 13 Oct 2026; never by country tier or new or returning.",
    tables: [
      {
        source: "production",
        table: "survey_behavior_event",
        columns: "session_id, created_at, answered, direction, client_ip, device_type",
        filters: "Period (the run's first created_at). Device (device_type, from 13 Oct 2026).",
      },
      {
        source: "production",
        table: "survey_partial_save",
        columns: "session_id, started_at, current_index, utm_tracker, saved_at, client_ip",
        filters: "Period (started_at). Source (utm_tracker, kept 30 days).",
      },
      {
        source: "production",
        table: "survey_submission",
        columns: "session_id, start_date_time, status, user_id, utm_tracker",
        filters: "Period (start_date_time). Source (utm_tracker).",
      },
    ],
    query: { lang: "SQL", text: STARTS },
    related: ["survey.subs", "survey.completion", "survey.firstStep"],
  },
  "survey.subs": {
    label: "Submissions",
    what: "Finished surveys: people who answered the last question and submitted in the range. Each one gets a report, so this is the number of new reports.",
    good: "up",
    stat: "Count",
    per: "per finished survey (a person who finishes twice counts twice)",
    formula: { num: "Surveys finished in the range" },
    caveat:
      "Counted on the day the survey was finished, whenever it began. The team's own accounts (an @loveiq.org address, or one that used the team's test code) and our test probes are left out.",
    tables: [
      {
        source: "production",
        table: "survey_submission",
        columns: "status, created_date_time, user_id, utm_tracker",
        filters:
          "Period (created_date_time). Source (utm_tracker). Device (the reader's price quote, else the survey's steps). Country tier (the price quote's). New or returning (the visit in PostHog).",
      },
    ],
    query: { lang: "SQL", text: SUBS },
    related: ["survey.starts", "survey.completion", "survey.demoN"],
  },
  "survey.completion": {
    label: "Completion",
    what: "Finished surveys for every survey start in the range: how many of the people who begin the survey get to the end. Landing's Survey complete CVR is the same figure.",
    good: "up",
    stat: "Ratio, shown as a share",
    per: "per survey start",
    formula: { num: "Submissions", den: "Survey starts", mult: "× 100" },
    caveat:
      "Each side is counted on its own day: a survey finished in the range counts even if it began before it. So this is close to, not exactly, the share of the range's starts that finished. Blank wherever survey starts are blank.",
    tables: [
      {
        source: "production",
        table: "survey_submission",
        columns: "status, created_date_time, start_date_time, user_id, utm_tracker",
        filters: "Period (created_date_time for submissions, start_date_time for starts). Source.",
      },
      {
        source: "production",
        table: "survey_behavior_event",
        columns: "session_id, created_at, answered, direction, client_ip",
        filters: "Period (the run's first step). Device (from 13 Oct 2026).",
      },
      {
        source: "production",
        table: "survey_partial_save",
        columns: "session_id, started_at, current_index, utm_tracker, client_ip",
        filters: "Period (started_at). Source (kept 30 days).",
      },
    ],
    query: { lang: "SQL", text: COMPLETION },
    related: ["survey.starts", "survey.subs", "survey.lastStep"],
  },

  "survey.funnel": {
    label: "Question funnel",
    what: "Every question in the order it is asked, with how many survey runs reached it and how many left there. It shows where people drop out of the survey.",
    stat: "Count",
    per: "per survey run",
    formula: { num: "Survey runs that reached each question, and those that left there" },
    caveat: FUNNEL_CAVEAT,
    tables: FUNNEL_TABLES,
    query: { lang: "SQL", text: FUNNEL_ROWS },
    related: ["survey.reached", "survey.exits", "survey.ofPrev", "survey.order"],
  },
  "survey.order": {
    label: "Survey order and test order (C13)",
    what: "Since 6 Oct 2026 half of the new survey runs are asked five later questions first (the opening-order test, C13). Each order has its own funnel; the number beside it is how many runs were asked that way.",
    stat: "Count",
    per: "per survey run",
    formula: { num: "Survey runs begun in the range, by the order they were asked in" },
    caveat:
      "A run's order is read from its first six questions: the order they follow with the fewest questions passed over. A run that left within the opening both orders share goes to the half its session was dealt. Runs begun before the test (6 Oct 2026, evening) were all asked the survey's order. The team's runs are left out.",
    tables: FUNNEL_TABLES,
    query: { lang: "SQL", text: ORDER_RUNS },
    related: ["survey.funnel", "survey.firstStep"],
  },
  "survey.firstStep": {
    label: "First step",
    what: "Survey runs begun in the range that reached a question: the top of the question funnel. Each got at least as far as the first question (the name question).",
    stat: "Count",
    per: "per survey run",
    formula: { num: "Survey runs begun in the range with a step on a question" },
    caveat:
      "In the order picked above; Survey starts counts both orders. Starts are the runs begun in the range that answered a question, so they leave out runs that opened the first question and left without answering, and they leave out our test probes: the two orders' first steps together differ from Survey starts by about that many.",
    tables: FUNNEL_TABLES,
    query: { lang: "SQL", text: FUNNEL_ROWS },
    related: ["survey.lastStep", "survey.starts", "survey.order"],
  },
  "survey.lastStep": {
    label: "Reached last step",
    what: "The share of the first step's runs that reached the survey's last question, and how many runs that is.",
    good: "up",
    stat: "Share",
    per: "per survey run",
    formula: {
      num: "Runs that reached the last question",
      den: "Runs that reached the first question",
      mult: "× 100",
    },
    caveat:
      "The last question is the hints opt-in (16015), after the email question. Reaching it is not quite finishing: Submissions counts the finished surveys.",
    tables: FUNNEL_TABLES,
    query: { lang: "SQL", text: FUNNEL_ROWS },
    related: ["survey.firstStep", "survey.ofStart", "survey.completion"],
  },
  "survey.reached": {
    label: "Reached",
    what: "Survey runs begun in the range that got at least as far as this question. Never more than the question before: a run that went back to an earlier question and left from there counts as reaching its furthest, and as an exit where it left.",
    stat: "Count",
    per: "per survey run",
    formula: {
      num: "Survey runs begun in the range with a step on the question, or on one after it",
    },
    caveat: FUNNEL_CAVEAT,
    tables: FUNNEL_TABLES,
    query: { lang: "SQL", text: FUNNEL_ROWS },
    related: ["survey.ofStart", "survey.ofPrev", "survey.exits"],
  },
  "survey.funnelBar": {
    label: "Funnel",
    what: "A bar as long as the share of the first step's runs that reached the question: the % of start beside it, drawn.",
    stat: "Share",
    per: "per survey run",
    formula: {
      num: "Runs that reached the question",
      den: "Runs that reached the first question",
      mult: "× 100",
    },
    caveat: FUNNEL_CAVEAT,
    tables: FUNNEL_TABLES,
    query: { lang: "SQL", text: FUNNEL_ROWS },
    related: ["survey.ofStart", "survey.reached"],
  },
  "survey.ofStart": {
    label: "% of start",
    what: "Of the runs that reached the first question, the share that got to this one. It falls question by question as people leave.",
    good: "up",
    stat: "Share",
    per: "per survey run",
    formula: {
      num: "Runs that reached the question",
      den: "Runs that reached the first question",
      mult: "× 100",
    },
    caveat: FUNNEL_CAVEAT,
    tables: FUNNEL_TABLES,
    query: { lang: "SQL", text: FUNNEL_ROWS },
    related: ["survey.ofPrev", "survey.reached", "survey.lastStep"],
  },
  "survey.ofPrev": {
    label: "% of prev.",
    what: "Of the runs that reached the question before, the share that reached this one. Below 95% the row is orange: more than 5% were lost at this step.",
    good: "up",
    stat: "Share",
    per: "per survey run",
    formula: {
      num: "Runs that reached the question",
      den: "Runs that reached the question before it",
      mult: "× 100",
    },
    caveat: "Never above 100%: no question has more runs than the one before it. " + FUNNEL_CAVEAT,
    tables: FUNNEL_TABLES,
    query: { lang: "SQL", text: FUNNEL_ROWS },
    related: ["survey.ofStart", "survey.dropRate", "survey.exits"],
  },
  "survey.exits": {
    label: "Exits",
    what: "Survey runs whose last step was on this question and that never finished: the people who left the survey here. A run with a step in the last half hour is still answering, not gone.",
    good: "down",
    stat: "Count",
    per: "per survey run",
    formula: {
      num: "Runs whose last step was the question, in the range, and that never finished",
    },
    caveat:
      "A run whose last step falls after the range is not an exit in it, and one that finished later is never an exit. " +
      FUNNEL_CAVEAT,
    tables: FUNNEL_TABLES,
    query: { lang: "SQL", text: FUNNEL_ROWS },
    related: ["survey.dropRate", "survey.exitsTrend", "survey.reached"],
  },
  "survey.dropRate": {
    label: "Drop-out rate",
    what: "Of the runs the question was put to, the share that left the survey there. Above 5% it is red.",
    good: "down",
    stat: "Share",
    per: "per survey run the question was put to",
    formula: {
      num: "Exits",
      den: "Runs the question was put to (not those begun before it was added)",
      mult: "× 100",
    },
    caveat: FUNNEL_CAVEAT,
    tables: FUNNEL_TABLES,
    query: { lang: "SQL", text: FUNNEL_ROWS },
    related: ["survey.exits", "survey.reached", "survey.ofPrev"],
  },
  "survey.medianTime": {
    label: "Median time",
    what: "How long people stay on the question before moving on: half of the stays are quicker, half slower. A slow question may be unclear or hard.",
    stat: "Median",
    per: "per stay on the question's screen (someone who comes back to it counts again)",
    formula: { num: "Time on the question's screen, until moving on" },
    caveat:
      "Stays of 30 minutes or more (a tab left open) are left out. All traffic and both question orders, whatever the filters: the steps don't record a run's source or order. The team's runs are left out. In whole seconds.",
    tables: [
      {
        source: "production",
        table: "survey_behavior_event",
        columns: "session_id, q_id, time_spent_ms, direction, created_at",
        filters: "Period (created_at). Not split by the other filters.",
      },
    ],
    query: { lang: "SQL", text: MEDIAN_TIME },
    related: ["survey.skipped", "survey.reached"],
  },
  "survey.exitsTrend": {
    label: "Exits over time",
    what: "The question's exits week by week (day by day for a range up to two weeks, month by month past four months), so a question that suddenly loses people stands out.",
    good: "down",
    stat: "Count",
    per: "per survey run, per day, week or month (by the range's length)",
    formula: {
      num: "Runs whose last survey step was the question that week and that never finished",
    },
    caveat:
      "The order picked above, under the filters, as the Exits column. Each exit is on the day of the run's last step. By day the points add up to the question's exits. Only whole weeks or months are drawn, so exits in a part-week or part-month at either end of the range (over 12 months, the current month) are in Exits but not on the line.",
    tables: [
      {
        source: "production",
        table: "survey_behavior_event",
        columns: "session_id, q_id, question_index, created_at, direction",
        filters:
          "Period (the range's runs, by the day of their last step); source and device as the funnel.",
      },
    ],
    query: { lang: "SQL", text: EXITS_WEEK },
    related: ["survey.exits", "survey.dropRate"],
  },

  "survey.skipped": {
    label: "Skipped",
    what: "The share of the runs the question was put to that went on without answering it. Only optional questions can be passed.",
    stat: "Share",
    per: "per survey run the question was put to",
    formula: {
      num: "Runs that went on without answering",
      den: "Runs it was put to, in both question orders",
      mult: "× 100",
    },
    caveat:
      "All traffic and both question orders: the steps don't record a run's source or order, so it is a share of every run the question was put to.",
    tables: [
      {
        source: "production",
        table: "survey_behavior_event",
        columns: "session_id, q_id, answered, direction, created_at",
        filters: "Period (created_at). Not split by the other filters.",
      },
      ...FUNNEL_TABLES.slice(1),
    ],
    query: { lang: "SQL", text: SKIPPED },
    related: ["survey.reached", "survey.medianTime"],
  },
  "survey.answers": {
    label: "Answers",
    what: "How the people who finished the survey in the range answered this question: the share giving each answer, for everyone or by group.",
    stat: "Share",
    per: "per finished survey that answered the question",
    formula: {
      num: "Finished surveys giving the answer",
      den: "Finished surveys in the group that answered the question",
      mult: "× 100",
    },
    caveat:
      "Only finished surveys: the answers of people who left are not here. A multiple-choice question's shares add up to more than 100%. At most three groups, each of five people or more; the rest are named under the chart. By another question: a scale answer of 1 to 3 is Disagree, 4 Neutral, 5 to 7 Agree. Relationship: In a relationship is monogamous, open or polyamorous; Other or not stated is still figuring it out, undefined, or no answer. Device: the reader's price quote, else the survey's steps. The team and our test probes are left out.",
    tables: [
      {
        source: "production",
        table: "survey_submission_answer",
        columns:
          "survey_submission_id, survey_question_id, normalized_value, answer_option_id, was_skipped",
        filters: "The question picked.",
      },
      {
        source: "production",
        table: "survey_submission",
        columns: "id, status, created_date_time, user_id, utm_tracker",
        filters:
          "Period (created_date_time). Source (utm_tracker). Device, country tier (the price quote). New or returning (PostHog).",
      },
      {
        source: "production",
        table: "answer_option",
        columns: "id, option_text",
        filters: "None.",
      },
    ],
    query: { lang: "SQL", text: ANSWERS },
    related: ["survey.answersN", "survey.subs"],
  },
  "survey.answersN": {
    label: "n",
    what: "How many finished surveys in the group answered the question: what the group's shares are out of. A small n makes the shares jumpy.",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Finished surveys in the group that answered the question" },
    caveat:
      "A group needs five people to be shown. With no split it is everyone who answered; the note under the chart says how many finished surveys there were in all.",
    tables: [
      {
        source: "production",
        table: "survey_submission_answer",
        columns: "survey_submission_id, survey_question_id, was_skipped",
        filters: "The question picked; the period and filters through survey_submission.",
      },
    ],
    query: { lang: "SQL", text: ANSWERS },
    related: ["survey.answers"],
  },

  "survey.demographics": {
    label: "Core demographics",
    what: "Who finished the survey in the range (country, gender, age and device) against a benchmark: all finished surveys since launch, unless another is picked.",
    stat: "Share",
    per: "per finished survey",
    formula: {
      num: "Finished surveys in the group",
      den: "Finished surveys in the range",
      mult: "× 100",
    },
    caveat:
      "The black tick is the benchmark's share; the figure on the right the difference in points, green or red from 2 points. Under a filter This survey follows it and the benchmark stays all traffic. While only Assessment A is live, all surveys means this survey.",
    tables: [
      {
        source: "production",
        table: "survey_submission",
        columns: "id, status, created_date_time, user_id, session_id, utm_tracker",
        filters:
          "Period (created_date_time; the benchmark from 21 Mar 2026 to yesterday, or the picked period). Source, device, country tier, new or returning: This survey only.",
      },
      {
        source: "production",
        table: "survey_submission_answer",
        columns: "survey_submission_id, survey_question_id, answer_option_id, answer_text",
        filters: "Questions 15001 (country), 15010 (gender), 15003 (age).",
      },
    ],
    query: { lang: "SQL", text: DEMO_COUNTRY },
    related: ["survey.demoN", "survey.benchN", "survey.demoCountry"],
  },
  "survey.demoN": {
    label: "This survey",
    what: "Finished surveys in the range, with the filters: the people the cards' bars are shares of.",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Surveys finished in the range" },
    caveat: "The same people as the Submissions tile.",
    tables: [
      {
        source: "production",
        table: "survey_submission",
        columns: "status, created_date_time, user_id, utm_tracker",
        filters: "Period (created_date_time). Source, device, country tier, new or returning.",
      },
    ],
    query: { lang: "SQL", text: DEMO_N },
    related: ["survey.benchN", "survey.subs"],
  },
  "survey.benchN": {
    label: "Benchmark",
    what: "The finished surveys the benchmark ticks are made of: all since launch (21 Mar 2026) to yesterday, or the same or the previous period when picked.",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Finished surveys in the benchmark" },
    caveat: "All traffic, whatever the filters. Staff accounts and our test probes are left out.",
    tables: [
      {
        source: "production",
        table: "survey_submission",
        columns: "status, created_date_time, user_id, utm_tracker",
        filters: "Period: the benchmark's own (not the filter bar's). No other filter.",
      },
    ],
    query: { lang: "SQL", text: DEMO_N },
    related: ["survey.demoN", "survey.demographics"],
  },
  "survey.demoCountry": {
    label: "Country",
    what: "Where the people who finished the survey live, as they answered the country question (15001), against the benchmark.",
    stat: "Share",
    per: "per finished survey",
    formula: {
      num: "Finished surveys from the country",
      den: "Finished surveys",
      mult: "× 100",
    },
    caveat:
      "The four largest countries by name; the rest add up to Other. The profile's country stands in only where the survey recorded none.",
    tables: [
      {
        source: "production",
        table: "survey_submission_answer",
        columns: "survey_submission_id, survey_question_id, answer_option_id, answer_text",
        filters: "Question 15001; the period and filters through survey_submission.",
      },
      {
        source: "production",
        table: "user_profile",
        columns: "location_primary",
        filters: "Only where the survey recorded no country.",
      },
    ],
    query: { lang: "SQL", text: DEMO_COUNTRY },
    related: ["survey.demographics", "survey.demoGender"],
  },
  "survey.demoGender": {
    label: "Gender",
    what: "The gender the people who finished the survey gave (question 15010), against the benchmark.",
    stat: "Share",
    per: "per finished survey",
    formula: { num: "Finished surveys with the gender", den: "Finished surveys", mult: "× 100" },
    caveat:
      "As the survey words it: Women, Men, Non-binary, Other and Rather not label. The profile's gender stands in only where the survey recorded none.",
    tables: [
      {
        source: "production",
        table: "survey_submission_answer",
        columns: "survey_submission_id, survey_question_id, answer_option_id",
        filters: "Question 15010; the period and filters through survey_submission.",
      },
      {
        source: "production",
        table: "user_profile",
        columns: "gender",
        filters: "Only where the survey recorded no gender.",
      },
    ],
    query: { lang: "SQL", text: DEMO_GENDER },
    related: ["survey.demographics", "survey.demoAge"],
  },
  "survey.demoAge": {
    label: "Age",
    what: "The age range the people who finished the survey gave (question 15003), against the benchmark.",
    stat: "Share",
    per: "per finished survey",
    formula: { num: "Finished surveys in the age range", den: "Finished surveys", mult: "× 100" },
    caveat: "55+ is the survey's 55–64 and 65+ together.",
    tables: [
      {
        source: "production",
        table: "survey_submission_answer",
        columns: "survey_submission_id, survey_question_id, answer_option_id",
        filters: "Question 15003; the period and filters through survey_submission.",
      },
    ],
    query: { lang: "SQL", text: DEMO_AGE },
    related: ["survey.demographics", "survey.demoDevice"],
  },
  "survey.demoDevice": {
    label: "Device",
    what: "The devices the people who finished the survey used: Mobile (iPhone and Android), Desktop and Tablet, against the benchmark.",
    stat: "Share",
    per: "per finished survey",
    formula: { num: "Finished surveys on the device", den: "Finished surveys", mult: "× 100" },
    caveat:
      "The device of the reader's latest price quote (not one a reminder job made), else the survey's latest step. Tablets are told apart only in ranges from 17 Oct 2026; before, a tablet counts as Mobile or Desktop. Unknown: neither recorded one.",
    tables: [
      {
        source: "production",
        table: "report_price_quote",
        columns: "survey_submission_id, device_type, created_date_time",
        filters: "The finished surveys of the period and filters.",
      },
      {
        source: "production",
        table: "survey_behavior_event",
        columns: "session_id, device_type, is_tablet, created_at",
        filters: "Where the reader has no price quote.",
      },
    ],
    query: { lang: "SQL", text: DEMO_DEVICE },
    related: ["survey.demographics", "survey.demoCountry"],
  },

  "survey.wizard": {
    label: "Intro wizard",
    what: "The cards people see before question 1 (the intro, four slides and the consent) and how many go on, skip, go back or leave on each.",
    stat: "Count and share",
    per: "per visitor and day",
    formula: { num: "Visitors who reached each card that day" },
    caveat:
      "Our own visit log: every visitor from 17 Oct 2026, before it only visitors who accepted cookies; the intro and consent cards, Skip intro, Back and Exit are recorded from 17 Oct 2026. A visitor is one browser on one day. The four boxes come from PostHog for a range starting before 17 Oct 2026. None of it follows the filters.",
    tables: [
      {
        source: "production",
        table: "funnel_event",
        columns: "visitor_id, day, event_type, first_seen",
        filters: "Period (day). No other filter.",
        watch: "One row per visitor, day and card.",
      },
      {
        source: "posthog",
        table: "events",
        columns: "$session_id, event, properties.$el_text, elements_chain, properties.$pathname",
        filters: "Period (timestamp). No other filter.",
      },
    ],
    query: { lang: "SQL", text: CARDS },
    related: ["survey.wizReached", "survey.introSaw", "survey.wizEngagement"],
  },
  "survey.introSaw": {
    label: "Saw the intro",
    what: "How many people opened the survey's intro in the range: the start of the way to question 1.",
    good: "up",
    stat: "Count",
    per: "per visitor and day (before 17 Oct 2026, per PostHog visit to the survey page)",
    formula: {
      num: "Visitors on the intro card (before 17 Oct 2026: PostHog's visits to the survey page)",
    },
    caveat:
      "From 17 Oct 2026 our own log's visitors on the intro card (the wizard's first row): someone back on another day counts again. For a range starting earlier, PostHog's visits to the survey page (it sees most of them, not people with a blocker). Compared with the period before only when both come from the same records.",
    tables: [
      INTRO_LOG,
      {
        source: "posthog",
        table: "events",
        columns: "$session_id, properties.$pathname, properties.$host, timestamp",
        filters: "Period (timestamp), for a range starting before 17 Oct 2026. No other filter.",
      },
    ],
    query: { lang: "SQL", text: INTRO_TILES },
    related: ["survey.introAgreed", "survey.wizReached"],
  },
  "survey.introAgreed": {
    label: "Agreed to consent",
    what: "The share of people who began the survey that agreed to the consent and went on to the questions.",
    good: "up",
    stat: "Share",
    per: "per visitor and day (before 17 Oct 2026, per PostHog visit to the survey page)",
    formula: {
      num: "Visitors on the consent who reached question 1 that day (before 17 Oct 2026: visits that pressed I agree)",
      den: "Visitors who began: on the intro, or on the consent from the landing page's question card (before 17 Oct 2026: visits to the survey page)",
      mult: "× 100",
    },
    caveat:
      "From 17 Oct 2026 our own log; for a range starting earlier, PostHog's clicks over its visits to the survey page.",
    tables: [
      INTRO_LOG,
      {
        source: "posthog",
        table: "events",
        columns: "$session_id, properties.$el_text, timestamp",
        filters: "Period (timestamp), for a range starting before 17 Oct 2026. No other filter.",
      },
    ],
    query: { lang: "SQL", text: INTRO_TILES },
    related: ["survey.introSaw", "survey.introLeft", "survey.wizContinue"],
  },
  "survey.introSkipped": {
    label: "Skipped slides",
    what: "Skip intro presses on the slides (each jumps to the consent) for every hundred people who opened the intro.",
    good: "down",
    stat: "Share",
    per: "per visitor and day (before 17 Oct 2026, per PostHog visit to the survey page)",
    formula: {
      num: "Skip intro presses on slides 1 to 4 (before 17 Oct 2026: visits that pressed Skip Intro)",
      den: "Visitors on the intro card (before 17 Oct 2026: visits to the survey page)",
      mult: "× 100",
    },
    caveat:
      "From 17 Oct 2026 our own log, where someone who skips on two slides counts twice; for a range starting earlier, PostHog's visits that pressed it, leaving out the report's own pre-wizard, which has a Skip Intro too.",
    tables: [
      INTRO_LOG,
      {
        source: "posthog",
        table: "events",
        columns: "$session_id, properties.$el_text, elements_chain, timestamp",
        filters: "Period (timestamp), for a range starting before 17 Oct 2026. No other filter.",
      },
    ],
    query: { lang: "SQL", text: INTRO_TILES },
    related: ["survey.wizSkip", "survey.introSaw"],
  },
  "survey.introLeft": {
    label: "Left before Q1",
    what: "The share of people who began the survey that never reached question 1: they left during the intro, the slides or the consent.",
    good: "down",
    stat: "Share",
    per: "per visitor and day (before 17 Oct 2026, per PostHog visit to the survey page)",
    formula: {
      num: "Visitors whose furthest card that day was before question 1 (before 17 Oct 2026: visits in which the questions never started)",
      den: "Visitors who began: on the intro, or on the consent from the landing page's question card (before 17 Oct 2026: visits to the survey page)",
      mult: "× 100",
    },
    caveat:
      "From 17 Oct 2026 our own log; for a range starting earlier, PostHog's visits in which the questions never started.",
    tables: [
      INTRO_LOG,
      {
        source: "posthog",
        table: "events",
        columns: "$session_id, event, timestamp",
        filters: "Period (timestamp), for a range starting before 17 Oct 2026. No other filter.",
      },
    ],
    query: { lang: "SQL", text: INTRO_TILES },
    related: ["survey.introAgreed", "survey.wizExit"],
  },
  "survey.wizTime": {
    label: "Median time",
    what: "How long people stay on the card before reaching the next one: half are quicker, half slower.",
    stat: "Median",
    per: "per visitor and day",
    formula: { num: "Time from reaching the card to reaching the next one" },
    caveat:
      "Before 17 Oct 2026, slide 4's time ran to question 1, past the consent. Someone who skipped on slide 4 is left out of it. In whole seconds.",
    tables: [
      {
        source: "production",
        table: "funnel_event",
        columns: "visitor_id, day, event_type, first_seen",
        filters: "Period (day). No other filter.",
      },
    ],
    query: { lang: "SQL", text: CARDS },
    related: ["survey.wizReached", "survey.medianTime"],
  },
  "survey.wizReached": {
    label: "Reached",
    what: "Visitors who reached the card, and their share of the first card's (the intro; slide 1 for a range before 17 Oct 2026).",
    stat: "Count and share",
    per: "per visitor and day",
    formula: { num: "Visitors on the card", den: "Visitors on the first card", mult: "× 100" },
    caveat:
      "People who start from the landing page's question card skip the intro and land on the consent: they are left out of the consent's share (the query's from_landing_card).",
    tables: [
      {
        source: "production",
        table: "funnel_event",
        columns: "visitor_id, day, event_type",
        filters: "Period (day). No other filter.",
      },
    ],
    query: { lang: "SQL", text: CARDS },
    related: ["survey.wizContinue", "survey.wizExit"],
  },
  "survey.wizContinue": {
    label: "Continue",
    what: "Of the visitors on the card, the share who reached the next card that day.",
    good: "up",
    stat: "Share",
    per: "per visitor and day",
    formula: {
      num: "Visitors who reached the next card that day",
      den: "Visitors on the card",
      mult: "× 100",
    },
    caveat:
      "Skip intro on slide 4 lands on the consent too: that is a skip, not going on. Before the consent recorded itself (17 Oct 2026) its Continue is PostHog's: visits that pressed I agree over visits to the survey page.",
    tables: [
      {
        source: "production",
        table: "funnel_event",
        columns: "visitor_id, day, event_type, first_seen",
        filters: "Period (day). No other filter.",
      },
    ],
    query: { lang: "SQL", text: CARDS },
    related: ["survey.wizReached", "survey.introAgreed"],
  },
  "survey.wizSkip": {
    label: "Skip intro",
    what: "Of the visitors on the slide, the share who pressed Skip intro there. In red from 15%.",
    good: "down",
    stat: "Share",
    per: "per visitor and day",
    formula: {
      num: "Visitors who pressed Skip intro on the slide",
      den: "Visitors on the slide",
      mult: "× 100",
    },
    caveat: "Recorded from 17 Oct 2026. The intro and the consent have no Skip intro.",
    tables: [
      {
        source: "production",
        table: "funnel_event",
        columns: "visitor_id, day, event_type (intro_skip_1 to intro_skip_4)",
        filters: "Period (day). No other filter.",
      },
    ],
    query: { lang: "SQL", text: CARDS },
    related: ["survey.introSkipped", "survey.wizBack"],
  },
  "survey.wizBack": {
    label: "Back",
    what: "Of the visitors on the card, the share who went back from it before reaching question 1: the Back button, the arrow key, a swipe or the browser's Back.",
    good: "down",
    stat: "Share",
    per: "per visitor and day",
    formula: {
      num: "Visitors who went back from the card before reaching question 1 that day",
      den: "Visitors on the card",
      mult: "× 100",
    },
    caveat:
      "Recorded from 17 Oct 2026. Slide 1 and the consent have only the browser's Back; the intro has none. Someone who leaves the questions with the browser's Back passes back through every card in a second or two: those come after question 1 and aren't counted.",
    tables: [
      {
        source: "production",
        table: "funnel_event",
        columns: "visitor_id, day, event_type (intro_back_1 to intro_back_4, consent_back)",
        filters: "Period (day). No other filter.",
      },
    ],
    query: { lang: "SQL", text: CARDS },
    related: ["survey.wizSkip", "survey.wizExit"],
  },
  "survey.wizExit": {
    label: "Exit",
    what: "Of the visitors on the card, the share for whom it was the furthest card that day: they left the survey there. In red from 8%.",
    good: "down",
    stat: "Share",
    per: "per visitor and day",
    formula: {
      num: "Visitors whose furthest card that day was this one",
      den: "Visitors on the card",
      mult: "× 100",
    },
    caveat: "Recorded from 17 Oct 2026. Reaching question 1 is not an exit.",
    tables: [
      {
        source: "production",
        table: "funnel_event",
        columns: "visitor_id, day, event_type",
        filters: "Period (day). No other filter.",
      },
    ],
    query: { lang: "SQL", text: CARDS },
    related: ["survey.introLeft", "survey.wizContinue"],
  },
  "survey.wizEngagement": {
    label: "Engagement on card",
    what: "What people clicked on the card besides going on: the silhouette on the intro, the Trust Zone link on slide 3, Return to site and the terms links on the consent.",
    stat: "Share",
    per: "per PostHog visit to the survey page",
    formula: {
      num: "Visits that clicked it",
      den: "Visits to the survey page",
      mult: "× 100",
    },
    caveat:
      "PostHog's clicks for every range: it sees most visits, not people with a blocker. A share under 10% shows a tenth.",
    tables: [
      {
        source: "posthog",
        table: "events",
        columns: "$session_id, event, properties.$el_text, elements_chain",
        filters: "Period (timestamp). No other filter.",
      },
    ],
    query: { lang: "HogQL", text: INTRO_CLICKS },
    related: ["survey.wizard", "survey.introSaw"],
  },
};
