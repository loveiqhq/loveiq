-- Per-question answer totals, aggregated in SQL.
--
-- /api/admin/scorecard read survey_submission_answer with no filter and no
-- ORDER BY behind `Range: "0-49999"`. PostgREST caps a response at 1,000 rows
-- with no error, so the scorecard was built from an arbitrary 1,000 of 121,987
-- answers — 0.8%, and at roughly 59 questions per submission that is about
-- seventeen people out of 2,061. Skip rate, average time and revision count
-- were all computed on it.
--
-- Paging 122 requests to fix that would be absurd, so the GROUP BY moves to the
-- database. Same precedent as get_survey_friction, added 2026-09-15 for exactly
-- this reason on survey_behavior_event.
--
-- Returns TOTALS only. The composite score, its weights and the green/yellow/red
-- thresholds stay in the route, so this migration changes what the numbers are
-- computed FROM and nothing about how they are scored.
--
-- SECURITY INVOKER with an explicit search_path: the caller is the service
-- role, which bypasses RLS anyway, and a DEFINER function here would join the
-- list of anon-executable definers the database linter already flags.
CREATE OR REPLACE FUNCTION public.get_question_scorecard()
RETURNS TABLE (
  survey_question_id bigint,
  total_answers bigint,
  skipped bigint,
  total_time bigint,
  time_count bigint,
  total_revisions bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    a.survey_question_id,
    count(*)                                                        AS total_answers,
    count(*) FILTER (WHERE a.was_skipped)                           AS skipped,
    COALESCE(SUM(a.time_spent_seconds)
             FILTER (WHERE a.time_spent_seconds > 0), 0)::bigint    AS total_time,
    count(*) FILTER (WHERE a.time_spent_seconds > 0)                AS time_count,
    COALESCE(SUM(COALESCE(a.revision_count, 0)), 0)::bigint         AS total_revisions
  FROM public.survey_submission_answer a
  WHERE a.survey_question_id IS NOT NULL
  GROUP BY a.survey_question_id;
$$;

COMMENT ON FUNCTION public.get_question_scorecard() IS
  'Per-question answer totals for /api/admin/scorecard. Aggregated here because the table is past PostgREST''s 1,000-row response cap.';

-- Not callable by a signed-out or signed-in browser; only the service role.
REVOKE ALL ON FUNCTION public.get_question_scorecard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_question_scorecard() FROM anon;
REVOKE ALL ON FUNCTION public.get_question_scorecard() FROM authenticated;
