-- Database rows for Mark's two open-text content asks, 16019 and 16020, and the database's
-- copy of two reworded stems, 16011 and 16018 (C12). The wording of 16019 and 16020, and the
-- subinfo (the survey's "Info and guidance"), are Marcus's 30.09 refinement in the
-- Assessment Questions sheet.
--
-- WHY THE ROWS. submit_survey resolves a question by survey_question.frontend_qid and,
-- finding nothing, skips the answer with no error (see 20260918081040). Without these rows
-- both questions would render, feel normal, and collect nothing. Open questions take no
-- answer_option rows: the answer lands in survey_submission_answer.answer_text, as it does
-- for 00001 and 15002 (seed, 20260307100001).
--
-- BOTH ARE OPTIONAL. required = false matches the survey data, where the flag is derived
-- from the subtitle the respondent reads ("Optional. Share as much or as little as you
-- like."). The API drops a blank optional answer before submit_survey runs, so a skipped
-- question stores no row at all rather than an empty one.
--
-- STAGING ONLY, LIKE THE DEMAND BLOCK. Production renders the survey from main, which does
-- not ask these questions, so the rows are inert there: shown to nobody, and only a
-- reverse-direction WARNING in check-survey-db-sync and /admin/health until the frontend
-- reaches main. They must exist in the STAGING database for staging to keep the answers,
-- and in the database the survey-db-sync workflow checks, or a push to staging goes red
-- (the rows it cannot find are CRITICAL).
--
-- THE STEMS. The survey now asks "For your Personal Development, which of these have you
-- paid for in the last 12 months?" (16011) and "We're building more assessments, including
-- one on the area you picked. Would you like first access when we launch?" (16018), from
-- Mark's 25.09 review (16018 tightened by Fatih, 29.09). Neither changes what is measured: 16011 is
-- still purchase history (every option is a personal-development purchase) and 16018 is
-- still the waitlist opt-in, with the same options. Brought in line so admin views,
-- exports and drift-detector.ts caption answers with the question actually asked. Cutover:
-- the day this reaches the environment. The table comment on survey_submission_answer
-- (the 16011 provenance note from 20260911200100) is deliberately left alone.
--
-- Idempotent. Each insert skips when its frontend_qid already holds the SAME question,
-- and refuses outright when the id holds a different one: answers to a new question must
-- never merge into an unrelated row under a shared id (the reason retired ids are never
-- reused, see features/survey/ui/questionOrder.ts). The updates are guarded on the text.
--
-- display_order appends after the current maximum; the survey renders in qId order and
-- this column only affects admin listings (20260911152724).

-- 16019 - a learning or insight that changed or improved someone's sexuality.
DO $$
DECLARE
  v_survey_id BIGINT;
  v_q_id      BIGINT;
  v_order     INTEGER;
  v_existing  TEXT;
BEGIN
  SELECT question INTO v_existing FROM survey_question WHERE frontend_qid = '16019';
  IF FOUND THEN
    IF v_existing = 'Was there a learning or insight that profoundly changed or improved your sexuality?' THEN
      RAISE NOTICE 'survey_question 16019 already exists, skipping';
      RETURN;
    END IF;
    RAISE EXCEPTION 'survey_question 16019 already exists with different text (%) - refusing to merge new answers into it', v_existing;
  END IF;

  SELECT id INTO v_survey_id FROM survey WHERE title = 'LoveIQ Survey' AND status = 'active' LIMIT 1;
  IF v_survey_id IS NULL THEN
    RAISE EXCEPTION 'No active "LoveIQ Survey" row found - refusing to add an orphan question';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_order FROM survey_question;

  INSERT INTO survey_question (type, question, subinfo, display_order, required, frontend_qid, status)
  VALUES ('open', 'Was there a learning or insight that profoundly changed or improved your sexuality?', 'Think of something you wish you had understood about your sexuality earlier that others could genuinely benefit from knowing today?', v_order, false, '16019', 'active')
  RETURNING id INTO v_q_id;

  INSERT INTO survey_question_mapping (survey_id, question_id) VALUES (v_survey_id, v_q_id);
END $$;

-- 16020 - the books, articles, blogs or YouTube channels about sexuality that helped someone.
DO $$
DECLARE
  v_survey_id BIGINT;
  v_q_id      BIGINT;
  v_order     INTEGER;
  v_existing  TEXT;
BEGIN
  SELECT question INTO v_existing FROM survey_question WHERE frontend_qid = '16020';
  IF FOUND THEN
    IF v_existing = 'What are books, articles, blogs or YouTube channels around sexuality that helped you?' THEN
      RAISE NOTICE 'survey_question 16020 already exists, skipping';
      RETURN;
    END IF;
    RAISE EXCEPTION 'survey_question 16020 already exists with different text (%) - refusing to merge new answers into it', v_existing;
  END IF;

  SELECT id INTO v_survey_id FROM survey WHERE title = 'LoveIQ Survey' AND status = 'active' LIMIT 1;
  IF v_survey_id IS NULL THEN
    RAISE EXCEPTION 'No active "LoveIQ Survey" row found - refusing to add an orphan question';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_order FROM survey_question;

  INSERT INTO survey_question (type, question, subinfo, display_order, required, frontend_qid, status)
  VALUES ('open', 'What are books, articles, blogs or YouTube channels around sexuality that helped you?', 'Post any links or names that reference to the helpful content', v_order, false, '16020', 'active')
  RETURNING id INTO v_q_id;

  INSERT INTO survey_question_mapping (survey_id, question_id) VALUES (v_survey_id, v_q_id);
END $$;

-- 16011 - "For your Personal Development, ..." (Mark, 25.09).
UPDATE survey_question
SET question          = 'For your Personal Development, which of these have you paid for in the last 12 months?',
    updated_date_time = now()
WHERE frontend_qid = '16011'
  AND question <> 'For your Personal Development, which of these have you paid for in the last 12 months?';

-- 16018 (C12) - "We're building more assessments ..." (Mark, 25.09; tightened by Fatih, 29.09).
UPDATE survey_question
SET question          = 'We''re building more assessments, including one on the area you picked. Would you like first access when we launch?',
    updated_date_time = now()
WHERE frontend_qid = '16018'
  AND question <> 'We''re building more assessments, including one on the area you picked. Would you like first access when we launch?';
