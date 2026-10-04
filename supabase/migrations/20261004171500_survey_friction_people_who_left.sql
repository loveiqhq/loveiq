-- get_survey_friction: per question, the PEOPLE who reached it and the people who
-- left there for good. Adds `sessions` and `quits`; every existing field keeps its
-- meaning.
--
-- WHY. "Where people quit the survey" was counted two wrong ways:
--
--   * `abandons` counts 'abandon' EVENTS, and the survey sends one every time the
--     page is hidden: a switch to another app or tab, a locked phone. Over the 30
--     days to 2026-10-03, 292 of 924 came from people who came back and finished.
--     Each was counted as someone quitting.
--   * the weekly chart (`get_dropout_funnel`) counts the people who reach a
--     question and not the next one. On the last screen there is no next one, so
--     the ~300 people who FINISHED there read as a 76% drop-off, its tallest bar.
--
-- `quits` counts sessions whose last event in the window is at this question and
-- that never finished. `sessions` counts the sessions that reached the question.
-- quits / sessions is the share of the people who reach a question who leave there
-- and never finish. Finishing is never quitting.
--
-- Last event by insert order (created_at, then id): the tracker flushes a session's
-- events in the order they happened, and a batch shares one created_at.

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
      COUNT(ms)::int AS timed,
      COUNT(DISTINCT session_id)::int AS sessions
    FROM rows
    GROUP BY question_index
  ),
  finished AS (
    SELECT DISTINCT session_id
      FROM public.survey_behavior_event
     WHERE direction = 'complete'
       AND created_at >= since_ts
       AND session_id IS NOT NULL
  ),
  last_event AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.question_index
      FROM public.survey_behavior_event e
     WHERE e.created_at >= since_ts
       AND e.created_at <  until_ts
       AND e.question_index IS NOT NULL
       AND e.session_id IS NOT NULL
     ORDER BY e.session_id, e.created_at DESC, e.id DESC
  ),
  quits AS (
    SELECT l.question_index, COUNT(*)::int AS quits
      FROM last_event l
      LEFT JOIN finished f ON f.session_id = l.session_id
     WHERE f.session_id IS NULL
     GROUP BY l.question_index
  )
  SELECT json_build_object(
    'questions', COALESCE(
      (SELECT json_agg(json_build_object(
                'question_index', p.question_index,
                'q_id',           p.q_id,
                'q_id_variants',  p.q_id_variants,
                'visits',         p.visits,
                'abandons',       p.abandons,
                'backs',          p.backs,
                'skipped',        p.skipped,
                'median_ms',      p.median_ms,
                'timed',          p.timed,
                'sessions',       p.sessions,
                'quits',          COALESCE(qu.quits, 0)
              ) ORDER BY p.question_index)
         FROM per_q p
         LEFT JOIN quits qu ON qu.question_index = p.question_index),
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
