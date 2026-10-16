-- Rollback for 20261012093000_survey_event_device. FIRST deploy a route that no longer
-- writes device_type: PostgREST refuses a whole insert naming a column that does not exist,
-- and every survey step would be lost. Then put get_survey_dropoff_runs back as it was
-- (20261012003000) and drop the column.

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

ALTER TABLE public.survey_behavior_event DROP COLUMN IF EXISTS device_type;
