-- survey_behavior_event.device_type: the device a survey step came from, so the KPI page
-- "Survey Drop-off Rate per Question %" can split phone from computer (Eman, 2026-10-12).
-- Nothing recorded it for people who leave the survey: the submission and the price quote
-- know it only for those who finish, and PostHog's survey events carry no survey session id.
--
-- Set by /api/survey-tracking from the request's User-Agent with the classifier the price
-- quote already uses (getDeviceTypeFromUserAgent): iOS, Android or Desktop, so the two agree.
-- Only that class is kept, never the User-Agent itself. NULL for steps recorded before
-- 2026-10-12 and for a request without a User-Agent. iPadOS Safari sends a Mac User-Agent,
-- so iPads count as Desktop, as they do in pricing.
--
-- APPLY BEFORE DEPLOYING THE ROUTE THAT WRITES IT: PostgREST refuses a whole insert that
-- names a column it does not know, and every survey step would be lost until it exists.
--
-- get_survey_dropoff_runs (20261012003000) also returns `device` per person: the device of
-- their latest step since since_ts, the step where they left if they did. One session id is
-- one browser, so it does not change within a run. Everything else is unchanged.

ALTER TABLE public.survey_behavior_event
  ADD COLUMN IF NOT EXISTS device_type text
  CONSTRAINT survey_behavior_event_device_type_check
  CHECK (device_type IN ('iOS', 'Android', 'Desktop'));

COMMENT ON COLUMN public.survey_behavior_event.device_type IS
  'iOS, Android or Desktop, from the request User-Agent (getDeviceTypeFromUserAgent). NULL before 2026-10-12.';

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
    SELECT DISTINCT ON (e.session_id) e.session_id, e.q_id, e.created_at, e.device_type
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
                         END,
           'device',     l.device_type
         ) ORDER BY w.session_id), '[]'::json)
    FROM win w
    JOIN started st ON st.session_id = w.session_id
    LEFT JOIN last_event l ON l.session_id = w.session_id
    LEFT JOIN finished f ON f.session_id = w.session_id
    LEFT JOIN trackers tr ON tr.session_id = w.session_id;
$function$;

REVOKE ALL ON FUNCTION public.get_survey_dropoff_runs(timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_survey_dropoff_runs(timestamp with time zone, timestamp with time zone) TO service_role;
