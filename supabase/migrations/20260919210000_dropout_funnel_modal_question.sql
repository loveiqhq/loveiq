-- Name a survey position by the question most people actually saw, and say how
-- many of them saw it.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `MIN(q_id)` NAMES THE POSITION AFTER ITS RAREST QUESTION.
--
-- The survey branches — the landing page asks question one for some people and
-- not others, and several chapters are conditional — so one `question_index` is
-- a different question for different sessions. `get_dropout_funnel` collapsed
-- that with `MIN(q_id)`, which picks the alphabetically first id, and the
-- placeholder `'00000'` sorts before every real question id.
--
-- Measured 2026-09-19 over the 30 days to 17 Sep, position 54:
--
--     q_id 16012   270 sessions
--     q_id 16014    92
--     q_id 16013     8
--     q_id 00000     6     <- and this is the one the position was named after
--
-- Six sessions out of 376 decided the label for all of them. Positions 54, 55,
-- 56 and 57 all came back as `00000` for the same reason, which is why the
-- drop-off chart's last four bars were unnameable and why the friction report
-- could print a question name that most people at that position never saw.
--
-- MODE, not MIN: the question the largest number of sessions actually reached,
-- with the id broken deterministically on ties so the label cannot flicker
-- between runs on equal counts.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE CALLER CANNOT TELL A SHARP POSITION FROM A BRANCHED ONE.
--
-- Even named correctly, position 54 is question 16012 for 72% of sessions and
-- something else for the rest — so the drop between 54 and 55 is partly people
-- leaving and partly people on a different path. Positions early in the survey
-- are ~100% one question and their drop IS abandonment.
--
-- `q_share` is added so the difference is visible: the fraction of sessions at
-- that position who saw the modal question. The digest drops bars below a
-- threshold rather than drawing a cliff that is mostly branching — which is
-- what produced a 22% "quit" bar at the end of a survey people were finishing.
--
-- Additive only: `question_index`, `q_id` and `sessions` keep their names,
-- types and meaning, so an older caller that ignores `q_share` is unaffected.

CREATE OR REPLACE FUNCTION public.get_dropout_funnel(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  result JSON;
BEGIN
  WITH per_q_id AS (
    -- Sessions per (position, question). The unit is a SESSION, not an event:
    -- one person revisiting a question must not make it look more popular.
    SELECT question_index,
           q_id,
           COUNT(DISTINCT session_id)::int AS sessions
      FROM survey_behavior_event
     WHERE event_time >= since_ts
       AND event_time <  until_ts
       AND question_index IS NOT NULL
       -- Unchanged: excludes the retired email-FIRST arm so the curve stays
       -- one experiment. See the note on fetchDropoutFunnel.
       AND (email_position IS NULL OR email_position = 'first')
     GROUP BY question_index, q_id
  ),
  totals AS (
    SELECT question_index, COUNT(DISTINCT session_id)::int AS sessions
      FROM survey_behavior_event
     WHERE event_time >= since_ts
       AND event_time <  until_ts
       AND question_index IS NOT NULL
       AND (email_position IS NULL OR email_position = 'first')
     GROUP BY question_index
  ),
  modal AS (
    -- The most-seen question at each position. `q_id ASC` breaks ties so the
    -- label is stable between runs; without it two equally common questions
    -- would swap the label at random and the chart would appear to change.
    SELECT DISTINCT ON (question_index)
           question_index,
           q_id,
           sessions AS modal_sessions
      FROM per_q_id
     ORDER BY question_index, sessions DESC, q_id ASC
  )
  SELECT json_build_object(
    'questions', COALESCE((
      SELECT json_agg(json_build_object(
               'question_index', t.question_index,
               'q_id',           m.q_id,
               'sessions',       t.sessions,
               -- 0..1. How much of this position is ONE question.
               'q_share',        ROUND((m.modal_sessions::numeric / NULLIF(t.sessions, 0)), 3)
             ) ORDER BY t.question_index)
        FROM totals t
        JOIN modal  m ON m.question_index = t.question_index
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_dropout_funnel(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_dropout_funnel(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dropout_funnel(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.get_dropout_funnel(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Sessions reaching each survey POSITION, with the question most of them saw '
  'there and what share that is. A position is not a question: the survey '
  'branches, so late positions are a mix and their drop is partly people taking '
  'a different path rather than leaving. Use q_share to tell the two apart.';
