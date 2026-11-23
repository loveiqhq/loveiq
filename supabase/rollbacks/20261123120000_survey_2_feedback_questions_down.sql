-- Rollback for supabase/migrations/20261123120000_survey_2_feedback_questions.sql
-- (creates questions 17001, 17002 and 17003, 17003's seven options, and their survey mappings).
--
-- Apply:  psql "$DATABASE_URL" -f supabase/rollbacks/20261123120000_survey_2_feedback_questions_down.sql
--
-- DATA LOSS: only if a question has been answered, and in that case its delete is REFUSED. Once
-- real answers exist, prefer `UPDATE survey_question SET status = 'retired'` over removal:
-- retiring stops the question being asked while every answer stays joinable.
--
-- Idempotent: matches nothing once the questions are gone.

BEGIN;

DO $$
DECLARE
  v_qid     TEXT;
  v_q_id    BIGINT;
  v_answers BIGINT;
BEGIN
  FOREACH v_qid IN ARRAY ARRAY['17001', '17002', '17003'] LOOP
    SELECT id INTO v_q_id FROM survey_question WHERE frontend_qid = v_qid;
    IF v_q_id IS NULL THEN
      RAISE NOTICE '% not present, nothing to roll back', v_qid;
      CONTINUE;
    END IF;

    SELECT count(*) INTO v_answers FROM survey_submission_answer WHERE survey_question_id = v_q_id;
    IF v_answers > 0 THEN
      RAISE EXCEPTION 'Refusing to delete %: % answer(s) recorded. Retire it instead (status = ''retired'').', v_qid, v_answers;
    END IF;

    DELETE FROM survey_question_mapping WHERE question_id = v_q_id;
    DELETE FROM answer_option           WHERE survey_question_id = v_q_id;
    DELETE FROM survey_question         WHERE id = v_q_id;
  END LOOP;
END $$;

COMMIT;
