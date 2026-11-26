-- Database rows for Survey 2.0's expert question (17004; Mark's board "Q-new-expert", placed on
-- 24 Nov 2026 right after the price question 17003): would the reader like a free talk with one
-- of our experts? Yes, Maybe later or No.
--
-- WHY THE ROWS. submit_survey resolves a question by survey_question.frontend_qid and, finding
-- nothing, skips the answer with no error (see 20260918081040). Without this row the question
-- would render, feel normal, and collect nothing. Its three options need one answer_option each:
-- submit_survey links a single choice to its option by EXACT option_text.
--
-- THE PHONE NUMBER. On a Yes the survey asks for the number an expert calls. It travels as the
-- question's text box (`17004_other`, an "Other" box's slot), which submit_survey files as the
-- Yes answer's answer_text; nothing new is needed here for it. It is personal data: the team copy
-- and AP's explorer mask this question's answer_text (features/admin/server/team-export.ts).
--
-- ONLY SURVEY 2.0 ASKS IT. The classic orders never do (shared/experiments/questionOrderArm.ts),
-- and 2.0 reaches a reader only while the `survey_2` switch is on, so until then the row is
-- inert. It must exist before the switch goes on anywhere, and in the database the
-- survey-db-sync workflow checks before a push that carries the survey data, or it goes red (a
-- question it cannot find is CRITICAL).
--
-- Idempotent. The insert skips when 17004 already holds the SAME question, and refuses when it
-- holds a different one: answers to a new question must never merge into an unrelated row under
-- a shared id. display_order appends after the current maximum; the survey renders in its own
-- order and this column only affects admin listings.

DO $$
DECLARE
  v_survey_id BIGINT;
  v_q_id      BIGINT;
  v_order     INTEGER;
  v_existing  TEXT;
BEGIN
  SELECT question INTO v_existing FROM survey_question WHERE frontend_qid = '17004';
  IF FOUND THEN
    IF v_existing = 'Would you like a free talk with one of our experts about improving your sex life?' THEN
      RAISE NOTICE 'survey_question 17004 already exists, skipping';
      RETURN;
    END IF;
    RAISE EXCEPTION 'survey_question 17004 already exists with different text (%) - refusing to merge new answers into it', v_existing;
  END IF;

  SELECT id INTO v_survey_id FROM survey WHERE title = 'LoveIQ Survey' AND status = 'active' LIMIT 1;
  IF v_survey_id IS NULL THEN
    RAISE EXCEPTION 'No active "LoveIQ Survey" row found - refusing to add an orphan question';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_order FROM survey_question;

  INSERT INTO survey_question (type, question, subinfo, display_order, required, frontend_qid, status)
  VALUES (
    'single',
    'Would you like a free talk with one of our experts about improving your sex life?',
    'It''s free. Our trained coaches and therapists can help you understand your results and find next steps that fit you. We only get in touch if you say yes.',
    v_order,
    true,
    '17004',
    'active'
  )
  RETURNING id INTO v_q_id;

  INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
  VALUES
    (v_q_id, 'Yes, I''d like a free talk with an expert', 'Yes, I''d like a free talk with an expert', 1),
    (v_q_id, 'Maybe later, after I''ve read my report', 'Maybe later, after I''ve read my report', 2),
    (v_q_id, 'No, thanks', 'No, thanks', 3);

  INSERT INTO survey_question_mapping (survey_id, question_id) VALUES (v_survey_id, v_q_id);
END $$;
