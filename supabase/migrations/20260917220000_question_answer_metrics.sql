-- Question-effectiveness was reading 4% of its own answers.
--
-- `/rest/v1/survey_submission_answer?...&survey_submission.created_date_time=gte.<30d>`
-- joins to 24,814 rows and the capped read returned PostgREST's 1,000-row
-- maximum. Skip rate and revision count per question — the whole output of
-- that page — were computed on that slice.
--
-- Aggregated here, the same way get_survey_friction and get_question_scorecard
-- already are: 24,814 rows become 58, one per question, in one request.
--
-- The behaviour-event half of that page is PAGED rather than aggregated, on
-- purpose. Its per-question source split is keyed on `sourceLabel()` and
-- `classifyPlacement()`, which parse a utm_tracker in TypeScript and are tested
-- there; expressing them in SQL would be two definitions of one thing. Grouping
-- by the raw tracker instead only collapses 26,564 rows to 15,178, which is
-- still past the cap — so there is nothing to win there and a real risk of the
-- two definitions drifting.
CREATE OR REPLACE FUNCTION public.get_question_answer_metrics(since_ts timestamptz)
RETURNS TABLE (
  frontend_qid text,
  total bigint,
  skipped bigint,
  revision_total bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT q.frontend_qid,
         count(*)                                              AS total,
         count(*) FILTER (WHERE a.was_skipped)                  AS skipped,
         COALESCE(SUM(COALESCE(a.revision_count, 0)), 0)::bigint AS revision_total
  FROM public.survey_submission_answer a
  JOIN public.survey_question q ON q.id = a.survey_question_id
  JOIN public.survey_submission s ON s.id = a.survey_submission_id
  WHERE (since_ts IS NULL OR s.created_date_time >= since_ts)
    AND q.frontend_qid IS NOT NULL
    AND q.frontend_qid NOT LIKE '00%'
  GROUP BY q.frontend_qid;
$$;

COMMENT ON FUNCTION public.get_question_answer_metrics(timestamptz) IS
  'Per-question skip and revision totals over a window. Aggregated here because the join is past PostgREST''s 1,000-row response cap.';

REVOKE ALL ON FUNCTION public.get_question_answer_metrics(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_question_answer_metrics(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.get_question_answer_metrics(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_question_answer_metrics(timestamptz) TO service_role;
