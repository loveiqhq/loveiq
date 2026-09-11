-- Rollback for supabase/migrations/20260911151600_answer_option_16011_paid_for.sql
-- (adds the three new answer options for the reworded 16011).
--
-- Apply:  psql "$DATABASE_URL" -f supabase/rollbacks/20260911151600_answer_option_16011_paid_for_down.sql
--
-- DATA LOSS: only if respondents have already picked these options — and in that case the
-- delete is REFUSED rather than cascading. survey_submission_answer_options references
-- answer_option by id, so removing a chosen option would take real answers with it.
--
-- Idempotent: the WHERE clause matches nothing once the rows are gone.

BEGIN;

DO $$
DECLARE
  v_linked bigint;
BEGIN
  SELECT count(*) INTO v_linked
  FROM survey_submission_answer_options sso
  JOIN answer_option ao ON ao.id = sso.answer_option_id
  JOIN survey_question q ON q.id = ao.survey_question_id
  WHERE q.frontend_qid = '16011'
    AND ao.option_text IN ('Books, courses, or programs', 'An app or subscription', 'A retreat, workshop, or group');

  IF v_linked > 0 THEN
    RAISE EXCEPTION 'Refusing to delete: % answer(s) already reference these options. Leave them in place — an unused option costs nothing.', v_linked;
  END IF;
END $$;

DELETE FROM answer_option ao
USING survey_question q
WHERE ao.survey_question_id = q.id
  AND q.frontend_qid = '16011'
  AND ao.option_text IN ('Books, courses, or programs', 'An app or subscription', 'A retreat, workshop, or group');

COMMIT;
