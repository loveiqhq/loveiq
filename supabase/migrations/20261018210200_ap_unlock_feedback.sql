-- AP-Analytics, the Unlock feedback page (/admin/ap/assessment-a/unlock-feedback, Marcus's
-- canvas of 18 Oct 2026): the "why didn't you unlock?" emails SENT in one range of Berlin days
-- (unlock_feedback.sent_at), staff left out, with everything that happened to each one since;
-- and the readers whose first full unlock was paid in the range, so the page can set what the
-- free unlocks did with their report against what paying readers did. This only gathers: the
-- page counts (features/admin/server/ap/unlock-feedback.ts), so every rule is where it is tested.
--
--   rows        one per email: the Berlin day it was sent and its subject arm; when Resend says
--               it was delivered, opened, clicked or bounced (email_message_event, stage
--               unlock_feedback: the first of each kind); the answer as /why recorded it; the
--               reader's gender, age and archetype as ap_facts reads them; when they unsubscribed
--               through this email (email_suppression, campaign unlock_feedback); the source
--               tags, for the page to leave our own probes out; and, once the report was
--               unlocked for free, what they did after it (after, below). note is the reader's
--               own words: the page masks addresses and phone numbers in it before it leaves the
--               server.
--   paid        one per reader whose first full unlock (Full, Full All or Core: over EUR 0, not a
--               test) was paid in the range, with what they did after it; a reader this email
--               had already gifted the report to is left out.
--   first_sent  the Berlin day the first email went out, staff left out; null before.
--
-- after: what a reader did after their unlock (the free one's unlocked_at, the paid one's
-- payment), as the Report page reads a reader:
--   reached     each chapter reached after it, with when: a second or more with it on screen,
--               or anything used in it, counted from the unlock on (report_chapter_stats, as
--               ap_report_extras reads it).
--   read_ms, closed  the report sessions begun after it, as ap_facts counts them: those whose
--               end was recorded and under 4 hours, each up to 30 minutes.
--   ups, downs  chapter votes given after it.
--   shared      shared the report or invited someone after it.
--
-- A hand check (Berlin summer time, UTC+2). One email, arm B, sent 18 Oct 10:00 UTC. Resend:
-- delivered 10:00:01, opened 11:58, clicked 12:00. /why: too_expensive at 12:00:05, answer_loads
-- 2, chips {About half the price}, a note, detail_at 12:01, mobile, unlocked_at 12:00:06. After
-- it: one report_chapter_stats save at 12:10 holding 40 s of introduction and 2 minutes of
-- core_archetype, one 5 minute session from 12:02 with its end recorded, one up vote. For
-- p_from = p_to = 2026-10-18 its row is
--   {"day": "2026-10-18", "arm": "B", "sent_at": "2026-10-18T10:00:00+00:00",
--    "delivered_at": "...T10:00:01...", "opened_at": "...T11:58...", "clicked_at": "...T12:00...",
--    "bounced_at": null, "reason": "too_expensive", "answered_at": "...T12:00:05...", "loads": 2,
--    "chips": ["About half the price"], "unlocked_at": "...T12:00:06...", ...,
--    "after": {"reached": {"introduction": "...T12:10...", "core_archetype": "...T12:10..."},
--              "read_ms": 300000, "closed": 1, "ups": 1, "downs": 0, "shared": false}}
-- and the page reads it as sent, delivered, opened, clicked, one counted answer (two hours after
-- delivery, not under 2 s) with one repeat tap or reload, added detail (a chip), a free unlock,
-- and opened report (core_archetype is past the first chapter), two chapters, 5:00 in the report.
--
-- Service role only. Rollback: supabase/rollbacks/20261018210200_ap_unlock_feedback_down.sql.

CREATE OR REPLACE FUNCTION public.ap_unlock_feedback(p_from date, p_to date)
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
  sent AS (
    SELECT uf.survey_submission_id AS sid, uf.subject_arm, uf.sent_at, uf.reason, uf.answered_at,
           uf.changed_at, uf.answer_loads, uf.chips, uf.note, uf.detail_at, uf.device,
           uf.already_paid, uf.unlocked_at, s.user_id,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j
      FROM unlock_feedback uf
      JOIN survey_submission s ON s.id = uf.survey_submission_id, b
     WHERE uf.sent_at >= b.since_ts AND uf.sent_at < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  -- Resend's events for these emails: the webhook keeps the first of each kind per email, by
  -- the stage and submission the send tagged it with. Not cut at sent_at: these times are
  -- Resend's, and a delivery can be stamped a moment before our own sent_at is written.
  ev AS (
    SELECT m.survey_submission_id AS sid,
           min(m.first_at) FILTER (WHERE m.event_type = 'delivered') AS delivered_at,
           min(m.first_at) FILTER (WHERE m.event_type = 'opened') AS opened_at,
           min(m.first_at) FILTER (WHERE m.event_type = 'clicked') AS clicked_at,
           min(m.first_at) FILTER (WHERE m.event_type = 'bounced') AS bounced_at
      FROM email_message_event m
     WHERE m.stage = 'unlock_feedback' AND m.survey_submission_id IN (SELECT sid FROM sent)
     GROUP BY 1
  ),
  -- Gender and age as ap_facts reads them (the profile, and question 15003's answer); the
  -- address only to find an unsubscribe below, never returned.
  who AS (
    SELECT s.sid, up.gender, lower(btrim(u.email)) AS addr
      FROM sent s
      JOIN app_user u ON u.id = s.user_id
      LEFT JOIN user_profile up ON up.id = u.user_profile_id
  ),
  age AS (
    SELECT DISTINCT ON (a.survey_submission_id) a.survey_submission_id AS sid, ao.option_text AS age
      FROM survey_submission_answer a
      JOIN survey_question sq ON sq.id = a.survey_question_id AND sq.frontend_qid = '15003'
      JOIN answer_option ao ON ao.id = a.answer_option_id
     WHERE a.survey_submission_id IN (SELECT sid FROM sent)
     ORDER BY a.survey_submission_id, a.id DESC
  ),
  -- The report's archetype, as ap_facts takes it.
  arch AS (
    SELECT DISTINCT ON (sr.survey_submission_id) sr.survey_submission_id AS sid,
           coalesce(sr.v5_primary_archetype, sr.primary_archetype) AS archetype
      FROM scoring_result sr
     WHERE sr.survey_submission_id IN (SELECT sid FROM sent)
     ORDER BY sr.survey_submission_id, sr.id DESC
  ),
  -- Unsubscribed through this email: the footer and one-click paths keep the campaign its link
  -- carried.
  unsub AS (
    SELECT lower(btrim(es.email)) AS addr, min(es.created_at) AS at
      FROM email_suppression es
     WHERE es.reason = 'unsubscribed' AND es.source_campaign = 'unlock_feedback'
     GROUP BY 1
  ),
  -- Each reader's first full unlock that was paid. This email's gift is a succeeded EUR 0
  -- payment with metadata.source unlock_feedback (plan full_report), so never one of these.
  full_buys AS (
    SELECT pr.survey_submission_id AS sid, min(p.created_date_time) AS at
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
     WHERE p.status = 'succeeded' AND coalesce(p.is_test, false) = false AND p.amount > 0
       AND p.metadata->>'plan' IN ('full_report', 'all_reports', 'core')
     GROUP BY 1
  ),
  gifts AS (
    SELECT pr.survey_submission_id AS sid, min(p.created_date_time) AS at
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
     WHERE p.status = 'succeeded' AND p.metadata->>'source' = 'unlock_feedback'
     GROUP BY 1
  ),
  -- A reader this email gifted the report to before they paid (All Reports, say) is not a
  -- reader who paid to unlock it: left out of the paid group.
  paid AS (
    SELECT fb.sid, fb.at, s.user_id,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j
      FROM full_buys fb
      JOIN survey_submission s ON s.id = fb.sid, b
     WHERE fb.at >= b.since_ts AND fb.at < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
       AND NOT EXISTS (SELECT 1 FROM gifts g WHERE g.sid = fb.sid AND g.at < fb.at)
  ),
  -- Both groups, each reader with the moment of their unlock. A reader can be in both (a free
  -- unlock, then All Reports bought): each is read from its own moment.
  unlocked AS (
    SELECT 'free'::text AS grp, s.sid, s.unlocked_at AS at, s.user_id
      FROM sent s
     WHERE s.unlocked_at IS NOT NULL AND NOT s.already_paid
    UNION ALL
    SELECT 'paid', p.sid, p.at, p.user_id FROM paid p
  ),
  -- Reading per chapter after the unlock: one row per save, holding only what changed since the
  -- save before, so a reader's rows add up. Every value is checked before a cast, as in
  -- ap_report_extras: anyone with a CSRF cookie can post this metadata.
  chapter_saves AS (
    SELECT un.grp, un.sid, a.event_time, c.key AS section,
           CASE WHEN c.value->>'ms' ~ '^[0-9]{1,8}$' THEN (c.value->>'ms')::int ELSE 0 END AS ms,
           (coalesce(c.value->>'open', '') ~ '^[1-9][0-9]{0,5}$'
             OR coalesce(c.value->>'show_all', '') ~ '^[1-9][0-9]{0,5}$'
             OR coalesce(c.value->>'learn_more', '') ~ '^[1-9][0-9]{0,5}$'
             OR coalesce(c.value->>'try_this', '') ~ '^[1-9][0-9]{0,5}$'
             OR coalesce(c.value->>'pw_seen', '') ~ '^[1-9][0-9]{0,5}$'
             OR coalesce(c.value->>'pw_click', '') ~ '^[1-9][0-9]{0,5}$') AS used
      FROM unlocked un
      JOIN analytics_event a
        ON a.survey_submission_id = un.sid AND a.event_type = 'report_chapter_stats'
       AND a.event_time >= un.at
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(a.metadata->'chapters') = 'object'
                                         THEN a.metadata->'chapters' ELSE '{}'::jsonb END) AS c
     WHERE jsonb_typeof(c.value) = 'object'
       AND c.key ~ '^[a-z][a-z0-9_]{0,79}$'
  ),
  -- A chapter is reached at the save where its time since the unlock first adds up to a second,
  -- or where something in it is first used.
  chapter_reach AS (
    SELECT x.grp, x.sid, x.section,
           min(x.event_time) FILTER (WHERE x.ms_so_far >= 1000 OR x.used_so_far) AS at
      FROM (SELECT y.grp, y.sid, y.section, y.event_time,
                   sum(y.ms) OVER w AS ms_so_far, bool_or(y.used) OVER w AS used_so_far
              FROM chapter_saves y
            WINDOW w AS (PARTITION BY y.grp, y.sid, y.section ORDER BY y.event_time
                         ROWS UNBOUNDED PRECEDING)) x
     GROUP BY 1, 2, 3
  ),
  reached AS (
    SELECT r.grp, r.sid, json_object_agg(r.section, r.at ORDER BY r.at) AS chapters
      FROM chapter_reach r
     WHERE r.at IS NOT NULL
     GROUP BY 1, 2
  ),
  reading AS (
    SELECT un.grp, un.sid,
           coalesce(sum(least(extract(epoch FROM rs.ended_at - rs.started_at), 1800) * 1000)
                      FILTER (WHERE rs.ended_at > rs.started_at AND rs.ended_at - rs.started_at < interval '4 hours'), 0)::bigint AS read_ms,
           count(*) FILTER (WHERE rs.ended_at > rs.started_at AND rs.ended_at - rs.started_at < interval '4 hours') AS closed
      FROM unlocked un
      JOIN personal_report pr ON pr.survey_submission_id = un.sid
      JOIN report_session rs ON rs.personal_report_id = pr.id AND rs.started_at >= un.at
     WHERE NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = rs.user_id)
     GROUP BY 1, 2
  ),
  votes AS (
    SELECT un.grp, un.sid,
           count(*) FILTER (WHERE f.feedback = 'up') AS ups,
           count(*) FILTER (WHERE f.feedback = 'down') AS downs
      FROM unlocked un
      JOIN report_section_feedback f ON f.survey_submission_id = un.sid AND f.created_at >= un.at
     GROUP BY 1, 2
  ),
  shared AS (
    SELECT un.grp, un.sid
      FROM unlocked un
      JOIN personal_report pr ON pr.survey_submission_id = un.sid
      JOIN report_share x ON x.personal_report_id = pr.id AND x.created_at >= un.at
    UNION
    SELECT un.grp, un.sid
      FROM unlocked un
      JOIN app_user u ON u.id = un.user_id
      JOIN invite_event i ON lower(i.referrer_email) = lower(u.email) AND i.created_at >= un.at
  ),
  after_unlock AS (
    SELECT un.grp, un.sid,
           json_build_object(
             'reached', coalesce(r.chapters, '{}'::json),
             'read_ms', coalesce(rd.read_ms, 0), 'closed', coalesce(rd.closed, 0),
             'ups', coalesce(v.ups, 0), 'downs', coalesce(v.downs, 0),
             'shared', (sh.sid IS NOT NULL)) AS j
      FROM unlocked un
      LEFT JOIN reached r ON r.grp = un.grp AND r.sid = un.sid
      LEFT JOIN reading rd ON rd.grp = un.grp AND rd.sid = un.sid
      LEFT JOIN votes v ON v.grp = un.grp AND v.sid = un.sid
      LEFT JOIN shared sh ON sh.grp = un.grp AND sh.sid = un.sid
  )
  SELECT json_build_object(
    'rows', (
      SELECT coalesce(json_agg(json_build_object(
               'day', (s.sent_at AT TIME ZONE 'Europe/Berlin')::date,
               'arm', s.subject_arm, 'sent_at', s.sent_at,
               'src', s.j->>'utm_source', 'med', s.j->>'utm_medium',
               'delivered_at', ev.delivered_at, 'opened_at', ev.opened_at,
               'clicked_at', ev.clicked_at, 'bounced_at', ev.bounced_at,
               'reason', s.reason, 'answered_at', s.answered_at, 'changed_at', s.changed_at,
               'loads', s.answer_loads, 'chips', s.chips, 'note', s.note, 'detail_at', s.detail_at,
               'device', s.device, 'already_paid', s.already_paid, 'unlocked_at', s.unlocked_at,
               'gender', who.gender, 'age', age.age, 'archetype', arch.archetype,
               'unsub_at', us.at, 'after', af.j
             ) ORDER BY s.sent_at), '[]'::json)
        FROM sent s
        LEFT JOIN ev ON ev.sid = s.sid
        LEFT JOIN who ON who.sid = s.sid
        LEFT JOIN age ON age.sid = s.sid
        LEFT JOIN arch ON arch.sid = s.sid
        LEFT JOIN unsub us ON us.addr = who.addr
        LEFT JOIN after_unlock af ON af.grp = 'free' AND af.sid = s.sid
    ),
    'paid', (
      SELECT coalesce(json_agg(json_build_object(
               'day', (p.at AT TIME ZONE 'Europe/Berlin')::date,
               'src', p.j->>'utm_source', 'med', p.j->>'utm_medium', 'after', af.j
             ) ORDER BY p.at), '[]'::json)
        FROM paid p
        JOIN after_unlock af ON af.grp = 'paid' AND af.sid = p.sid
    ),
    'first_sent', (
      SELECT (min(uf.sent_at) AT TIME ZONE 'Europe/Berlin')::date
        FROM unlock_feedback uf
        JOIN survey_submission s ON s.id = uf.survey_submission_id
       WHERE NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_unlock_feedback(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_unlock_feedback(date, date) TO service_role;
