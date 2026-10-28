import { WIZARD_DRAWER } from "@features/survey/ui/wizard/wizardContent";
import { RETIRED_NAMES } from "@features/admin/ui/ap/retired-chapters";

import type { FieldDef, FieldRegistry, FieldTable } from "./types";

/** The live report's chapters in its own order (its nav), as the page places them. */
const LIVE_ORDER = WIZARD_DRAWER.flatMap((p) => p.rows.map((r) => r.id));

/*
 * The Report page's fields. Every query below was run read-only for 21 Sep – 20 Oct 2026 and
 * matched the page's own figure at period=30d (21 Oct 2026). `:from` and `:to` are the range's
 * first and last Berlin days (2026-09-21); `:team_visits` is the PostHog visits of the
 * team's own finished surveys (survey_submission.posthog_session_id of a team account).
 */

// ---- The building blocks the queries share --------------------------------------------------

/** The range's Berlin days, and the team's accounts. */
const RANGE = `b AS (
  SELECT (DATE ':from')::timestamp AT TIME ZONE 'Europe/Berlin' AS since_ts,
         (DATE ':to' + 1)::timestamp AT TIME ZONE 'Europe/Berlin' AS until_ts
),
staff AS (SELECT id FROM ap_team_user)`;

/** Finished surveys in the range: the team's own and our probes' left out. */
const FINISHED = `finished AS (
  SELECT s.id, s.created_date_time
    FROM survey_submission s
    CROSS JOIN b
    CROSS JOIN LATERAL (SELECT CASE WHEN pg_input_is_valid(s.utm_tracker, 'jsonb')
                                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                                    THEN s.utm_tracker::jsonb END AS j) t
   WHERE s.status = 'completed'
     AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
     AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
     AND lower(btrim(coalesce(t.j->>'utm_medium', ''))) <> 'probe'
     AND lower(btrim(coalesce(t.j->>'utm_source', ''))) NOT IN
         ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')
)`;

/** Their report visits and reading time, bots left out. */
const READING = `-- Report sessions, bots and the team's own left out; an end counts under 4 hours.
sessions AS (
  SELECT pr.survey_submission_id AS sid, rs.started_at, rs.ended_at,
         (rs.ended_at > rs.started_at AND rs.ended_at - rs.started_at < interval '4 hours') AS ended
    FROM report_session rs
    JOIN personal_report pr ON pr.id = rs.personal_report_id
   WHERE pr.survey_submission_id IN (SELECT id FROM finished)
     AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = rs.user_id)
     AND coalesce(rs.user_agent, '') !~* '(adsbot|headless|bot[/;) ]|crawler|spider|^curl/|^wget/|python-requests|go-http-client|okhttp|node-fetch|axios/)'
),
-- A session starting 30+ minutes after the latest end before it begins a new visit.
gaps AS (
  SELECT sid, started_at, ended_at, ended,
         started_at - max(CASE WHEN ended THEN ended_at ELSE started_at END)
           OVER (PARTITION BY sid ORDER BY started_at
                 ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS gap
    FROM sessions
),
reading AS (
  SELECT sid,
         count(*) FILTER (WHERE gap IS NULL OR gap >= interval '30 minutes') AS visits,
         min(started_at) FILTER (WHERE gap >= interval '30 minutes') AS returned_at,
         -- Each session counts up to 30 minutes: longer is mostly a tab left open.
         coalesce(sum(least(extract(epoch FROM ended_at - started_at), 1800) * 1000)
                    FILTER (WHERE ended), 0) AS read_ms,
         count(*) FILTER (WHERE ended) AS closed
    FROM gaps GROUP BY sid
)`;

/** Readers: a report visit, or else a sign the report was open. */
const READERS_CTE = `readers AS (
  SELECT f.id AS sid, coalesce(r.visits, 0) AS visits, r.returned_at,
         coalesce(r.read_ms, 0) AS read_ms, coalesce(r.closed, 0) AS closed
    FROM finished f
    LEFT JOIN reading r ON r.sid = f.id
   WHERE r.sid IS NOT NULL
      OR EXISTS (SELECT 1 FROM report_price_quote q WHERE q.survey_submission_id = f.id
                    AND (q.paywall_reached_at IS NOT NULL OR q.checkout_started_at IS NOT NULL))
      OR EXISTS (SELECT 1 FROM analytics_event a WHERE a.survey_submission_id = f.id
                    AND a.event_type = 'paywall_initiated'
                    AND coalesce(a.metadata->>'source', '') <> 'offer_link')
      OR EXISTS (SELECT 1 FROM payment p JOIN personal_report pr ON pr.id = p.personal_report_id
                  WHERE pr.survey_submission_id = f.id AND p.status = 'succeeded'
                    AND NOT coalesce(p.is_test, false) AND p.amount > 0)
)`;

const READERS = `WITH ${RANGE},
${FINISHED},
${READING},
${READERS_CTE}`;

/** Each finished survey's furthest wizard slide (0-5), whether it pressed Skip Intro and opened. */
const WIZARD_READERS = `${READERS},
slide AS (
  SELECT a.survey_submission_id AS sid,
         max(CASE WHEN (a.metadata->>'to_slide') ~ '^[0-5]$' THEN (a.metadata->>'to_slide')::int END)
           FILTER (WHERE a.metadata->>'direction' = 'next') AS furthest
    FROM analytics_event a
   WHERE a.event_type = 'wizard_slide_advanced' AND a.survey_submission_id IN (SELECT id FROM finished)
   GROUP BY 1
),
w AS (
  SELECT f.id AS sid, coalesce(sl.furthest, 0) AS furthest,
         EXISTS (SELECT 1 FROM readers r WHERE r.sid = f.id) AS opened,
         EXISTS (SELECT 1 FROM analytics_event a WHERE a.survey_submission_id = f.id
                    AND a.event_type = 'wizard_skipped') AS skipped
    FROM finished f LEFT JOIN slide sl ON sl.sid = f.id
)`;

/** The slides' readers shared out: went on, stopped having pressed Skip Intro, or left. */
const WIZARD_SLIDES = `${WIZARD_READERS},
here AS (
  SELECT g.n, w.*,
         CASE WHEN g.n < 5 THEN w.furthest > g.n ELSE w.opened END AS went_on
    FROM generate_series(0, 5) AS g(n)
    JOIN w ON g.n = 0 OR w.furthest >= g.n
)
SELECT n + 1 AS slide,
       count(*) AS reached,
       round(100.0 * count(*) / (SELECT count(*) FROM finished), 1) AS reached_pct,
       round(100.0 * count(*) FILTER (WHERE went_on) / count(*), 2) AS continue_pct,
       round(100.0 * count(*) FILTER (WHERE NOT went_on AND skipped) / count(*), 2) AS skip_pct,
       round(100.0 * count(*) FILTER (WHERE NOT went_on AND NOT skipped) / count(*), 2) AS exit_pct
  FROM here GROUP BY n ORDER BY n;`;

/** The slides' own events: time on a slide before going on, and going back. All traffic. */
const WIZARD_EVENTS = `WITH ${RANGE},
-- Everyone who finished sees slide 1 (the team's own left out).
finished AS (
  SELECT s.id, s.created_date_time FROM survey_submission s, b
   WHERE s.status = 'completed'
     AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
     AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
),
moves AS (
  SELECT a.survey_submission_id AS sid, a.event_time, a.metadata->>'direction' AS direction,
         CASE WHEN (a.metadata->>'from_slide') ~ '^[0-5]$' THEN (a.metadata->>'from_slide')::int END AS from_slide,
         CASE WHEN (a.metadata->>'to_slide') ~ '^[0-5]$' THEN (a.metadata->>'to_slide')::int END AS to_slide
    FROM analytics_event a
   WHERE a.event_type = 'wizard_slide_advanced' AND a.survey_submission_id IN (SELECT id FROM finished)
),
arrivals AS (
  SELECT id AS sid, 0 AS slide, created_date_time AS at FROM finished
  UNION ALL
  SELECT sid, to_slide, min(event_time) FROM moves
   WHERE direction = 'next' AND to_slide IS NOT NULL GROUP BY 1, 2
),
leaves AS (
  SELECT sid, from_slide AS slide, min(event_time) AS at FROM moves
   WHERE direction = 'next' AND from_slide IS NOT NULL GROUP BY 1, 2
),
-- From arriving on a slide to first going on from it, under 30 minutes.
dwell AS (
  SELECT l.slide, extract(epoch FROM l.at - a.at) * 1000 AS ms
    FROM leaves l JOIN arrivals a ON a.sid = l.sid AND a.slide = l.slide
   WHERE l.at > a.at AND l.at - a.at < interval '30 minutes'
)
SELECT g.n + 1 AS slide,
       (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY d.ms)) FROM dwell d WHERE d.slide = g.n) AS median_ms,
       (SELECT count(DISTINCT m.sid) FROM moves m WHERE m.direction = 'previous' AND m.from_slide = g.n) AS went_back
  FROM generate_series(0, 5) AS g(n)
 ORDER BY 1;`;

/** Reading per chapter (report_chapter_stats), for readers who finished from its first day. */
const CHAPTER_READING = `WITH ${RANGE},
finished AS (
  SELECT s.id FROM survey_submission s, b
   WHERE s.status = 'completed'
     AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
     AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
     AND s.created_date_time >= (SELECT (min(a.event_time) AT TIME ZONE 'Europe/Berlin')::date::timestamp
                                         AT TIME ZONE 'Europe/Berlin'
                                   FROM analytics_event a WHERE a.event_type = 'report_chapter_stats')
),
-- A reader's saves add up; up to 30 minutes per chapter.
per_chapter AS (
  SELECT a.survey_submission_id AS sid, c.key AS chapter,
         least(coalesce(sum(CASE WHEN c.value->>'ms' ~ '^[0-9]{1,8}$' THEN (c.value->>'ms')::int END), 0), 1800000) AS ms,
         bool_or(c.value->>'open' ~ '^[1-9][0-9]{0,5}$') AS opened,
         bool_or(c.value->>'show_all' ~ '^[1-9][0-9]{0,5}$') AS show_all,
         bool_or(c.value->>'learn_more' ~ '^[1-9][0-9]{0,5}$') AS learn_more,
         bool_or(c.value->>'try_this' ~ '^[1-9][0-9]{0,5}$') AS try_this,
         bool_or(c.value->>'pw_seen' ~ '^[1-9][0-9]{0,5}$') AS pw_seen,
         bool_or(c.value->>'pw_click' ~ '^[1-9][0-9]{0,5}$') AS pw_click
    FROM analytics_event a
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(a.metadata->'chapters') = 'object'
                                       THEN a.metadata->'chapters' ELSE '{}'::jsonb END) AS c
   WHERE a.event_type = 'report_chapter_stats'
     AND a.survey_submission_id IN (SELECT id FROM finished)
     AND jsonb_typeof(c.value) = 'object'
   GROUP BY 1, 2
),
-- Reached: a second or more on screen, or anything used in it (a paywall card only seen is not).
reached AS (
  SELECT * FROM per_chapter WHERE ms >= 1000 OR opened OR show_all OR learn_more OR try_this OR pw_click
)`;

const CHAPTERS = `${CHAPTER_READING},
-- Each chapter's readers; a control's rate is blank where nobody used it (or it has none).
rd AS (
  SELECT r.chapter,
         count(*) AS readers,
         round(100.0 * count(*) / (SELECT count(DISTINCT sid) FROM reached), 1) AS reach_pct,
         round(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.ms)) AS median_ms,
         round(100.0 * nullif(count(*) FILTER (WHERE r.show_all), 0) / count(*), 1) AS show_more_pct,
         round(100.0 * nullif(count(*) FILTER (WHERE r.learn_more), 0) / count(*), 1) AS learn_more_pct,
         round(100.0 * nullif(count(*) FILTER (WHERE r.try_this), 0) / count(*), 1) AS exercise_pct
    FROM reached r
   GROUP BY r.chapter
),
-- The paywall's rate is of everyone whose card came into view, reached or not.
pw AS (
  SELECT chapter, count(*) AS saw_paywall, count(*) FILTER (WHERE pw_click) AS clicked_paywall
    FROM per_chapter
   WHERE pw_seen
   GROUP BY chapter
),
-- Every live chapter (one nobody reached is 0%), and an earlier version's known chapter the
-- range recorded reading for (no other key a browser sends).
chapters (chapter) AS (
  VALUES ${LIVE_ORDER.map((id) => `('${id}')`).join(", ")}
  UNION
  SELECT chapter FROM per_chapter
   WHERE chapter IN (${Object.keys(RETIRED_NAMES)
     .map((id) => `'${id}'`)
     .join(", ")})
),
-- An earlier version's chapter is a share of the readers who read while it was in the report
-- (before the slimmed report went live, 22 Oct 2026, 18:48 Berlin).
before_slim AS (
  SELECT count(DISTINCT a.survey_submission_id) AS n
    FROM analytics_event a
   WHERE a.event_type = 'report_chapter_stats'
     AND a.event_time < TIMESTAMPTZ '2026-10-22 16:48:00+00'
     AND a.survey_submission_id IN (SELECT sid FROM reached)
)
SELECT c.chapter, coalesce(rd.readers, 0) AS readers,
       round(100.0 * coalesce(rd.readers, 0)
             / nullif(CASE WHEN c.chapter IN (${LIVE_ORDER.map((id) => `'${id}'`).join(", ")})
                           THEN (SELECT count(DISTINCT sid) FROM reached)
                           ELSE (SELECT n FROM before_slim) END, 0), 1) AS reach_pct,
       rd.median_ms, rd.show_more_pct, rd.learn_more_pct, rd.exercise_pct,
       coalesce(pw.saw_paywall, 0) AS saw_paywall, coalesce(pw.clicked_paywall, 0) AS clicked_paywall,
       round(100.0 * pw.clicked_paywall / pw.saw_paywall, 1) AS paywall_click_pct
  FROM chapters c
  LEFT JOIN rd ON rd.chapter = c.chapter
  LEFT JOIN pw ON pw.chapter = c.chapter
 ORDER BY readers DESC, chapter;`;

/** How far each reader got: the deepest of the live report's chapters reached, in its order. */
const DEPTH = `${READERS},
live (chapter, place) AS (
  VALUES ${LIVE_ORDER.map((id, i) => `('${id}', ${i + 1})`).join(",\n         ")}
),
chapter_start AS (
  SELECT (min(event_time) AT TIME ZONE 'Europe/Berlin')::date AS day
    FROM analytics_event WHERE event_type = 'report_chapter_stats'
),
per_chapter AS (
  SELECT a.survey_submission_id AS sid, c.key AS chapter,
         least(coalesce(sum(CASE WHEN c.value->>'ms' ~ '^[0-9]{1,8}$' THEN (c.value->>'ms')::int END), 0), 1800000) AS ms,
         bool_or(c.value->>'open' ~ '^[1-9][0-9]{0,5}$' OR c.value->>'show_all' ~ '^[1-9][0-9]{0,5}$'
                 OR c.value->>'learn_more' ~ '^[1-9][0-9]{0,5}$' OR c.value->>'try_this' ~ '^[1-9][0-9]{0,5}$'
                 OR c.value->>'pw_click' ~ '^[1-9][0-9]{0,5}$') AS used
    FROM analytics_event a
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(a.metadata->'chapters') = 'object'
                                       THEN a.metadata->'chapters' ELSE '{}'::jsonb END) AS c
   WHERE a.event_type = 'report_chapter_stats' AND jsonb_typeof(c.value) = 'object'
     AND a.survey_submission_id IN (SELECT f.id FROM finished f, chapter_start cs
                                     WHERE f.created_date_time >= cs.day::timestamp AT TIME ZONE 'Europe/Berlin')
   GROUP BY 1, 2
),
deepest AS (
  SELECT p.sid, max(l.place) AS place
    FROM per_chapter p JOIN live l ON l.chapter = p.chapter
   WHERE p.ms >= 1000 OR p.used
   GROUP BY p.sid
),
placed AS (
  SELECT 100.0 * d.place / ${LIVE_ORDER.length} AS pct,
         CASE WHEN r.closed = 0 THEN 'Time not recorded'
              WHEN r.read_ms < 60000 THEN '< 1 min' WHEN r.read_ms < 300000 THEN '1–5 min'
              WHEN r.read_ms < 600000 THEN '5–10 min' ELSE '10 min+' END AS reading_time
    FROM deepest d JOIN readers r ON r.sid = d.sid
)
SELECT CASE WHEN pct < 10 THEN '0–9%' WHEN pct < 25 THEN '10–24' WHEN pct < 50 THEN '25–49'
            WHEN pct < 75 THEN '50–74' WHEN pct < 95 THEN '75–94' ELSE '95–100' END AS band,
       reading_time, count(*) AS readers
  FROM placed GROUP BY 1, 2 ORDER BY 1, 2;`;

/** Each reader's first return, in Berlin calendar days after their first visit. */
const RETURN_DAYS = `${READERS},
firsts AS (
  SELECT r.sid, r.returned_at, (SELECT min(s.started_at) FROM sessions s WHERE s.sid = r.sid) AS first_at
    FROM readers r
),
days AS (
  SELECT sid, (returned_at AT TIME ZONE 'Europe/Berlin')::date
              - (first_at AT TIME ZONE 'Europe/Berlin')::date AS days
    FROM firsts WHERE returned_at IS NOT NULL
)`;

const RETURN_BANDS = `${RETURN_DAYS},
bands AS (
  SELECT r.sid, CASE WHEN d.days IS NULL THEN 'Not yet' WHEN d.days = 0 THEN 'Same day'
                     WHEN d.days = 1 THEN '1 day' WHEN d.days <= 3 THEN '2–3 days'
                     WHEN d.days <= 7 THEN '4–7 days' WHEN d.days <= 14 THEN '8–14 days'
                     WHEN d.days <= 30 THEN '15–30 days' ELSE 'Over 30 days' END AS band,
         d.days
    FROM readers r LEFT JOIN days d ON d.sid = r.sid
)
SELECT band, count(*) AS readers,
       round(100.0 * count(*) / (SELECT count(*) FROM readers), 1) AS in_this_band_pct,
       CASE WHEN band = 'Not yet' THEN NULL
            ELSE round(100.0 * (SELECT count(*) FROM bands x WHERE x.days <= max(b.days))
                       / (SELECT count(*) FROM readers), 1) END AS returned_by_then_pct
  FROM bands b
 GROUP BY band
 ORDER BY min(coalesce(days, 99999));`;

/** Readers whose reading was recorded, by their total time. */
const BUCKETS = `${READERS}
SELECT CASE WHEN read_ms < 60000 THEN '< 1 min' WHEN read_ms < 180000 THEN '1–3'
            WHEN read_ms < 300000 THEN '3–5' WHEN read_ms < 600000 THEN '5–10'
            WHEN read_ms < 1200000 THEN '10–20' ELSE '20+' END AS minutes,
       count(*) AS readers,
       round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
  FROM readers WHERE closed > 0
 GROUP BY 1 ORDER BY min(read_ms);`;

/** Reading time by the survey's own gender (15010) and age (15003) answers. */
const GROUPS = `${READERS},
answers AS (
  SELECT a.survey_submission_id AS sid,
         max(CASE WHEN sq.frontend_qid = '15010' THEN ao.option_text END) AS gender,
         max(CASE WHEN sq.frontend_qid = '15003' THEN ao.option_text END) AS age
    FROM survey_submission_answer a
    JOIN survey_question sq ON sq.id = a.survey_question_id AND sq.frontend_qid IN ('15010', '15003')
    LEFT JOIN answer_option ao ON ao.id = a.answer_option_id
   WHERE a.survey_submission_id IN (SELECT sid FROM readers)
   GROUP BY 1
),
who AS (
  -- The survey's own answer; the profile (a person's latest) only where the survey has none.
  SELECT r.read_ms,
         CASE coalesce(x.gender, up.gender) WHEN 'Woman' THEN 'Women' WHEN 'Man' THEN 'Men'
              WHEN 'Nonbinary' THEN 'Non-binary' WHEN 'Other' THEN 'Other' ELSE 'Not stated' END AS gender,
         CASE WHEN x.age IN ('55–64', '65+') THEN '55+' ELSE coalesce(x.age, 'Not stated') END AS age
    FROM readers r
    JOIN survey_submission s ON s.id = r.sid
    LEFT JOIN app_user u ON u.id = s.user_id
    LEFT JOIN user_profile up ON up.id = u.user_profile_id
    LEFT JOIN answers x ON x.sid = r.sid
   WHERE r.closed > 0
)`;

const BY_GENDER = `${GROUPS}
SELECT gender, count(*) AS readers,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY read_ms) AS median_ms, round(avg(read_ms)) AS avg_ms
  FROM who GROUP BY gender ORDER BY readers DESC;`;

const BY_AGE = `${GROUPS}
SELECT age, count(*) AS readers,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY read_ms) AS median_ms, round(avg(read_ms)) AS avg_ms
  FROM who GROUP BY age ORDER BY age;`;

/** Every nurture email stage's sends in the range, and what they led to. */
const CAMPAIGNS = `WITH ${RANGE},
-- Each reader's nurture emails, whenever sent: dated by the email's promo code (made 24 hours
-- before it expires), else estimated from the report's time and the stage's delay.
all_sends AS (
  SELECT st.stage, q.survey_submission_id AS sid,
         min(coalesce((q.metadata->'nurturePromoCodes'->st.stage->>'expiresAt')::timestamptz - interval '24 hours',
                      pr.created_date_time + CASE st.stage WHEN '6h_no_view' THEN interval '6 hours'
                                                           WHEN '6h_no_unlock' THEN interval '6 hours'
                                                           WHEN '30h_no_unlock' THEN interval '30 hours'
                                                           WHEN '54h_no_unlock' THEN interval '54 hours'
                                                           WHEN '72h_no_unlock' THEN interval '72 hours'
                                                           WHEN '78h_no_unlock' THEN interval '78 hours' END)) AS sent_at
    FROM report_price_quote q
    JOIN personal_report pr ON pr.id = q.personal_report_id
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(q.metadata->'nurtureEmailsSent') = 'array'
           THEN q.metadata->'nurtureEmailsSent' ELSE '[]'::jsonb END) AS st(stage)
   GROUP BY 1, 2
),
-- Sent in the range; with the reader's next email that had a report link (the 78h call invite
-- linked only to the booking page).
sends AS (
  SELECT x.*, (SELECT min(y.sent_at) FROM all_sends y
                WHERE y.sid = x.sid AND y.sent_at > x.sent_at AND y.stage <> '78h_no_unlock') AS next_at
    FROM all_sends x, b
   WHERE x.sent_at >= b.since_ts AND x.sent_at < b.until_ts
     AND NOT EXISTS (SELECT 1 FROM survey_submission s JOIN staff ON staff.id = s.user_id WHERE s.id = x.sid)
),
-- Resend's events for each email, by the stage and survey it was sent for (opens and clicks
-- only of emails reported delivered).
events AS (
  SELECT se.stage, se.sid, m.event_type, m.first_at,
         EXISTS (SELECT 1 FROM email_message_event d WHERE d.resend_id = m.resend_id AND d.event_type = 'delivered') AS delivered
    FROM sends se
    JOIN email_message_event m ON m.survey_submission_id = se.sid AND m.stage = se.stage AND m.first_at >= se.sent_at
),
bought AS (
  SELECT coalesce(p.metadata->>'promoStage',
                  CASE p.metadata->>'couponName' WHEN 'Nurture 50% off (30h reminder)' THEN '30h_no_unlock'
                                                 WHEN 'Nurture 75% off (54h reminder)' THEN '54h_no_unlock' END) AS stage,
         count(*) AS n
    FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
    JOIN survey_submission s ON s.id = pr.survey_submission_id, b
   WHERE p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
     AND coalesce(p.payment_date_time, p.created_date_time) >= b.since_ts
     AND coalesce(p.payment_date_time, p.created_date_time) < b.until_ts
     AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
   GROUP BY 1
)
SELECT st.stage,
       (SELECT count(DISTINCT sid) FROM sends WHERE stage = st.stage) AS sent,
       (SELECT count(DISTINCT sid) FROM events WHERE stage = st.stage AND event_type = 'delivered') AS delivered,
       (SELECT count(DISTINCT sid) FROM events WHERE stage = st.stage AND event_type = 'opened' AND delivered) AS opened,
       (SELECT count(DISTINCT sid) FROM events WHERE stage = st.stage AND event_type = 'clicked' AND delivered) AS clicked,
       -- Came back through the email's offer link after it was sent, before their next email.
       (SELECT count(DISTINCT se.sid) FROM sends se
         WHERE se.stage = st.stage AND EXISTS (
           SELECT 1 FROM analytics_event a
            WHERE a.survey_submission_id = se.sid AND a.event_type = 'paywall_initiated'
              AND a.metadata->>'source' = 'offer_link' AND a.event_time >= se.sent_at
              AND (se.next_at IS NULL OR a.event_time < se.next_at))) AS returned,
       coalesce((SELECT n FROM bought WHERE bought.stage = st.stage), 0) AS purchased
  FROM (VALUES ('72h_no_unlock'), ('54h_no_unlock'), ('30h_no_unlock'), ('6h_no_view'), ('78h_no_unlock')) AS st(stage);`;

/** Every chapter vote of all time, the team's own left out. */
const VOTES = `WITH staff AS (SELECT id FROM ap_team_user),
votes AS (
  SELECT f.* FROM report_section_feedback f
   WHERE NOT EXISTS (SELECT 1 FROM survey_submission s JOIN staff ON staff.id = s.user_id
                      WHERE s.id = f.survey_submission_id)
)`;

/** PostHog's report page views, the team's own people left out. */
const PH_REPORT_VIEWS = `event = '$pageview' AND properties.$host = 'www.loveiq.org'
             AND properties.$pathname LIKE '/report/%'
             AND person_id NOT IN (SELECT person_id FROM events
                                    WHERE $session_id IN :team_visits
                                      AND timestamp >= toDateTime('2026-08-23 00:00:00', 'UTC'))`;

/** Report visits 30+ minutes after a person's first, by the first page's link. */
const RETURN_WAYS = `SELECT cls AS came_back_through, count() AS visits FROM (
  SELECT multiIf((s.url LIKE '%utm_source=email%' OR s.url LIKE '%from=email%') AND s.url LIKE '%utm_campaign=%', 'Email campaign',
                 s.url LIKE '%utm_source=email%' OR s.url LIKE '%from=email%', 'Report or invite email',
                 s.url LIKE '%share%', 'Share link from a friend',
                 s.url LIKE '%utm_%' OR s.url LIKE '%gclid%', 'Other',
                 'Bookmark / direct') AS cls,
         s.t AS t, f.first_t AS first_t
    FROM (SELECT $session_id AS session, person_id AS pid, min(timestamp) AS t,
                 argMin(properties.$current_url, timestamp) AS url
            FROM events
           WHERE ${PH_REPORT_VIEWS}
             AND timestamp < toDateTime(':to 00:00:00', 'Europe/Berlin') + INTERVAL 1 DAY
           GROUP BY session, pid) AS s
    JOIN (SELECT person_id AS pid, min(timestamp) AS first_t
            FROM events
           WHERE ${PH_REPORT_VIEWS}
           GROUP BY pid) AS f ON s.pid = f.pid
)
WHERE t >= toDateTime(':from 00:00:00', 'Europe/Berlin') AND t > first_t + INTERVAL 30 MINUTE
GROUP BY came_back_through
ORDER BY visits DESC
LIMIT 10`;

// ---- The tables the fields read -------------------------------------------------------------

const SUBS: FieldTable = {
  source: "production",
  table: "survey_submission",
  columns: "id, status, created_date_time, user_id, utm_tracker",
  filters:
    "Period: created_date_time (the Berlin day the survey was finished). Source: utm_tracker's tags. Device and tier: the reader's own price quotes (report_price_quote), else the survey's steps. Visitor: whether PostHog first saw the person in the visit the survey was finished in.",
  watch:
    "Finished surveys only (status completed). The team's own (an @loveiq.org account, or one that used the team's test code) and our test runs (utm_medium probe, verification sources) are left out.",
};
const SESSIONS: FieldTable = {
  source: "production",
  table: "report_session",
  columns: "personal_report_id, started_at, ended_at, user_agent, user_id",
  filters:
    "None of its own: each session follows its reader's finished survey (through personal_report).",
  watch:
    "Bots and Google's ad crawler are left out by their user agent. Not every session records its end (a tab closed or put away sends none): about seven in ten did in the last 30 days, far fewer further back, and for everyone only from 18 Sep 2026.",
};
const REPORTS: FieldTable = {
  source: "production",
  table: "personal_report",
  columns: "id, survey_submission_id, created_date_time",
  filters: "None: it ties a report to its finished survey.",
};
const OPEN_SIGNS: FieldTable = {
  source: "production",
  table: "report_price_quote",
  columns: "survey_submission_id, paywall_reached_at, checkout_started_at",
  filters:
    "None: the paywall seen or a checkout marks a report as opened where no session was recorded.",
};
const PAYWALL_CLICKS: FieldTable = {
  source: "production",
  table: "analytics_event",
  columns: "survey_submission_id, event_type (paywall_initiated), metadata.source",
  filters: "Through the reader's finished survey (survey_submission_id).",
  watch:
    "An arrival from a nurture email's offer link is recorded as paywall_initiated too, with source offer_link: not a click on the page.",
};
const WIZARD_EVENTS_T: FieldTable = {
  source: "production",
  table: "analytics_event",
  columns:
    "survey_submission_id, event_type (wizard_slide_advanced, wizard_skipped), event_time, metadata.from_slide, metadata.to_slide, metadata.direction",
  filters:
    "Through the reader's finished survey for Reached, Continue, Skip intro and Exit; none for Back and Median time (all traffic).",
  watch:
    "Recorded for everyone from 18 Sep 2026 (before, only with cookie consent); Skip Intro (wizard_skipped) from 16 Oct 2026.",
};
const CHAPTER_STATS_T: FieldTable = {
  source: "production",
  table: "analytics_event",
  columns: "survey_submission_id, event_type (report_chapter_stats), metadata.chapters",
  filters:
    "Summed per chapter over every reader; where a figure follows the source, device, tier or visitor filter (How far into the report readers got), only the readers in it.",
  watch:
    "From 16 Oct 2026, for readers who finished from that day. One row per save, holding only what changed since the save before, so a reader's rows add up.",
};
const PAYMENTS: FieldTable = {
  source: "production",
  table: "payment",
  columns:
    "personal_report_id, status, is_test, amount, metadata.plan, payment_date_time, created_date_time",
  filters:
    "Through the reader's finished survey (personal_report); an email's purchases by the day they were paid (payment_date_time, else created_date_time).",
  watch: "Real payments only: status succeeded, not a test, over €0.",
};
const VOTES_T: FieldTable = {
  source: "production",
  table: "report_section_feedback",
  columns: "section_id, feedback, issue, comment, created_at, survey_submission_id",
  filters: "None: every vote since voting began (all time, all traffic), whatever the filters.",
  watch:
    "Votes on the team's own surveys are left out. One vote per reader and chapter; a changed vote keeps its first time.",
};
const NURTURE_T: FieldTable = {
  source: "production",
  table: "report_price_quote",
  columns:
    "survey_submission_id, personal_report_id, metadata.nurtureEmailsSent, metadata.nurturePromoCodes",
  filters: "None (all traffic): the sends carry no source, device or tier.",
  watch:
    "A send is marked just before sending, so a failed one still counts. The 6 h and 78 h stages had no promo code to date them: their send times are estimated.",
};
const RESEND_T: FieldTable = {
  source: "production",
  table: "email_message_event",
  columns: "resend_id, survey_submission_id, stage, event_type, first_at",
  filters: "None (all traffic).",
  watch: "Kept from 16 Oct 2026, opens once open tracking was switched on.",
};
const PH_VIEWS: FieldTable = {
  source: "posthog",
  table: "events",
  columns:
    "event ($pageview), properties.$pathname, properties.$current_url, $session_id, person_id, timestamp",
  filters:
    "Period only (the visit's time): PostHog's views carry no tier or survey, so the other filters don't apply.",
  watch:
    "PostHog sees part of the visitors (blockers, no consent) and starts on 23 Aug 2026. The team's own people are left out.",
};

// ---- The fields ----------------------------------------------------------------------------

const SAME_AGE =
  " The change compares with the period before, its readers read as they stood at the same age.";
const EVENTS_FROM =
  " Before 18 Sep 2026 this was recorded only for readers who accepted cookies, so an earlier range reads low and is not compared.";
const READ_TIME_RULES =
  "Only report visits whose end was recorded count (about seven in ten lately, far fewer further back, and for everyone only from 18 Sep 2026); a visit of 4 hours or more counts nothing, and each counts at most 30 minutes, as a tab left open is not reading. Readers with no recorded end are left out, so it is over fewer readers than Reports opened.";
const WIZARD_SHARE =
  "Continue, Skip intro and Exit share the slide's readers out between them, so they add up to 100%; Back is counted on its own.";
const POSTHOG_RETURNS =
  "PostHog sees only part of the visitors and starts on 23 Aug 2026: a range from before reads —. A return visit is a report visit starting 30 minutes or more after the person's first one. All traffic: the source, device, tier and visitor filters don't apply. The team's own people (the PostHog visits of their finished surveys) are left out.";

const opened: FieldDef = {
  label: "Reports opened",
  what: "How many of the surveys finished in this range had their report opened at least once (a person who finished twice counts twice). Every reader figure on this page is about them.",
  good: "up",
  stat: "Count",
  per: "per finished survey (each has one report)",
  formula: { num: "Finished surveys whose report was opened" },
  caveat:
    "Opened means a report visit was recorded, or where none was, a sign the report was open: the paywall seen or clicked, a checkout or a payment. Bots, Google's ad crawler (which reopened hundreds of report links), the team's own surveys and our test runs are left out." +
    SAME_AGE,
  tables: [SUBS, SESSIONS, REPORTS, OPEN_SIGNS, PAYWALL_CLICKS, PAYMENTS],
  query: { lang: "SQL", text: `${READERS}\nSELECT count(*) AS reports_opened FROM readers;` },
  related: ["report.intro", "report.time_readers", "report.returned"],
};

const readers = (num: string, exists: string, onSaleFrom?: string): string =>
  `${READERS}
SELECT count(*) FILTER (WHERE EXISTS (${exists})) AS ${num},
       count(*) AS readers,
       ${
         onSaleFrom
           ? `-- Blank for a range starting before ${onSaleFrom}, its first whole day on sale.
       CASE WHEN :from >= DATE '${onSaleFrom}' THEN round(100.0 * count(*) FILTER (WHERE EXISTS (${exists})) / count(*), 2) END`
           : `round(100.0 * count(*) FILTER (WHERE EXISTS (${exists})) / count(*), 2)`
       } AS pct
  FROM readers;`;

/**
 * The guided tour as ap_report_tour reads it: the auto-started runs of the range's finishers
 * (the team's left out), each end (completed, skipped, left the page) placed on the stops it
 * reached when every stop it names is known. 'free' readers have 5 stops, 'paid' 4.
 */
const TOUR = `WITH b AS (
  SELECT (:from::date::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
         ((:to::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
),
subs AS (
  SELECT s.id FROM survey_submission s, b
   WHERE s.status = 'completed'
     AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
     AND NOT EXISTS (SELECT 1 FROM ap_team_user t WHERE t.id = s.user_id)
),
ev AS (
  SELECT a.id, a.survey_submission_id AS sid, a.event_type, a.metadata->>'audience' AS audience,
         CASE WHEN jsonb_typeof(a.metadata->'stops') = 'array' THEN a.metadata->'stops' ELSE '[]'::jsonb END AS stops
    FROM analytics_event a
   WHERE a.event_type IN ('tour_started', 'tour_completed', 'tour_skipped', 'tour_left')
     AND a.metadata->>'trigger' = 'auto' AND a.metadata->>'audience' IN ('free', 'paid')
     AND a.survey_submission_id IN (SELECT id FROM subs)
),
by_reader AS (
  SELECT sid, audience,
         count(*) FILTER (WHERE event_type = 'tour_started') AS started,
         count(*) FILTER (WHERE event_type = 'tour_completed') AS completed,
         count(*) FILTER (WHERE event_type = 'tour_skipped') AS skipped,
         count(*) FILTER (WHERE event_type = 'tour_left') AS left_page
    FROM ev GROUP BY 1, 2
),
-- An end is placed on its stops only when every stop it names is known with whole numbers.
ends AS (
  SELECT e.id, e.audience, e.event_type, e.stops FROM ev e
   WHERE e.event_type <> 'tour_started' AND jsonb_array_length(e.stops) BETWEEN 1 AND 5
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(e.stops) x
                      WHERE coalesce(x->>'id', '') NOT IN ('chapter_menu', 'show_all', 'chapter_toggle', 'try_this', 'unlock')
                         OR coalesce(x->>'ms', '') !~ '^[0-9]{1,10}$' OR coalesce(x->>'back', '') !~ '^[0-9]{1,4}$')
),
placed AS (
  SELECT en.audience, en.event_type, x.value->>'id' AS stop, (x.value->>'ms')::bigint AS ms,
         (x.value->>'back')::int AS back, x.ord = jsonb_array_length(en.stops) AS furthest
    FROM ends en CROSS JOIN LATERAL jsonb_array_elements(en.stops) WITH ORDINALITY AS x(value, ord)
)`;

/** The tiles: per audience, its readers, runs and how the runs ended. */
const TOUR_TILES = `${TOUR}
SELECT audience, count(*) AS readers,
       sum(greatest(started, completed + skipped + left_page)) AS runs,
       sum(completed) AS completed, sum(skipped) AS skipped,
       -- A run with no end stored left too, at no stop.
       sum(left_page) + sum(greatest(0, started - completed - skipped - left_page)) AS left_tour,
       round(100.0 * sum(completed) / nullif(sum(greatest(started, completed + skipped + left_page)), 0), 1) AS completed_pct,
       round(100.0 * sum(skipped) / nullif(sum(greatest(started, completed + skipped + left_page)), 0), 1) AS skipped_pct,
       round(100.0 * (sum(left_page) + sum(greatest(0, started - completed - skipped - left_page)))
             / nullif(sum(greatest(started, completed + skipped + left_page)), 0), 1) AS left_pct
  FROM by_reader
 -- Recorded from 23 Oct 2026: a range starting earlier is blank, as on the page.
 WHERE :from::date >= DATE '2026-10-23'
 GROUP BY audience ORDER BY audience;`;

/** The stops: per audience and stop, the placed runs that reached it and what they did there. */
const TOUR_STOPS = `${TOUR}
SELECT p.audience, p.stop, count(*) AS reached,
       round(100.0 * count(*) / (SELECT count(*) FROM ends en WHERE en.audience = p.audience), 1) AS reached_pct,
       count(*) FILTER (WHERE NOT p.furthest OR p.event_type = 'tour_completed') AS went_on,
       count(*) FILTER (WHERE p.back > 0) AS went_back,
       count(*) FILTER (WHERE p.furthest AND p.event_type = 'tour_skipped') AS skipped,
       count(*) FILTER (WHERE p.furthest AND p.event_type = 'tour_left') AS exited,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY p.ms) FILTER (WHERE p.ms > 0 AND p.ms < 1800000)) AS median_ms
  FROM placed p
 -- Recorded from 23 Oct 2026: a range starting earlier is blank, as on the page.
 WHERE :from::date >= DATE '2026-10-23'
 GROUP BY p.audience, p.stop ORDER BY p.audience, p.stop;`;

const TOUR_EVENTS: FieldTable = {
  source: "production",
  table: "analytics_event",
  columns:
    "survey_submission_id, event_type (tour_started, tour_completed, tour_skipped, tour_left), metadata (trigger, audience, stops: id, ms, back)",
  filters: "Period (the finisher's survey day); the tour that started on its own (trigger auto).",
};
const TOUR_CAVEAT =
  "Recorded from 23 Oct 2026. All traffic: the tour's records carry no funnel, source, device, tier or visitor, so the filters don't narrow it. Pick Free or Paid readers above: each has its own figures.";

const tourField = (
  label: string,
  what: string,
  num: string,
  den: string | null,
  text: string,
  good?: "up" | "down",
  stat?: string,
  per?: string
): FieldDef => ({
  label,
  what,
  ...(good ? { good } : {}),
  stat: stat ?? (den ? "Share" : "Count"),
  per: per ?? (den ? "per tour run" : "per reader"),
  formula: den ? { num, den, mult: "× 100" } : { num },
  caveat: TOUR_CAVEAT,
  tables: [SUBS, TOUR_EVENTS],
  query: { lang: "SQL", text },
  related: ["report.tour-started", "report.tour-completed", "report.tour-reached"],
});

export const fields: FieldRegistry = {
  "report.tour-started": tourField(
    "Tour started",
    "Readers whose guided tour started on its own when they first opened their report. The section's note (How these are counted) gives it as a share of every reader who opened their report in the range (the Report readers figure, all traffic), free and paid together on each tab: a run's audience is recorded, an opener's isn't.",
    "Readers whose tour started",
    null,
    TOUR_TILES,
    "up"
  ),
  "report.tour-completed": tourField(
    "Completed",
    "Of the tour's runs, the share that went through every stop to the end.",
    "Runs completed",
    "Tour runs",
    TOUR_TILES,
    "up"
  ),
  "report.tour-skipped": tourField(
    "Skipped tour",
    "Of the tour's runs, the share where the reader pressed Skip tour.",
    "Runs skipped",
    "Tour runs",
    TOUR_TILES,
    "down"
  ),
  "report.tour-left": tourField(
    "Left the tour / bounced",
    "Of the tour's runs, the share that ended with the reader leaving the page, or with no end recorded.",
    "Runs left (and runs with no end recorded)",
    "Tour runs",
    TOUR_TILES,
    "down"
  ),
  "report.tour-time": tourField(
    "Time",
    "How long readers stay on a stop: half quicker, half slower.",
    "Time on the stop (median), stays under 30 minutes",
    null,
    TOUR_STOPS,
    undefined,
    "Median",
    "per stay on the stop"
  ),
  "report.tour-reached": tourField(
    "Reached",
    "Of the runs placed on the stops, the share that got to this stop.",
    "Placed runs that reached the stop",
    "Placed runs (an end whose stops are all known)",
    TOUR_STOPS,
    "up"
  ),
  "report.tour-next": tourField(
    "Next",
    "Of the runs at this stop, the share that went on (on the last stop: finished).",
    "Runs that went on from the stop",
    "Runs that reached the stop",
    TOUR_STOPS,
    "up"
  ),
  "report.tour-back": tourField(
    "Back",
    "Of the runs at this stop, the share that pressed Back here.",
    "Runs that went back from the stop",
    "Runs that reached the stop",
    TOUR_STOPS
  ),
  "report.tour-skip": tourField(
    "Skip tour",
    "Of the runs at this stop, the share that skipped the tour here.",
    "Runs skipped at the stop",
    "Runs that reached the stop",
    TOUR_STOPS,
    "down"
  ),
  "report.tour-exit": tourField(
    "Exit",
    "Of the runs at this stop, the share that left the page here.",
    "Runs that left at the stop",
    "Runs that reached the stop",
    TOUR_STOPS,
    "down"
  ),

  "report.opened": opened,
  "report.read": {
    label: "Avg. read time",
    what: "The average total time a reader spent reading their report, over all their visits. Read it beside the median: a few very long reads pull the average up.",
    good: "up",
    stat: "Average",
    per: "per reader (whose reading time was recorded)",
    formula: {
      num: "Total reading time of the readers whose time was recorded",
      den: "Readers whose reading time was recorded",
    },
    caveat: `${READ_TIME_RULES} A range before 18 Sep 2026 is not compared.`,
    tables: [SUBS, SESSIONS, REPORTS],
    query: {
      lang: "SQL",
      text: `${READERS}\nSELECT round(avg(read_ms)) AS avg_ms, sum(read_ms) AS total_ms, count(*) AS readers\n  FROM readers WHERE closed > 0;`,
    },
    related: ["report.median", "report.time_avg", "report.time_session"],
  },
  "report.median": {
    label: "Median read time",
    what: "The total reading time of the middle reader: half read longer, half shorter. Steadier than the average, as a few very long reads don't move it.",
    good: "up",
    stat: "Median",
    per: "per reader (whose reading time was recorded)",
    formula: { num: "The middle value of the readers' total reading times" },
    caveat: `${READ_TIME_RULES} A range before 18 Sep 2026 is not compared.`,
    tables: [SUBS, SESSIONS, REPORTS],
    query: {
      lang: "SQL",
      text: `${READERS}\nSELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY read_ms) AS median_ms, count(*) AS readers\n  FROM readers WHERE closed > 0;`,
    },
    related: ["report.read", "report.time_median", "report.time_buckets"],
  },
  "report.returned": {
    label: "Returned",
    what: "The share of readers who came back to their report on a later visit: a sign it was worth a second look.",
    good: "up",
    stat: "Share",
    per: "per reader",
    formula: { num: "Readers who came back", den: "Readers (reports opened)", mult: "× 100" },
    caveat:
      "Coming back means a report visit that starts 30 minutes or more after the previous one ended: a reload, a second tab or a quick reopen is the same visit. Bots are left out (Google's ad crawler reopened report links days later). Visit ends are recorded for everyone only from 18 Sep 2026, so an earlier range is not compared.",
    tables: [SUBS, SESSIONS, REPORTS],
    query: {
      lang: "SQL",
      text: `${READERS}
SELECT count(*) FILTER (WHERE returned_at IS NOT NULL) AS came_back, count(*) AS readers,
       round(100.0 * count(*) FILTER (WHERE returned_at IS NOT NULL) / count(*), 2) AS pct
  FROM readers;`,
    },
    related: ["report.came_back", "report.return_days", "report.sessions_per_reader"],
  },
  "report.initiated": {
    label: "Paywall initiated",
    what: "The share of readers who clicked a button to unlock the full report (a paywall or lock button): the first step towards a purchase.",
    good: "up",
    stat: "Share",
    per: "per reader",
    formula: { num: "Readers who clicked a paywall button", den: "Readers", mult: "× 100" },
    caveat:
      "Once per reader, however many clicks. Arriving from a nurture email's offer link is recorded the same way but is not a click on the page, so it is left out." +
      EVENTS_FROM,
    tables: [SUBS, PAYWALL_CLICKS],
    query: {
      lang: "SQL",
      text: readers(
        "clicked",
        `SELECT 1 FROM analytics_event a WHERE a.survey_submission_id = readers.sid
                    AND a.event_type = 'paywall_initiated' AND coalesce(a.metadata->>'source', '') <> 'offer_link'`
      ),
    },
    related: ["report.chapter_paywall", "report.full"],
  },
  "report.share": {
    label: "Share rate",
    what: "The share of readers who shared their report with someone. A shared report can bring in new people.",
    good: "up",
    stat: "Share",
    per: "per reader",
    formula: { num: "Readers who shared their report", den: "Readers", mult: "× 100" },
    caveat:
      "A share made at any time up to now counts, so a recent range has had less time." + SAME_AGE,
    tables: [
      SUBS,
      {
        source: "production",
        table: "report_share",
        columns: "personal_report_id, created_at",
        filters: "Through the reader's report (personal_report).",
      },
    ],
    query: {
      lang: "SQL",
      text: readers(
        "shared",
        `SELECT 1 FROM report_share x JOIN personal_report pr ON pr.id = x.personal_report_id
                    WHERE pr.survey_submission_id = readers.sid`
      ),
    },
    related: ["report.invite", "report.rating"],
  },
  "report.rating": {
    label: "Rating rate",
    what: "The share of readers who rated at least one chapter, good or bad: how many readers engage with the chapters.",
    good: "up",
    stat: "Share",
    per: "per reader",
    formula: { num: "Readers who rated a chapter", den: "Readers", mult: "× 100" },
    caveat:
      "This range's readers, with their votes at any time since. The Feedback section counts every vote of all time instead." +
      SAME_AGE,
    tables: [
      SUBS,
      { ...VOTES_T, filters: "Through the reader's finished survey (survey_submission_id)." },
    ],
    query: {
      lang: "SQL",
      text: readers(
        "rated",
        `SELECT 1 FROM report_section_feedback v WHERE v.survey_submission_id = readers.sid`
      ),
    },
    related: ["report.feedback_good", "report.chapter_feedback"],
  },
  "report.invite": {
    label: "Invite rate",
    what: "The share of readers who invited a friend to take the survey.",
    good: "up",
    stat: "Share",
    per: "per reader",
    formula: { num: "Readers who invited a friend", den: "Readers", mult: "× 100" },
    caveat:
      "An invite is matched to the reader by their email address, from the moment they finished." +
      EVENTS_FROM,
    tables: [
      SUBS,
      {
        source: "production",
        table: "invite_event",
        columns: "referrer_email, created_at",
        filters: "Through the reader's email address (app_user.email).",
      },
    ],
    query: {
      lang: "SQL",
      text: readers(
        "invited",
        `SELECT 1 FROM survey_submission s JOIN app_user u ON u.id = s.user_id
                    JOIN invite_event i ON lower(i.referrer_email) = lower(u.email)
                   WHERE s.id = readers.sid AND i.created_at >= s.created_date_time`
      ),
    },
    related: ["report.share"],
  },
  "report.pre": {
    label: "Pre unlock rate",
    what: "The share of readers whose Core Archetype was pre-unlocked (the €1.99 Initial plan), at any time so far.",
    good: "up",
    stat: "Share",
    per: "per reader",
    formula: { num: "Readers who bought the Initial plan", den: "Readers", mult: "× 100" },
    caveat:
      "On sale from the evening of 22 Oct 2026 on pay to start's €1.99 page (counted from 23 Oct, its first whole day; a range starting earlier is blank, never 0), and from 27 Oct 2026 also on the report's own €1.99 gate. Real payments only (succeeded, not a test, over €0): E07's €0 gift doesn't count." +
      SAME_AGE,
    tables: [SUBS, PAYMENTS],
    query: {
      lang: "SQL",
      text: readers(
        "pre_unlock",
        `SELECT 1 FROM payment p JOIN personal_report pr ON pr.id = p.personal_report_id
                   WHERE pr.survey_submission_id = readers.sid AND p.status = 'succeeded'
                     AND NOT coalesce(p.is_test, false) AND p.amount > 0
                     AND p.metadata->>'plan' = 'initial'`,
        "2026-10-23"
      ),
    },
    related: ["report.full"],
  },
  "report.full": {
    label: "Full unlock rate",
    what: "The share of readers who bought a full unlock (Full, Full All or Core), first or as an upgrade from Essentials.",
    good: "up",
    stat: "Share",
    per: "per reader",
    formula: { num: "Readers with a full unlock purchase", den: "Readers", mult: "× 100" },
    caveat:
      "Real payments only (succeeded, not a test, over €0): free unlocks don't count. A purchase made at any time up to now counts." +
      SAME_AGE,
    tables: [SUBS, PAYMENTS],
    query: {
      lang: "SQL",
      text: readers(
        "full_unlock",
        `SELECT 1 FROM payment p JOIN personal_report pr ON pr.id = p.personal_report_id
                   WHERE pr.survey_submission_id = readers.sid AND p.status = 'succeeded'
                     AND NOT coalesce(p.is_test, false) AND p.amount > 0
                     AND p.metadata->>'plan' IN ('full_report', 'all_reports', 'core')`
      ),
    },
    related: ["report.initiated", "report.pre"],
  },

  // The intro wizard
  "report.intro": {
    label: "Intro started",
    what: "Everyone who finished the survey in the range: the intro wizard opens for each of them before their report.",
    good: "up",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Finished surveys" },
    caveat: "The team's own surveys and our test runs are left out." + SAME_AGE,
    tables: [SUBS],
    query: { lang: "SQL", text: `${READERS}\nSELECT count(*) AS intro_started FROM finished;` },
    related: ["report.completed", "report.left", "report.opened"],
  },
  "report.completed": {
    label: "Completed",
    what: "Of those who started the intro, the share who went through all six slides and then opened their report.",
    good: "up",
    stat: "Share",
    per: "per finished survey",
    formula: {
      num: "Reached slide 6 and opened the report",
      den: "Finished surveys (intro started)",
      mult: "× 100",
    },
    caveat:
      "A slide is known from the wizard's own events." +
      EVENTS_FROM +
      " A reader who pressed Skip Intro on slide 6 opened the report, so counts here.",
    tables: [SUBS, WIZARD_EVENTS_T],
    query: {
      lang: "SQL",
      text: `${WIZARD_READERS}
SELECT count(*) FILTER (WHERE opened AND furthest >= 5) AS completed, count(*) AS started,
       round(100.0 * count(*) FILTER (WHERE opened AND furthest >= 5) / count(*), 2) AS pct
  FROM w;`,
    },
    related: ["report.intro", "report.wizard_continue"],
  },
  "report.skipped": {
    label: "Skipped intro",
    what: "Readers who pressed Skip Intro to go straight to their report. A share of those who started the intro once the whole range has our own record of it (from 16 Oct 2026); before, a count of the visits PostHog saw press it.",
    good: "down",
    stat: "Share from 16 Oct 2026, or a Count of visits (PostHog) for a range starting earlier",
    per: "per finished survey (per PostHog visit for a range starting before 16 Oct 2026)",
    formula: {
      num: "Finished surveys that pressed Skip Intro (before 16 Oct 2026: visits PostHog saw press it)",
      den: "Finished surveys: everyone who started the intro (none before 16 Oct 2026)",
      mult: "× 100 (from 16 Oct 2026)",
    },
    caveat:
      "Our own record (analytics_event wizard_skipped) starts on 16 Oct 2026; a range from that day is a share of the range's finished surveys, by the filters. For a range starting earlier, PostHog's count: it sees only part of the visitors (blockers, no consent), so it is low, is never a share of our readers, ignores the source, device and tier filters and isn't compared. The team's own are left out of both.",
    tables: [
      SUBS,
      WIZARD_EVENTS_T,
      {
        ...PH_VIEWS,
        columns:
          "event ($autocapture), properties.$el_text, elements_chain, properties.$pathname, $session_id, timestamp",
      },
    ],
    query: {
      lang: "SQL",
      text: `-- Part 1, production (SQL): a range from 16 Oct 2026, the first day Skip Intro was recorded
-- (analytics_event wizard_skipped), reads our own record, as the page does; a range starting
-- earlier gets no row here.
WITH ${RANGE},
${FINISHED},
skippers AS (
  SELECT DISTINCT a.survey_submission_id AS sid FROM analytics_event a
   WHERE a.event_type = 'wizard_skipped' AND (a.metadata->>'from_slide') ~ '^[0-5]$'
)
SELECT count(*) FILTER (WHERE f.id IN (SELECT sid FROM skippers)) AS pressed_skip_intro,
       count(*) AS intro_started,
       round(100.0 * count(*) FILTER (WHERE f.id IN (SELECT sid FROM skippers)) / nullif(count(*), 0), 1) AS skipped_pct
  FROM finished f
HAVING :from::date >= (SELECT (min(a.event_time) AT TIME ZONE 'Europe/Berlin')::date
                         FROM analytics_event a WHERE a.event_type = 'wizard_skipped');

-- Part 2, PostHog (HogQL): a range starting before 16 Oct 2026 reads the visits PostHog saw press it.
SELECT uniqExactIf($session_id, properties.$el_text = 'Skip Intro' AND elements_chain LIKE '%wz-skip%') AS skips
  FROM events
 WHERE event = '$autocapture' AND properties.$host = 'www.loveiq.org' AND properties.$pathname = '/survey'
   AND timestamp >= toDateTime(':from 00:00:00', 'Europe/Berlin')
   AND timestamp < toDateTime(':to 00:00:00', 'Europe/Berlin') + INTERVAL 1 DAY
   AND person_id NOT IN (SELECT person_id FROM events
                          WHERE $session_id IN :team_visits
                            AND timestamp >= toDateTime('2026-08-23 00:00:00', 'UTC'))
 LIMIT 1`,
    },
    related: ["report.wizard_skip", "report.intro"],
  },
  "report.left": {
    label: "Left the wizard / bounced",
    what: "Of those who started the intro, the share whose report was never opened: they left during the intro.",
    good: "down",
    stat: "Share",
    per: "per finished survey",
    formula: {
      num: "Finished surveys whose report was never opened",
      den: "Finished surveys (intro started)",
      mult: "× 100",
    },
    caveat:
      "Counts everyone, before 18 Sep 2026 too: opening is known from the report's own records. A reader who opens their report later (from the email) stops counting here." +
      SAME_AGE,
    tables: [SUBS, SESSIONS, OPEN_SIGNS],
    query: {
      lang: "SQL",
      text: `${READERS}
SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM readers r WHERE r.sid = finished.id)) AS left_wizard,
       count(*) AS started
  FROM finished;`,
    },
    related: ["report.wizard_exit", "report.opened"],
  },
  "report.wizard_time": {
    label: "Median time",
    what: "How long the middle reader stayed on the slide before going on. Long times show where readers stop to read; very short ones, where they click through.",
    stat: "Median",
    per: "per reader who went on from the slide",
    formula: { num: "Time from arriving on the slide to going on (the middle value)" },
    caveat:
      "Only readers who went on are timed, each under 30 minutes; the last slide has no end time, so it reads —. All traffic: the slides' events carry no source, device or tier.",
    tables: [WIZARD_EVENTS_T],
    query: { lang: "SQL", text: WIZARD_EVENTS },
    related: ["report.wizard_back", "report.wizard_continue"],
  },
  "report.wizard_reached": {
    label: "Reached",
    what: "How many readers got to the slide, and their share of everyone who started the intro.",
    stat: "Count, and a Share",
    per: "per finished survey",
    formula: {
      num: "Finished surveys that reached the slide",
      den: "Finished surveys (intro started)",
      mult: "× 100",
    },
    caveat:
      "Everyone sees slide 1; a later slide is reached by going on to it." +
      EVENTS_FROM.replace(" and is not compared", ""),
    tables: [SUBS, WIZARD_EVENTS_T],
    query: { lang: "SQL", text: WIZARD_SLIDES },
    related: ["report.wizard_continue", "report.intro"],
  },
  "report.wizard_continue": {
    label: "Continue",
    what: "Of the slide's readers, the share who went on to the next slide (on slide 6: opened their report).",
    good: "up",
    stat: "Share",
    per: "per reader of the slide",
    formula: {
      num: "Readers who went on from the slide",
      den: "Readers who reached the slide",
      mult: "× 100",
    },
    caveat: WIZARD_SHARE,
    tables: [SUBS, WIZARD_EVENTS_T],
    query: { lang: "SQL", text: WIZARD_SLIDES },
    related: ["report.wizard_skip", "report.wizard_exit", "report.completed"],
  },
  "report.wizard_skip": {
    label: "Skip intro",
    what: "Of the slide's readers, the share who stopped on it by pressing Skip Intro (on this slide, or on one they went back to), going straight to their report.",
    good: "down",
    stat: "Share",
    per: "per reader of the slide",
    formula: {
      num: "Readers who stopped on the slide having pressed Skip Intro",
      den: "Readers who reached the slide",
      mult: "× 100",
    },
    caveat: `${WIZARD_SHARE} Skip Intro is recorded from 16 Oct 2026: before, a skip counts as an exit, so a range starting earlier reads low here and high in Exit. On slide 6 a skip opens the report, which is Continue. In red from 11%.`,
    tables: [SUBS, WIZARD_EVENTS_T],
    query: { lang: "SQL", text: WIZARD_SLIDES },
    related: ["report.skipped", "report.wizard_exit"],
  },
  "report.wizard_back": {
    label: "Back",
    what: "Readers who went back from the slide to the one before, as a share of the slide's readers. Going back is not leaving, so it is counted on its own.",
    stat: "Share (a count under a filter)",
    per: "per reader of the slide",
    formula: {
      num: "Readers who went back from the slide",
      den: "Readers who reached the slide",
      mult: "× 100",
    },
    caveat:
      "All traffic: a back click carries no source, device or tier, so under a filter Back is a count. Slide 1 has no Back button. The query gives the counts; Reached is the share's base.",
    tables: [WIZARD_EVENTS_T],
    query: { lang: "SQL", text: WIZARD_EVENTS },
    related: ["report.wizard_time", "report.wizard_reached"],
  },
  "report.wizard_exit": {
    label: "Exit",
    what: "Of the slide's readers, the share who neither went on nor skipped: they closed the intro on this slide, or are still on it.",
    good: "down",
    stat: "Share",
    per: "per reader of the slide",
    formula: {
      num: "Readers who stopped on the slide without pressing Skip Intro",
      den: "Readers who reached the slide",
      mult: "× 100",
    },
    caveat: `${WIZARD_SHARE} Before 16 Oct 2026 a skip counts as an exit. A reader who stopped here may still open the report later, from the email. In red from 5%.`,
    tables: [SUBS, WIZARD_EVENTS_T],
    query: { lang: "SQL", text: WIZARD_SLIDES },
    related: ["report.left", "report.wizard_skip"],
  },

  // Time in report
  "report.time_avg": {
    label: "Avg. total time",
    what: "The average total time a reader spent reading their report, over all their visits (the same figure as the Avg. read time tile).",
    good: "up",
    stat: "Average",
    per: "per reader (whose reading time was recorded)",
    formula: {
      num: "Total reading time of the readers whose time was recorded",
      den: "Readers whose reading time was recorded",
    },
    caveat: READ_TIME_RULES + SAME_AGE,
    tables: [SUBS, SESSIONS, REPORTS],
    query: {
      lang: "SQL",
      text: `${READERS}\nSELECT round(avg(read_ms)) AS avg_ms, sum(read_ms) AS total_ms, count(*) AS readers\n  FROM readers WHERE closed > 0;`,
    },
    related: ["report.read", "report.time_median"],
  },
  "report.time_median": {
    label: "Median total time",
    what: "The total reading time of the middle reader (the same figure as the Median read time tile).",
    good: "up",
    stat: "Median",
    per: "per reader (whose reading time was recorded)",
    formula: { num: "The middle value of the readers' total reading times" },
    caveat: READ_TIME_RULES + SAME_AGE,
    tables: [SUBS, SESSIONS, REPORTS],
    query: {
      lang: "SQL",
      text: `${READERS}\nSELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY read_ms) AS median_ms, count(*) AS readers\n  FROM readers WHERE closed > 0;`,
    },
    related: ["report.median", "report.time_avg"],
  },
  "report.time_session": {
    label: "Avg. per session",
    what: "The average length of one report session: the reading time over the sessions whose end was recorded.",
    good: "up",
    stat: "Average",
    per: "per report session (with a recorded end)",
    formula: { num: "Total reading time", den: "Report sessions with a recorded end" },
    caveat:
      "Every recorded session counts on its own here (a reload is one), unlike Sessions per reader, which joins sessions less than 30 minutes apart. Each counts up to 30 minutes." +
      SAME_AGE,
    tables: [SUBS, SESSIONS, REPORTS],
    query: {
      lang: "SQL",
      text: `${READERS}\nSELECT round(sum(read_ms) / sum(closed)) AS avg_ms_per_session, sum(read_ms) AS total_ms,\n       sum(closed) AS sessions\n  FROM readers WHERE closed > 0;`,
    },
    related: ["report.time_avg", "report.sessions_per_reader"],
  },
  "report.time_readers": {
    label: "Readers",
    what: "How many of the range's finished surveys had their report opened (Reports opened): Time in report and Returns are about them.",
    good: "up",
    stat: "Count",
    per: "per finished survey (each has one report)",
    formula: { num: "Finished surveys whose report was opened" },
    caveat:
      (opened.caveat ?? "") + " Opens are known for everyone all along, so it is always compared.",
    tables: opened.tables,
    query: opened.query,
    related: ["report.opened", "report.time_avg"],
  },
  "report.time_buckets": {
    label: "Share of readers by total active reading time",
    what: "Readers grouped by their total reading time, beside the same split for all reports (the dashed line): whether this range's readers read more or less than usual.",
    stat: "Share",
    per: "per reader (whose reading time was recorded)",
    formula: {
      num: "Readers in the time band",
      den: "Readers whose reading time was recorded",
      mult: "× 100",
    },
    caveat: `${READ_TIME_RULES} All reports: every reader since 18 Sep 2026, to yesterday, whose reading was recorded, whatever the filters (the query with :from = 2026-09-18).`,
    tables: [SUBS, SESSIONS, REPORTS],
    query: { lang: "SQL", text: BUCKETS },
    related: ["report.time_median", "report.depth"],
  },
  "report.depth": {
    label: "How far into the report readers got",
    what: `Readers by the furthest chapter they reached, as a share of the live report's ${LIVE_ORDER.length} chapters, split by their total reading time: whether readers stop early or read to the end.`,
    stat: "Count",
    per: "per reader (whose reading per chapter was recorded)",
    formula: { num: "Readers whose deepest chapter falls in the band" },
    caveat:
      "Reading per chapter is recorded from 16 Oct 2026, for readers who finished from that day. A chapter is reached once they spent a second or more in it or used anything in it; the deepest is the latest in the report's order, though readers can also jump ahead from the chapter list. The Summary, rated outside the report's chapter list, doesn't count.",
    tables: [SUBS, CHAPTER_STATS_T, SESSIONS],
    query: { lang: "SQL", text: DEPTH },
    related: ["report.chapter_reach", "report.time_buckets"],
  },
  "report.time_gender": {
    label: "Total time by gender",
    what: "The median (or, by the switch, the average) total reading time for each gender, beside all reports for the same group (the tick).",
    stat: "Median or Average (the switch)",
    per: "per reader (whose reading time was recorded)",
    formula: {
      num: "Total reading time of the group's readers (the middle value, or the average)",
    },
    caveat: `${READ_TIME_RULES} Gender is the survey's own answer (question 15010), else the person's profile. Not stated holds those who'd rather not label it and those who gave no answer; Other is shown when a reader of the range answered it. A group with few readers swings a lot.`,
    tables: [
      SUBS,
      SESSIONS,
      {
        source: "production",
        table: "survey_submission_answer",
        columns: "survey_submission_id, survey_question_id, answer_option_id (question 15010)",
        filters: "Through the reader's finished survey.",
      },
    ],
    query: { lang: "SQL", text: BY_GENDER },
    related: ["report.time_age", "report.time_median"],
  },
  "report.time_age": {
    label: "Total time by age",
    what: "The median (or, by the switch, the average) total reading time for each age band, beside all reports for the same band (the tick).",
    stat: "Median or Average (the switch)",
    per: "per reader (whose reading time was recorded)",
    formula: { num: "Total reading time of the band's readers (the middle value, or the average)" },
    caveat: `${READ_TIME_RULES} Age is the survey's own answer (question 15003); 55+ is its 55–64 and 65+. A band with few readers swings a lot.`,
    tables: [
      SUBS,
      SESSIONS,
      {
        source: "production",
        table: "survey_submission_answer",
        columns: "survey_submission_id, survey_question_id, answer_option_id (question 15003)",
        filters: "Through the reader's finished survey.",
      },
    ],
    query: { lang: "SQL", text: BY_AGE },
    related: ["report.time_gender", "report.time_median"],
  },

  // Returns
  "report.came_back": {
    label: "Came back",
    what: "The share of readers who came back to their report on a later visit (the same figure as the Returned tile).",
    good: "up",
    stat: "Share",
    per: "per reader",
    formula: { num: "Readers who came back", den: "Readers (reports opened)", mult: "× 100" },
    caveat:
      "Coming back means a report visit starting 30 minutes or more after the previous one ended; bots are left out. Visit ends are recorded for everyone only from 18 Sep 2026, so an earlier range is not compared." +
      SAME_AGE,
    tables: [SUBS, SESSIONS, REPORTS],
    query: {
      lang: "SQL",
      text: `${READERS}
SELECT count(*) FILTER (WHERE returned_at IS NOT NULL) AS came_back, count(*) AS readers,
       round(100.0 * count(*) FILTER (WHERE returned_at IS NOT NULL) / count(*), 2) AS pct
  FROM readers;`,
    },
    related: ["report.returned", "report.days_to_return", "report.return_days"],
  },
  "report.days_to_return": {
    label: "Median days to return",
    what: "For readers who came back, the middle number of days between their first visit and their first return.",
    good: "down",
    stat: "Median",
    per: "per reader who came back",
    formula: { num: "Days from the first visit to the first return (the middle value)" },
    caveat:
      "Berlin calendar days: 0 is the same day. Only readers who came back count, and a recent range has had less time to return." +
      SAME_AGE,
    tables: [SUBS, SESSIONS, REPORTS],
    query: {
      lang: "SQL",
      text: `${RETURN_DAYS}\nSELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY days) AS median_days, count(*) AS came_back\n  FROM days;`,
    },
    related: ["report.return_days", "report.came_back"],
  },
  "report.via_email": {
    label: "Returned via email",
    what: "Of the return visits PostHog saw, the share that came through a link in an email: a nurture email or chapter nudge, or the report-ready and invite emails.",
    good: "up",
    stat: "Share",
    per: "per return visit (PostHog)",
    formula: {
      num: "Return visits from an email link (Email campaign + Report or invite email)",
      den: "Return visits PostHog saw",
      mult: "× 100",
    },
    caveat: POSTHOG_RETURNS + " Compared with PostHog's own reading of the period before.",
    tables: [PH_VIEWS],
    query: { lang: "HogQL", text: RETURN_WAYS },
    related: ["report.return_sources", "report.campaign_returned"],
  },
  "report.sessions_per_reader": {
    label: "Sessions per reader",
    what: "The average number of separate visits each reader made to their report.",
    good: "up",
    stat: "Average",
    per: "per reader",
    formula: { num: "Visits by readers", den: "Readers" },
    caveat:
      "A session here is a visit: report sessions less than 30 minutes apart are one, so a reload or a second tab doesn't count twice; bots are left out. Visit ends are recorded for everyone only from 18 Sep 2026, so an earlier range is not compared." +
      SAME_AGE,
    tables: [SUBS, SESSIONS, REPORTS],
    query: {
      lang: "SQL",
      text: `${READERS}\nSELECT sum(visits) AS sessions, count(*) AS readers, round(sum(visits)::numeric / count(*), 2) AS per_reader\n  FROM readers;`,
    },
    related: ["report.came_back", "report.time_session"],
  },
  "report.return_days": {
    label: "Days until first return",
    what: "All readers by how many days passed between their first visit and their first return; Not yet means they haven't come back.",
    stat: "Share",
    per: "per reader",
    formula: { num: "Readers whose first return fell in the band", den: "Readers", mult: "× 100" },
    caveat:
      "Berlin calendar days. A recent range has had less time to return, so its Not yet is larger.",
    tables: [SUBS, SESSIONS, REPORTS],
    query: { lang: "SQL", text: RETURN_BANDS },
    related: ["report.return_band", "report.return_by_then", "report.days_to_return"],
  },
  "report.return_band": {
    label: "In this band",
    what: "The share of all readers whose first return fell in that window of days.",
    stat: "Share",
    per: "per reader",
    formula: { num: "Readers whose first return fell in the band", den: "Readers", mult: "× 100" },
    caveat: "Berlin calendar days; the bands and Not yet add up to 100%.",
    tables: [SUBS, SESSIONS, REPORTS],
    query: { lang: "SQL", text: RETURN_BANDS },
    related: ["report.return_by_then", "report.return_days"],
  },
  "report.return_by_then": {
    label: "Returned by then",
    what: "The running total: the share of all readers who had come back by the end of that window.",
    stat: "Share (cumulative)",
    per: "per reader",
    formula: {
      num: "Readers whose first return fell in this band or an earlier one",
      den: "Readers",
      mult: "× 100",
    },
    caveat: "The last band's figure is the Came back box.",
    tables: [SUBS, SESSIONS, REPORTS],
    query: { lang: "SQL", text: RETURN_BANDS },
    related: ["report.return_band", "report.came_back"],
  },
  "report.return_sources": {
    label: "What brought readers back",
    what: "Return visits by how each one arrived: a bookmark or the typed address, a campaign email, the report-ready or invite email, a friend's share link, or another tagged link.",
    stat: "Share",
    per: "per return visit (PostHog)",
    formula: {
      num: "Return visits that arrived this way",
      den: "Return visits PostHog saw",
      mult: "× 100",
    },
    caveat:
      POSTHOG_RETURNS +
      " Each visit is classed by its first page's link; report links hold an access token, so only the class leaves PostHog.",
    tables: [PH_VIEWS],
    query: { lang: "HogQL", text: RETURN_WAYS },
    related: ["report.via_email", "report.came_back"],
  },

  // Email campaigns
  "report.campaign_sent": {
    label: "Sent",
    what: "How many readers were sent the email in the range.",
    stat: "Count",
    per: "per reader (one email each)",
    formula: { num: "Readers sent the email in the range" },
    caveat:
      "Dated by its promo code; the 6 h and 78 h stages had none, so their send times are estimated from the report's time. A retired stage reads 0 in a range it sent nothing in. All traffic.",
    tables: [NURTURE_T, REPORTS],
    query: { lang: "SQL", text: CAMPAIGNS },
    related: ["report.campaign_returned", "report.campaign_purchased"],
  },
  "report.campaign_opened": {
    label: "Opened",
    what: "Of the readers sent it, those whose email was opened, with their share of the emails Resend reported delivered.",
    stat: "Count, and a Share",
    per: "per email delivered",
    formula: {
      num: "Readers whose email was opened",
      den: "Emails reported delivered since open tracking began",
      mult: "× 100",
    },
    caveat:
      "Resend's events are kept from 16 Oct 2026 (opens once open tracking was on): a range ending before reads —. Apple Mail loads images for privacy, which counts as an open, so opens run high; clicks are the surer signal.",
    tables: [NURTURE_T, RESEND_T],
    query: { lang: "SQL", text: CAMPAIGNS },
    related: ["report.campaign_clicked", "report.campaign_sent"],
  },
  "report.campaign_clicked": {
    label: "Clicked",
    what: "Of the readers sent it, those who clicked a link in the email, with their share of the emails Resend reported delivered.",
    good: "up",
    stat: "Count, and a Share",
    per: "per email delivered",
    formula: {
      num: "Readers who clicked a link in the email",
      den: "Emails reported delivered",
      mult: "× 100",
    },
    caveat: "Resend's events are kept from 16 Oct 2026: a range ending before reads —.",
    tables: [NURTURE_T, RESEND_T],
    query: { lang: "SQL", text: CAMPAIGNS },
    related: ["report.campaign_opened", "report.campaign_returned"],
  },
  "report.campaign_returned": {
    label: "Returned",
    what: "Of the readers sent it, those who came back to their report through the email's link after it was sent.",
    good: "up",
    stat: "Count",
    per: "per reader sent the email",
    formula: { num: "Readers who arrived through the email's offer link after it was sent" },
    caveat:
      "From our own records of every arrival through the link (from 18 Sep 2026), not PostHog's, which saw about a quarter of the visits. A return counts for the reader's latest email before it. Blank for the stages whose send times are estimated (6 h, 78 h): who came back after one can't be told.",
    tables: [
      NURTURE_T,
      {
        ...PAYWALL_CLICKS,
        watch: "An arrival through an email's offer link has source offer_link.",
      },
    ],
    query: { lang: "SQL", text: CAMPAIGNS },
    related: ["report.campaign_rate", "report.via_email"],
  },
  "report.campaign_rate": {
    label: "Return rate",
    what: "The share of the readers sent the email who came back through it.",
    good: "up",
    stat: "Share",
    per: "per reader sent the email",
    formula: { num: "Returned", den: "Sent", mult: "× 100" },
    caveat: "Blank where Returned is blank.",
    tables: [NURTURE_T, PAYWALL_CLICKS],
    query: { lang: "SQL", text: CAMPAIGNS },
    related: ["report.campaign_returned", "report.campaign_sent"],
  },
  "report.campaign_purchased": {
    label: "Purchased",
    what: "Sales in the range that used the email's discount code.",
    good: "up",
    stat: "Count",
    per: "per payment",
    formula: { num: "Sales made with the email's code" },
    caveat:
      "Real payments only. A sale is tied to the email by its stamped stage, before 5 Jul 2026 by its coupon. A sale counts in the range it was made in, which may not be the range the email was sent in.",
    tables: [PAYMENTS],
    query: { lang: "SQL", text: CAMPAIGNS },
    related: ["report.campaign_sent", "report.full"],
  },

  // Chapters
  "report.chapter_reach": {
    label: "Reach",
    what: "Of the readers whose reading per chapter was recorded, the share who reached the chapter.",
    good: "up",
    stat: "Share",
    per: "per reader (reading per chapter recorded)",
    formula: {
      num: "Readers who reached the chapter",
      den: "Readers who reached any chapter",
      mult: "× 100",
    },
    caveat:
      "Recorded from 16 Oct 2026, for readers who finished from that day; earlier report versions' chapters have none (—). Reached means a second or more on screen, or anything used in it; a paywall card only scrolled past doesn't count. All traffic.",
    tables: [CHAPTER_STATS_T, SUBS],
    query: { lang: "SQL", text: CHAPTERS },
    related: ["report.depth", "report.chapter_time"],
  },
  "report.chapter_time": {
    label: "Median time",
    what: "How long the middle reader of the chapter had it on screen.",
    good: "up",
    stat: "Median",
    per: "per reader of the chapter",
    formula: { num: "Time with the chapter on screen (the middle value)" },
    caveat:
      "Up to 30 minutes per reader and chapter: a tab left open would drag an average up, so this is the median (the CSV also has the average). Of the readers who reached the chapter.",
    tables: [CHAPTER_STATS_T],
    query: { lang: "SQL", text: CHAPTERS },
    related: ["report.chapter_reach", "report.median"],
  },
  "report.chapter_feedback": {
    label: "Feedback · good / bad",
    what: "Every vote on the chapter since voting began, split into good and bad. The bar is against the most-voted chapter.",
    stat: "Count",
    per: "per vote (a reader votes once per chapter)",
    formula: { num: "Votes on the chapter (good / bad)" },
    caveat:
      "Live, all time and all traffic: the period and the other filters don't apply. Earlier report versions' chapters keep their votes, listed after the live report's.",
    tables: [VOTES_T],
    query: {
      lang: "SQL",
      text: `${VOTES}
SELECT section_id AS chapter, count(*) FILTER (WHERE feedback = 'up') AS good,
       count(*) FILTER (WHERE feedback = 'down') AS bad, count(*) AS votes
  FROM votes GROUP BY section_id ORDER BY votes DESC, good DESC;`,
    },
    related: ["report.feedback_good", "report.rating"],
  },
  "report.chapter_show_more": {
    label: "Show more CTR",
    what: "Of the chapter's readers, the share who opened its Show all text.",
    good: "up",
    stat: "Share",
    per: "per reader of the chapter",
    formula: {
      num: "Readers who opened Show all",
      den: "Readers who reached the chapter",
      mult: "× 100",
    },
    caveat:
      "— where nobody did, or the chapter has no Show all. Green from 18%, red at 4% or less.",
    tables: [CHAPTER_STATS_T],
    query: { lang: "SQL", text: CHAPTERS },
    related: ["report.chapter_learn_more", "report.chapter_reach"],
  },
  "report.chapter_paywall": {
    label: "Paywall CTR",
    what: "Of the readers who saw a paywall card in the chapter, the share who clicked it; under it, how many clicked of how many saw.",
    good: "up",
    stat: "Share",
    per: "per reader who saw the chapter's paywall",
    formula: {
      num: "Readers who saw the chapter's paywall and clicked it",
      den: "Readers who saw the chapter's paywall",
      mult: "× 100",
    },
    caveat:
      "Everyone whose card came into view counts, even if they only scrolled past. Green from 5%. With no reading recorded in a range, the column shows the readers who clicked a paywall or lock button in the chapter, as a count.",
    tables: [CHAPTER_STATS_T],
    query: { lang: "SQL", text: CHAPTERS },
    related: ["report.initiated", "report.chapter_reach"],
  },
  "report.chapter_learn_more": {
    label: "Learn more CTR",
    what: "Of the chapter's readers, the share who opened its Learn More & Go Deeper.",
    good: "up",
    stat: "Share",
    per: "per reader of the chapter",
    formula: {
      num: "Readers who opened Learn More & Go Deeper",
      den: "Readers who reached the chapter",
      mult: "× 100",
    },
    caveat: "— where nobody did, or the chapter has none.",
    tables: [CHAPTER_STATS_T],
    query: { lang: "SQL", text: CHAPTERS },
    related: ["report.chapter_exercise", "report.chapter_show_more"],
  },
  "report.chapter_exercise": {
    label: "Exercise CTR",
    what: "Of the chapter's readers, the share who opened its Try This & See What Shifts exercise.",
    good: "up",
    stat: "Share",
    per: "per reader of the chapter",
    formula: {
      num: "Readers who opened Try This & See What Shifts",
      den: "Readers who reached the chapter",
      mult: "× 100",
    },
    caveat: "— where nobody did, or the chapter has no exercise.",
    tables: [CHAPTER_STATS_T],
    query: { lang: "SQL", text: CHAPTERS },
    related: ["report.chapter_learn_more", "report.chapter_reach"],
  },

  // Feedback
  "report.feedback_good": {
    label: "Good votes",
    what: "The share of all chapter votes that were good, with how many were good and bad.",
    good: "up",
    stat: "Share",
    per: "per vote",
    formula: { num: "Good votes", den: "All votes", mult: "× 100" },
    caveat:
      "Live, all time and all traffic, whatever the filters. Votes on the team's own surveys are left out. A reader votes once per chapter and can change it; the latest counts.",
    tables: [VOTES_T],
    query: {
      lang: "SQL",
      text: `${VOTES}
SELECT count(*) FILTER (WHERE feedback = 'up') AS good, count(*) FILTER (WHERE feedback = 'down') AS bad,
       count(*) AS votes, round(100.0 * count(*) FILTER (WHERE feedback = 'up') / count(*), 1) AS good_pct,
       (min(created_at) AT TIME ZONE 'Europe/Berlin')::date AS since
  FROM votes;`,
    },
    related: ["report.feedback_issues", "report.chapter_feedback"],
  },
  "report.feedback_issues": {
    label: "Issues reported",
    what: "What readers picked as the problem when they voted a chapter bad.",
    stat: "Count",
    per: "per bad vote",
    formula: { num: "Bad votes giving the reason" },
    caveat:
      "All time. Picking a reason is optional, so the reasons add up to fewer than the bad votes.",
    tables: [VOTES_T],
    query: {
      lang: "SQL",
      text: `${VOTES}
SELECT issue, count(*) AS votes FROM votes
 WHERE feedback = 'down' AND issue IS NOT NULL
 GROUP BY issue ORDER BY votes DESC;`,
    },
    related: ["report.feedback_good"],
  },
};
