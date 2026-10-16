-- get_survey_dropoff_runs: the KPI "Survey Drop-off Rate per Question %", one row per
-- person instead of one per question, so the KPI page can be cut by traffic source and by
-- the two running survey tests (Marcus, 2026-10-05 and 2026-10-09: "split by traffic
-- source", "filter / adjustment options").
--
-- Same measure as get_survey_friction -> by_question, and it must stay so: summed per
-- question, `reached` and `left_at` give exactly its `sessions` and `quits` (checked on
-- production for the weeks of 21 Sep, 28 Sep and 5 Oct: 0 differences over 57 to 62
-- questions). A person reached a question when a question event of theirs on it falls in
-- the window. They left at it when their LAST question event ever (from since_ts on, no
-- upper bound) is on it, falls inside the window, and they have no `complete` event.
--
-- started_at is the person's first survey event ever, so readouts of the tests can keep to
-- runs begun after each launch: both arms are derived from the session id
-- (questionOrderArm.ts, emailQuestionArm.ts) and a derived arm exists for every session
-- ever recorded.
--
-- source: google_ads when their submission or draft carries a Google Ads click id (gclid,
-- gbraid or wbraid, the rule of classifyTraffic in features/attribution/server/traffic.ts);
-- other when one exists without; unknown when neither does. Unknown is mostly people who
-- left on the first screen before a draft was saved. Finished surveys keep no draft, so the
-- submission counts too.
--
-- One JSON array, not a set of rows: PostgREST caps a set at 1,000 rows (POSTGREST_MAX_ROWS)
-- and says nothing, and a test's window since launch passes that within weeks.
--
-- Session ids reach drafts, so this is the service role's alone.

CREATE OR REPLACE FUNCTION public.get_survey_dropoff_runs(
  since_ts timestamp with time zone,
  until_ts timestamp with time zone
)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH win AS (
    SELECT e.session_id, array_agg(DISTINCT e.q_id ORDER BY e.q_id) AS reached
      FROM survey_behavior_event e
     WHERE e.created_at >= since_ts
       AND e.created_at <  until_ts
       AND e.question_index IS NOT NULL
       AND e.session_id IS NOT NULL
       AND e.q_id IS NOT NULL
     GROUP BY e.session_id
  ),
  last_event AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.q_id, e.created_at
      FROM survey_behavior_event e
     WHERE e.created_at >= since_ts
       AND e.question_index IS NOT NULL
       AND e.session_id IS NOT NULL
     ORDER BY e.session_id, e.created_at DESC, e.id DESC
  ),
  finished AS (
    SELECT DISTINCT e.session_id
      FROM survey_behavior_event e
     WHERE e.direction = 'complete'
       AND e.created_at >= since_ts
       AND e.session_id IS NOT NULL
  ),
  started AS (
    SELECT e.session_id, min(e.created_at) AS started_at
      FROM survey_behavior_event e
      JOIN win w ON w.session_id = e.session_id
     GROUP BY e.session_id
  ),
  trackers AS (
    SELECT w.session_id,
           bool_or(t.has_row) AS has_row,
           bool_or(tracker_arm(t.tracker, 'gclid') <> 'unknown'
                OR tracker_arm(t.tracker, 'gbraid') <> 'unknown'
                OR tracker_arm(t.tracker, 'wbraid') <> 'unknown') AS ads
      FROM win w
      LEFT JOIN LATERAL (
        SELECT s.utm_tracker AS tracker, true AS has_row
          FROM survey_submission s
         WHERE s.session_id = w.session_id
        UNION ALL
        SELECT d.utm_tracker, true
          FROM survey_partial_save d
         WHERE d.session_id = w.session_id
      ) t ON true
     GROUP BY w.session_id
  )
  SELECT coalesce(json_agg(json_build_object(
           'session_id', w.session_id,
           'started_at', st.started_at,
           'reached',    w.reached,
           'left_at',    CASE WHEN f.session_id IS NULL AND l.created_at < until_ts THEN l.q_id END,
           'source',     CASE
                           WHEN coalesce(tr.ads, false) THEN 'google_ads'
                           WHEN coalesce(tr.has_row, false) THEN 'other'
                           ELSE 'unknown'
                         END
         ) ORDER BY w.session_id), '[]'::json)
    FROM win w
    JOIN started st ON st.session_id = w.session_id
    LEFT JOIN last_event l ON l.session_id = w.session_id
    LEFT JOIN finished f ON f.session_id = w.session_id
    LEFT JOIN trackers tr ON tr.session_id = w.session_id;
$function$;

REVOKE ALL ON FUNCTION public.get_survey_dropoff_runs(timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_survey_dropoff_runs(timestamp with time zone, timestamp with time zone) TO service_role;
