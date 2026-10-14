-- The report page of AP-Analytics (/admin/ap/assessment-a/report), beside ap_facts, for one
-- range of Berlin days (finished surveys in the range, staff left out):
--
--   wizard    the pre-report wizard (six slides, 0 to 5), per slide: the people who went on
--             to the next one, who went back from it, and the median time on it (from
--             arriving on it, by advancing or by finishing the survey, to going on; under 30
--             minutes). wizard_slide_advanced, written without consent since 18 Sep 2026.
--   map_steppers  the finished surveys whose reader stepped through the deep dives on the
--             wizard's map (its second slide) with the arrows: wizard_map_step next or
--             previous, written from 6 Oct 2026 (continue, which opens them, is no step).
--   chapters  chapter votes (report_section_feedback) given in the range, per chapter, and
--             per chapter the readers (of the range's finished surveys) who clicked a paywall
--             or lock button in it (paywall_initiated and lock_icon_clicked carry the chapter).
--   issues    the reasons readers gave with a down vote, per reason.
--   feedback  the 200 latest votes of the range: when, whose submission, which chapter, the
--             vote, the reason, and whether a comment was left (never its text).
--   emails    the nurture emails: sent in the range (send time = the 24-hour code's expiry
--             minus a day; the mark is written just before the send, so a failed send
--             still counts), of those the readers who came back through the email's link
--             after it was sent and before their next one (paywall_initiated with source offer_link: every nurture
--             link carries offer=1; written without consent since 18 Sep 2026), and sales
--             in the range that used that email's code (staff out).
--
-- Service role only.

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
