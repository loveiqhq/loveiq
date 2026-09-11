-- Rollback for supabase/migrations/20260911152724_survey_question_16009_priced_choice.sql
-- (creates question 16009, its five options and its survey mapping).
--
-- Apply:  psql "$DATABASE_URL" -f supabase/rollbacks/20260911152724_survey_question_16009_priced_choice_down.sql
--
-- DATA LOSS: only if 16009 has been answered — and in that case the delete is REFUSED.
-- Once real answers exist, prefer `UPDATE survey_question SET status = 'retired'` over
-- removal: retiring stops the question being asked while every answer stays joinable.
--
-- Idempotent: matches nothing once the question is gone.

BEGIN;

DO $$
DECLARE
  v_q_id    bigint;
  v_answers bigint;
BEGIN
  SELECT id INTO v_q_id FROM survey_question WHERE frontend_qid = '16009';
  IF v_q_id IS NULL THEN
    RAISE NOTICE '16009 not present, nothing to roll back';
    RETURN;
  END IF;

  SELECT count(*) INTO v_answers FROM survey_submission_answer WHERE survey_question_id = v_q_id;
  IF v_answers > 0 THEN
    RAISE EXCEPTION 'Refusing to delete 16009: % answer(s) recorded. Retire it instead (status = ''retired'').', v_answers;
  END IF;

  DELETE FROM survey_question_mapping WHERE question_id = v_q_id;
  DELETE FROM answer_option           WHERE survey_question_id = v_q_id;
  DELETE FROM survey_question         WHERE id = v_q_id;
END $$;

COMMIT;
