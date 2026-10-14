-- The survey page of AP-Analytics (/admin/ap/assessment-a/survey), beside ap_facts:
--
-- ap_survey_steps      per question, in a range of Berlin days: the sessions that went back
--                      from it, that passed it without an answer, and the median time on it
--                      (get_survey_friction's clamp: 0 to 30 minutes); and per question and
--                      day, the people who left there: their last step ever was on it, in the
--                      range, and they never finished (get_survey_dropoff_runs' rule). Who
--                      reached each question comes from get_survey_dropoff_runs itself.
-- ap_question_answers  for one question, every finished survey's answer in the range, with
--                      what the page can split by: source, gender, relationship, device, and
--                      the answer to a second question. Scales are 1 to 7. Open questions
--                      are free text and are not read here, except the country.
--
-- Staff (an owner email ending @loveiq.org) are left out where a finished survey shows it.
-- Service role only.

CREATE OR REPLACE FUNCTION public.ap_survey_steps(p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
  b AS (
    SELECT (p_from::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
           ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
  ),
  staff_sessions AS (
    SELECT s.session_id
      FROM survey_submission s
      JOIN app_user u ON u.id = s.user_id
     WHERE u.email ~* '@loveiq\.org$' AND s.session_id IS NOT NULL
  ),
  ev AS (
    SELECT e.session_id, e.q_id, e.direction, e.answered,
           CASE WHEN e.time_spent_ms >= 0 AND e.time_spent_ms < 1800000 THEN e.time_spent_ms END AS ms
      FROM survey_behavior_event e, b
     WHERE e.created_at >= b.since_ts AND e.created_at < b.until_ts
       AND e.session_id IS NOT NULL AND e.q_id IS NOT NULL
       AND e.session_id NOT IN (SELECT session_id FROM staff_sessions)
  ),
  steps AS (
    SELECT q_id,
           count(DISTINCT session_id) FILTER (WHERE direction = 'back') AS went_back,
           count(DISTINCT session_id) FILTER (WHERE answered IS FALSE AND direction = 'forward') AS skipped,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE ms IS NOT NULL) AS median_ms,
           count(ms) AS timed
      FROM ev
     GROUP BY q_id
  ),
  last_step AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.q_id, e.created_at
      FROM survey_behavior_event e
     WHERE e.session_id IN (SELECT DISTINCT session_id FROM ev) AND e.q_id IS NOT NULL
     ORDER BY e.session_id, e.created_at DESC, e.id DESC
  ),
  done AS (
    SELECT DISTINCT e.session_id
      FROM survey_behavior_event e
     WHERE e.direction = 'complete' AND e.session_id IN (SELECT DISTINCT session_id FROM ev)
  ),
  exits AS (
    SELECT l.q_id, (l.created_at AT TIME ZONE 'Europe/Berlin')::date AS day, count(*) AS n
      FROM last_step l, b
     WHERE l.created_at >= b.since_ts AND l.created_at < b.until_ts
       AND l.session_id NOT IN (SELECT session_id FROM done)
     GROUP BY 1, 2
  )
  SELECT json_build_object(
    'steps', (SELECT coalesce(json_agg(json_build_object(
                'q_id', s.q_id, 'went_back', s.went_back, 'skipped', s.skipped,
                'median_ms', round(s.median_ms), 'timed', s.timed)), '[]'::json) FROM steps s),
    'exits', (SELECT coalesce(json_agg(json_build_object('q_id', x.q_id, 'day', x.day, 'n', x.n)), '[]'::json) FROM exits x)
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_survey_steps(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_survey_steps(date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.ap_question_answers(p_from date, p_to date, p_qid text, p_other text DEFAULT NULL)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
  b AS (
    SELECT (p_from::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
           ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
  ),
  subs AS (
    SELECT s.id, s.user_id, s.utm_tracker, s.session_id
      FROM survey_submission s, b
     WHERE s.status = 'completed'
       AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM app_user u WHERE u.id = s.user_id AND u.email ~* '@loveiq\.org$')
  ),
  q AS (
    SELECT sq.id, sq.frontend_qid, sq.type
      FROM survey_question sq
     WHERE sq.frontend_qid IN (p_qid, p_other)
       AND (sq.type IN ('scale', 'single', 'multiple') OR sq.frontend_qid = '15001')
  ),
  answers AS (
    SELECT a.survey_submission_id AS sid, q.frontend_qid AS qid,
           CASE
             WHEN q.type = 'scale' THEN array[trim(to_char(a.normalized_value, 'FM999990'))]
             WHEN q.type = 'multiple' THEN (
               SELECT array_agg(ao.option_text ORDER BY ao.display_order, ao.id)
                 FROM survey_submission_answer_options o
                 JOIN answer_option ao ON ao.id = o.answer_option_id
                WHERE o.survey_submission_answer_id = a.id)
             WHEN a.answer_option_id IS NOT NULL THEN (SELECT array[ao.option_text] FROM answer_option ao WHERE ao.id = a.answer_option_id)
             WHEN q.frontend_qid = '15001' THEN array[a.answer_text]
           END AS vals
      FROM survey_submission_answer a
      JOIN q ON q.id = a.survey_question_id
     WHERE a.survey_submission_id IN (SELECT id FROM subs)
       AND coalesce(a.was_skipped, false) = false
  )
  SELECT json_build_object(
    'rows', (
      SELECT coalesce(json_agg(json_build_object(
               'answer', mine.vals,
               'other', other.vals,
               'src', t.j->>'utm_source', 'med', t.j->>'utm_medium',
               'ads', (coalesce(t.j->>'gclid', '') <> '' OR coalesce(t.j->>'gbraid', '') <> '' OR coalesce(t.j->>'wbraid', '') <> ''),
               'gender', up.gender, 'relationship', up.relationship_status,
               -- As ap_facts: the pricing quote's device, else the survey steps' (from 12 Oct 2026).
               'device', coalesce(
                 (SELECT q2.device_type FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.device_type IS NOT NULL ORDER BY q2.created_date_time DESC LIMIT 1),
                 (SELECT e.device_type FROM survey_behavior_event e WHERE e.session_id = s.session_id AND e.device_type IS NOT NULL ORDER BY e.created_at DESC LIMIT 1)),
               'tier', (SELECT q2.country_tier FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.country_tier IS NOT NULL ORDER BY q2.created_date_time DESC LIMIT 1)
             )), '[]'::json)
        FROM subs s
        JOIN answers mine ON mine.sid = s.id AND mine.qid = p_qid
        LEFT JOIN answers other ON other.sid = s.id AND other.qid = p_other
        LEFT JOIN app_user u ON u.id = s.user_id
        LEFT JOIN user_profile up ON up.id = u.user_profile_id,
        LATERAL (SELECT CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                              AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                         THEN s.utm_tracker::jsonb END AS j) t
       WHERE mine.vals IS NOT NULL
    ),
    'finished', (SELECT count(*) FROM subs)
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_question_answers(date, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_question_answers(date, date, text, text) TO service_role;
