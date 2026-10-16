-- Which survey questions move together: the "conditionality" question (Mark, 2026-07-21: "how
-- many questions we truly need ... if we use conditionality"), asked of Jarvis on 2026-09-18
-- as a raw SQL correlation that query_product_data refuses to run. This is that query, as an
-- analysis function the brain can call (`get_` is its read-only prefix).
--
-- Every pair of SCALE questions, correlated (Pearson) over the people who answered both, with
-- how many people that is. Single and multiple choice questions carry no normalized value, so
-- they are not in it. One survey per person, their latest finish, so a tester who finished 31
-- times counts once; the team's own surveys are left out by the rule get_report_friction and
-- the funnel readouts use ('@loveiq\.org$', mirroring isStaffEmail). Totals over hundreds of
-- people, never a person.
--
-- since_ts and until_ts bound the finish time (null for open); min_people and min_r drop the
-- pairs too thin or too weak to matter. No defaults, so no overload can appear later.

CREATE OR REPLACE FUNCTION public.get_answer_correlations(
  since_ts timestamp with time zone,
  until_ts timestamp with time zone,
  min_people integer,
  min_r numeric
)
 RETURNS TABLE(question_a text, question_b text, text_a text, text_b text, people bigint, r numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH latest AS (
    SELECT DISTINCT ON (coalesce(s.user_id, -s.id)) s.id
      FROM survey_submission s
      LEFT JOIN app_user u ON u.id = s.user_id
     WHERE s.status = 'completed'
       AND (since_ts IS NULL OR s.created_date_time >= since_ts)
       AND (until_ts IS NULL OR s.created_date_time < until_ts)
       AND coalesce(u.email, '') !~* '@loveiq\.org$'
     ORDER BY coalesce(s.user_id, -s.id), s.created_date_time DESC, s.id DESC
  ),
  a AS (
    SELECT ssa.survey_submission_id AS sid,
           q.frontend_qid AS qid,
           left(q.question, 140) AS question,
           ssa.normalized_value::double precision AS v
      FROM survey_submission_answer ssa
      JOIN latest l ON l.id = ssa.survey_submission_id
      JOIN survey_question q ON q.id = ssa.survey_question_id
     WHERE q.type = 'scale'
       AND ssa.normalized_value IS NOT NULL
  )
  SELECT x.qid, y.qid, x.question, y.question, count(*), round(corr(x.v, y.v)::numeric, 3)
    FROM a x
    JOIN a y ON y.sid = x.sid AND x.qid < y.qid
   GROUP BY x.qid, y.qid, x.question, y.question
  HAVING count(*) >= greatest(coalesce(min_people, 0), 30)
     AND abs(corr(x.v, y.v)) >= coalesce(min_r, 0)
   ORDER BY abs(corr(x.v, y.v)) DESC NULLS LAST, x.qid, y.qid
   LIMIT 200;
$function$;

REVOKE ALL ON FUNCTION public.get_answer_correlations(timestamp with time zone, timestamp with time zone, integer, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_answer_correlations(timestamp with time zone, timestamp with time zone, integer, numeric) TO service_role;
