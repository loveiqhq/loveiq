-- get_survey_friction: going back and answer time per QUESTION too.
--
-- `by_question` carried only reach and quits, so the other survey sentences
-- ("go back a step there", "people take 21.4s on Q9") still came from the
-- per-POSITION rows, which mix two questions wherever the flow differs between
-- people and between the survey before and after 2026-09-11. Each q_id now also
-- carries `went_back` (sessions that went back from it), `median_ms` and `timed`,
-- so every survey sentence can name a question as it is asked today.
--
-- Additive: every existing field is unchanged.

CREATE OR REPLACE FUNCTION public.get_survey_friction(since_ts timestamp with time zone, until_ts timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
BEGIN
  WITH rows AS (
    SELECT
      e.question_index,
      e.q_id,
      e.direction,
      e.answered,
      e.session_id,
      CASE
        WHEN e.time_spent_ms >= 0 AND e.time_spent_ms < 1800000 THEN e.time_spent_ms
        ELSE NULL
      END AS ms
    FROM public.survey_behavior_event e
    WHERE e.created_at >= since_ts
      AND e.created_at <  until_ts
      AND e.question_index IS NOT NULL
  ),
  per_q AS (
    SELECT
      question_index,
      MODE() WITHIN GROUP (ORDER BY q_id) AS q_id,
      COUNT(DISTINCT q_id)::int AS q_id_variants,
      COUNT(*)::int AS visits,
      COUNT(*) FILTER (WHERE direction = 'abandon')::int AS abandons,
      COUNT(*) FILTER (WHERE direction = 'back')::int AS backs,
      COUNT(*) FILTER (WHERE answered IS FALSE AND direction = 'forward')::int AS skipped,
      COALESCE(
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE ms IS NOT NULL),
        0
      )::int AS median_ms,
      COUNT(ms)::int AS timed
    FROM rows
    GROUP BY question_index
  ),
  reach AS (
    SELECT
      q_id,
      COUNT(DISTINCT session_id)::int AS sessions,
      COUNT(DISTINCT session_id) FILTER (WHERE direction = 'back')::int AS went_back,
      COALESCE(
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE ms IS NOT NULL),
        0
      )::int AS median_ms,
      COUNT(ms)::int AS timed
      FROM rows
     WHERE q_id IS NOT NULL
       AND session_id IS NOT NULL
     GROUP BY q_id
  ),
  finished AS (
    SELECT DISTINCT session_id
      FROM public.survey_behavior_event
     WHERE direction = 'complete'
       AND created_at >= since_ts
       AND session_id IS NOT NULL
  ),
  last_event AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.q_id, e.created_at
      FROM public.survey_behavior_event e
     WHERE e.created_at >= since_ts
       AND e.question_index IS NOT NULL
       AND e.session_id IS NOT NULL
     ORDER BY e.session_id, e.created_at DESC, e.id DESC
  ),
  quits AS (
    SELECT l.q_id, COUNT(*)::int AS quits
      FROM last_event l
      LEFT JOIN finished f ON f.session_id = l.session_id
     WHERE f.session_id IS NULL
       AND l.created_at < until_ts
       AND l.q_id IS NOT NULL
     GROUP BY l.q_id
  )
  SELECT json_build_object(
    'questions', COALESCE(
      (SELECT json_agg(json_build_object(
                'question_index', question_index,
                'q_id',           q_id,
                'q_id_variants',  q_id_variants,
                'visits',         visits,
                'abandons',       abandons,
                'backs',          backs,
                'skipped',        skipped,
                'median_ms',      median_ms,
                'timed',          timed
              ) ORDER BY question_index)
         FROM per_q),
      '[]'::json
    ),
    'by_question', COALESCE(
      (SELECT json_agg(json_build_object(
                'q_id',      r.q_id,
                'sessions',  r.sessions,
                'quits',     COALESCE(qu.quits, 0),
                'went_back', r.went_back,
                'median_ms', r.median_ms,
                'timed',     r.timed
              ) ORDER BY r.q_id)
         FROM reach r
         LEFT JOIN quits qu ON qu.q_id = r.q_id),
      '[]'::json
    ),
    'total_rows',  (SELECT COUNT(*)::int FROM rows),
    'total_timed', (SELECT COUNT(ms)::int FROM rows),
    'median_ms',   (SELECT COALESCE(
                      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ms)
                        FILTER (WHERE ms IS NOT NULL), 0)::int FROM rows)
  )
  INTO result;

  RETURN result;
END;
$function$;
