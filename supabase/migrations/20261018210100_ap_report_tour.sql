-- The guided tour on the report page of AP-Analytics (/admin/ap/assessment-a/report), beside
-- ap_report_extras, for one range of Berlin days: the tour's first runs (trigger auto; a replay
-- stores no start or end) of the range's finished surveys, staff left out, whenever they ran.
-- A run stores its start (tour_started) and its end: completed, skipped, or left with the page
-- (tour_left). Each says whose tour it was (audience: free with the unlock stop, paid without),
-- and each end carries every stop the run reached, in its order, with the time its bubble was up
-- over every visit and the reader's Back presses on it (features/analytics/client.ts:
-- trackTourStarted, trackTourCompleted, trackTourSkipped, trackTourLeft):
--
--   days    per finisher's day and audience: the readers who got the tour, its runs (a reader
--           gets one per browser: the starts, or the ends where a start was lost), and how
--           they ended: completed, skipped, left with the page, or no end stored at all
--           (unended: the page went without a word, or the browser kept it and never brought
--           it back). A reader's runs carry no id of their own, so unended is the starts beyond
--           the ends.
--   stops   per audience and stop, over the runs whose end carries its stops: those that
--           reached it; went on from it (Next, or Finish on the run's last); went back from it
--           at least once; skipped or left the page there, each run's end placed on the
--           furthest stop it reached; and the median time on it, over the runs whose bubble was
--           up there for under 30 minutes.
--   placed  per audience, the runs whose end carries its stops: what the stops are out of.
--
-- Every value is checked before it is read: anyone with a CSRF cookie can post this metadata,
-- and one bad cast would fail the whole page. Service role only.
-- Rollback: supabase/rollbacks/20261018210100_ap_report_tour_down.sql.

CREATE OR REPLACE FUNCTION public.ap_report_tour(p_from date, p_to date)
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
    SELECT s.id, (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day
      FROM survey_submission s, b
     WHERE s.status = 'completed'
       AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  ev AS (
    SELECT a.id, a.survey_submission_id AS sid, a.event_type, a.metadata->>'audience' AS audience,
           CASE WHEN jsonb_typeof(a.metadata->'stops') = 'array' THEN a.metadata->'stops' ELSE '[]'::jsonb END AS stops
      FROM analytics_event a
     WHERE a.event_type IN ('tour_started', 'tour_completed', 'tour_skipped', 'tour_left')
       AND a.metadata->>'trigger' = 'auto'
       AND a.metadata->>'audience' IN ('free', 'paid')
       AND a.survey_submission_id IN (SELECT id FROM subs)
  ),
  by_reader AS (
    SELECT e.sid, e.audience,
           count(*) FILTER (WHERE e.event_type = 'tour_started') AS started,
           count(*) FILTER (WHERE e.event_type = 'tour_completed') AS completed,
           count(*) FILTER (WHERE e.event_type = 'tour_skipped') AS skipped,
           count(*) FILTER (WHERE e.event_type = 'tour_left') AS left_page
      FROM ev e
     GROUP BY 1, 2
  ),
  -- An end is placed on its stops only when every one of them is a known stop with whole
  -- numbers: a run is placed whole or not at all, so each stop's outcomes add up.
  ends AS (
    SELECT e.id, e.audience, e.event_type, e.stops
      FROM ev e
     WHERE e.event_type <> 'tour_started'
       AND jsonb_array_length(e.stops) BETWEEN 1 AND 5
       AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(e.stops) x
              WHERE coalesce(x->>'id', '') NOT IN ('chapter_menu', 'show_all', 'chapter_toggle', 'try_this', 'unlock')
                 OR coalesce(x->>'ms', '') !~ '^[0-9]{1,10}$'
                 OR coalesce(x->>'back', '') !~ '^[0-9]{1,4}$')
  ),
  placed AS (
    SELECT en.audience, en.event_type, x.value->>'id' AS stop,
           CASE WHEN x.value->>'ms' ~ '^[0-9]{1,10}$' THEN (x.value->>'ms')::bigint END AS ms,
           CASE WHEN x.value->>'back' ~ '^[0-9]{1,4}$' THEN (x.value->>'back')::int END AS back,
           x.ord = jsonb_array_length(en.stops) AS furthest
      FROM ends en
      CROSS JOIN LATERAL jsonb_array_elements(en.stops) WITH ORDINALITY AS x(value, ord)
  ),
  per_stop AS (
    SELECT p.audience, p.stop,
           count(*) AS reached,
           count(*) FILTER (WHERE NOT p.furthest OR p.event_type = 'tour_completed') AS went_on,
           count(*) FILTER (WHERE p.back > 0) AS went_back,
           count(*) FILTER (WHERE p.furthest AND p.event_type = 'tour_skipped') AS skipped,
           count(*) FILTER (WHERE p.furthest AND p.event_type = 'tour_left') AS exited,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY p.ms) FILTER (WHERE p.ms > 0 AND p.ms < 1800000) AS median_ms,
           count(*) FILTER (WHERE p.ms > 0 AND p.ms < 1800000) AS timed
      FROM placed p
     GROUP BY 1, 2
  )
  SELECT json_build_object(
    'days', (SELECT coalesce(json_agg(json_build_object(
               'day', d.day, 'audience', d.audience, 'readers', d.readers, 'runs', d.runs,
               'completed', d.completed, 'skipped', d.skipped, 'left', d.left_page, 'unended', d.unended)
               ORDER BY d.day, d.audience), '[]'::json)
               FROM (SELECT s.day, r.audience, count(*) AS readers,
                            sum(greatest(r.started, r.completed + r.skipped + r.left_page)) AS runs,
                            sum(r.completed) AS completed, sum(r.skipped) AS skipped, sum(r.left_page) AS left_page,
                            sum(greatest(0, r.started - r.completed - r.skipped - r.left_page)) AS unended
                       FROM by_reader r JOIN subs s ON s.id = r.sid
                      GROUP BY 1, 2) d),
    'stops', (SELECT coalesce(json_agg(json_build_object(
                'audience', st.audience, 'id', st.stop, 'reached', st.reached, 'next', st.went_on,
                'back', st.went_back, 'skip', st.skipped, 'exit', st.exited,
                'median_ms', round(st.median_ms), 'timed', st.timed) ORDER BY st.audience, st.stop), '[]'::json)
                FROM per_stop st),
    'placed', (SELECT coalesce(json_agg(json_build_object('audience', x.audience, 'runs', x.n) ORDER BY x.audience), '[]'::json)
                 FROM (SELECT en.audience, count(*) AS n FROM ends en GROUP BY 1) x)
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_report_tour(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_report_tour(date, date) TO service_role;
