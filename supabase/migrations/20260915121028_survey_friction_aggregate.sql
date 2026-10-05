-- Per-question survey friction, aggregated in SQL instead of in the app.
--
-- WHY THIS EXISTS. The friction scoreboard first read survey_behavior_event
-- directly over PostgREST with `limit=50000`. PostgREST caps responses at its
-- own `max-rows` (1000 here) and says nothing about it: no error, no warning,
-- no truncation flag. 26,109 rows existed for the 30-day window and 1,000 came
-- back -- a 4% sample, and not a random one.
--
-- That is not a performance footnote, it changed the answer. On the truncated
-- sample the worst drop-off question was Q11 at 14%. On the full data it is
-- Q58, the email question, which loses roughly a fifth of everyone who reaches
-- it -- three to four times worse than anything else and the single most
-- valuable thing the whole scoreboard has to say. A silently-sampled dashboard
-- is worse than no dashboard, because it is confidently wrong.
--
-- Aggregating here returns ~59 rows instead of 26,109, so the cap can never
-- apply again, and the median is computed by the database rather than by
-- shipping every row to Node to sort.
--
-- Mirrors get_dropout_funnel's shape: STABLE, SECURITY DEFINER, pinned
-- search_path, JSON out, half-open window [since, until).

CREATE OR REPLACE FUNCTION public.get_survey_friction(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
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
      -- 0ms is a real reading (a question that auto-advances). A negative or
      -- absurd one is a clock glitch and would drag a median further than it
      -- deserves, so it is dropped from the timing stats only -- the row still
      -- counts as a visit.
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
      -- The question MOST people saw at this position.
      --
      -- This was MIN(q_id), which is arbitrary, and arbitrary turned out to be
      -- actively wrong: the survey branches, so one index maps to several
      -- questions, and MIN picked the alphabetically smallest regardless of how
      -- rare it was. Index 0 was labelled "What is your email?" off 7 rows
      -- while 723 rows said "What is your name?"; index 47 was named by a
      -- 4-row variant out of 407. Every label on the scoreboard was a
      -- plausible-looking lie, which is the worst kind -- nothing about
      -- "Q1 - What is your email?" looks broken.
      MODE() WITHIN GROUP (ORDER BY q_id) AS q_id,
      -- Surfaced so a caller can tell how branched a position is. 1 means the
      -- label is exact; 5 means it is what most people saw.
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
    -- Totals come from the same scan, so a row can never disagree with the
    -- denominator printed beside it.
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

REVOKE ALL ON FUNCTION public.get_survey_friction(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_survey_friction(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.get_survey_friction(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Per-question survey friction (visits, abandons, backs, skipped, median dwell) for the friction scoreboard. Aggregated server-side: reading the raw table over PostgREST silently truncates at max-rows and changed which question ranked worst.';
