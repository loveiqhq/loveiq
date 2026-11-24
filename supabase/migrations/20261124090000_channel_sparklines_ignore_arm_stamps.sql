-- The funnel digest's per-channel sparklines (get_channel_sparklines) count a finish and a
-- purchase only when the survey's utm_tracker exists, and a start by its draft's tracker. Since
-- 20261105120000 a tracker holding only the first page (landing_path) counts as none, because
-- /api/survey may start one for a visitor with no campaign tags, and that visitor's draft has
-- none: their finishes would otherwise join 'direct' without their starts.
--
-- From PR #772 (24 Nov 2026) /api/survey stamps the first page BEFORE the experiment arms, so
-- that tracker also holds question_order_arm, contact_question_arm and gate_reveal_arm (and a
-- pay-to-start run's journey label). None of these is attribution: the server derives them, the
-- browser never sends them. So a tracker holding only these stamps counts as none, as before.
-- Checked on production before applying: the new rule counts every one of the 2,080
-- submissions and 502 drafts with a tracker exactly as the old one did.
--
-- Replaced whole: 20261105120000's body (equal to production's, pg_get_functiondef, 24 Nov
-- 2026) with the three conditions widened and nothing else. Applied to production and staging
-- with its ledger row before #772 merged.
-- Rollback: supabase/rollbacks/20261124090000_channel_sparklines_ignore_arm_stamps_down.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_channel_sparklines(since_ts timestamp with time zone, until_ts timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE result JSON; since_day DATE := (since_ts AT TIME ZONE 'Europe/Berlin')::date; until_day DATE := (until_ts AT TIME ZONE 'Europe/Berlin')::date;
BEGIN
  WITH days AS (SELECT d::date AS day FROM generate_series(since_day, until_day - INTERVAL '1 day', INTERVAL '1 day') AS d),
  subs AS (
    SELECT ss.id, (ss.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day, ss.status,
      COALESCE(NULLIF(LOWER(TRIM((ss.utm_tracker::jsonb)->>'utm_source')), ''), 'direct') AS source
    FROM survey_submission ss
    WHERE ss.created_date_time >= since_ts AND ss.created_date_time < until_ts
      AND ss.utm_tracker IS NOT NULL AND ss.utm_tracker <> '' AND ss.utm_tracker LIKE '{%}'
      -- A tracker holding only the server's own stamps (the first page, the journey label and
      -- the experiment arms) is no tracker here: none of them is attribution.
      AND (ss.utm_tracker::jsonb - ARRAY['landing_path', 'journey', 'question_order_arm', 'contact_question_arm', 'gate_reveal_arm']) <> '{}'::jsonb
  ),
  starts AS (
    SELECT (sps.started_at AT TIME ZONE 'Europe/Berlin')::date AS day,
      COALESCE(NULLIF(LOWER(TRIM((sps.utm_tracker::jsonb)->>'utm_source')), ''), 'direct') AS source,
      COUNT(DISTINCT sps.session_id)::int AS n
    FROM survey_partial_save sps
    WHERE sps.started_at >= since_ts AND sps.started_at < until_ts
      AND sps.utm_tracker IS NOT NULL AND sps.utm_tracker <> '' AND sps.utm_tracker LIKE '{%}'
      AND (sps.utm_tracker::jsonb - ARRAY['landing_path', 'journey', 'question_order_arm', 'contact_question_arm', 'gate_reveal_arm']) <> '{}'::jsonb
    GROUP BY (sps.started_at AT TIME ZONE 'Europe/Berlin')::date, COALESCE(NULLIF(LOWER(TRIM((sps.utm_tracker::jsonb)->>'utm_source')), ''), 'direct')
  ),
  completions AS (SELECT day, source, COUNT(*)::int AS n FROM subs WHERE status = 'completed' GROUP BY day, source),
  purch AS (
    SELECT (p.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day,
      COALESCE(NULLIF(LOWER(TRIM((ss.utm_tracker::jsonb)->>'utm_source')), ''), 'direct') AS source,
      COUNT(*)::int AS n
    FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
    JOIN survey_submission ss ON ss.id = pr.survey_submission_id
    WHERE p.status = 'succeeded' AND coalesce(p.is_test, false) = false AND p.created_date_time >= since_ts AND p.created_date_time < until_ts
      AND ss.utm_tracker IS NOT NULL AND ss.utm_tracker <> '' AND ss.utm_tracker LIKE '{%}'
      -- A tracker holding only the server's own stamps (the first page, the journey label and
      -- the experiment arms) is no tracker here: none of them is attribution.
      AND (ss.utm_tracker::jsonb - ARRAY['landing_path', 'journey', 'question_order_arm', 'contact_question_arm', 'gate_reveal_arm']) <> '{}'::jsonb
    GROUP BY (p.created_date_time AT TIME ZONE 'Europe/Berlin')::date, COALESCE(NULLIF(LOWER(TRIM((ss.utm_tracker::jsonb)->>'utm_source')), ''), 'direct')
  ),
  per_source_day AS (
    SELECT day, source, SUM(starts_n) AS starts, SUM(comp_n) AS completions, SUM(purch_n) AS purchases
    FROM (
      SELECT day, source, n AS starts_n, 0 AS comp_n, 0 AS purch_n FROM starts
      UNION ALL SELECT day, source, 0, n, 0 FROM completions
      UNION ALL SELECT day, source, 0, 0, n FROM purch
    ) u GROUP BY day, source
  )
  SELECT json_build_object('days', COALESCE((
    SELECT json_agg(json_build_object(
      'day', to_char(days.day, 'YYYY-MM-DD'),
      'sources', COALESCE((
        SELECT json_object_agg(source, json_build_object('starts', starts, 'completions', completions, 'purchases', purchases))
        FROM per_source_day psd WHERE psd.day = days.day
      ), '{}'::json)
    ) ORDER BY days.day) FROM days
  ), '[]'::json)) INTO result;
  RETURN result;
END;
$function$;

COMMIT;
