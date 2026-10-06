-- Creates the database rows for 16009, a new question asking which of four formats
-- someone would actually buy first.
--
-- A new question needs BOTH halves or it does not store. `submit_survey` looks the
-- question up by `survey_question.frontend_qid` and resolves each pick to an
-- `answer_option` row by exact `option_text`. Ship the survey copy without these rows and
-- the answer has nowhere to land — it does not error, it is simply lost, which is the
-- same silent failure mode that dropped multi-select answers in mid-2026.
--
-- THE PRICES IN THESE OPTIONS ARE HYPOTHETICAL. They exist to measure which format people
-- would choose, not to charge anyone. They must never be read as a price signal, wired to
-- a checkout, or fed into report pricing: an answer here is a stated preference collected
-- before the paywall, and treating it as a real price would both mislead the reader and
-- corrupt the measurement it exists to produce.
--
-- `display_order` appends after the current maximum rather than slotting into position.
-- The survey itself renders from data/survey-data.ts in qId order, so this column only
-- affects admin listings, and renumbering every existing question to insert one row would
-- be a far larger and riskier change than the ordering is worth.
--
-- Idempotent: the whole block is skipped when a question with this frontend_qid already
-- exists, so re-running changes nothing.
DO $$
DECLARE
  v_survey_id BIGINT;
  v_q_id      BIGINT;
  v_order     INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM survey_question WHERE frontend_qid = '16009') THEN
    RAISE NOTICE 'survey_question 16009 already exists, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_survey_id FROM survey WHERE title = 'LoveIQ Survey' AND status = 'active' LIMIT 1;
  IF v_survey_id IS NULL THEN
    RAISE EXCEPTION 'No active "LoveIQ Survey" row found — refusing to add an orphan question';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_order FROM survey_question;

  INSERT INTO survey_question (type, question, subinfo, display_order, required, frontend_qid, status)
  VALUES (
    'single',
    'If these existed for what you most want to work on in your sex life, which would you actually buy first?',
    'Nothing is for sale here and no payment is taken. We are working out what would actually be worth building, so "none of these" is a real answer and just as useful as the others.',
    v_order,
    true,
    '16009',
    'active'
  )
  RETURNING id INTO v_q_id;

  -- Fixed order, and "None of these right now" stays last. This question is deliberately
  -- NOT randomised (see features/survey/questionFlags.ts): the options are a price
  -- ladder, and an opt-out that moves around stops the answer meaning anything.
  INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
  VALUES
    (v_q_id, 'A 15-minute read that tells me what mine looks like — €19', 'A 15-minute read that tells me what mine looks like — €19', 1),
    (v_q_id, 'A 4-week guided program with weekly exercises — €119', 'A 4-week guided program with weekly exercises — €119', 2),
    (v_q_id, 'One 60-minute session with a practitioner — €149', 'One 60-minute session with a practitioner — €149', 3),
    (v_q_id, 'A small live group of six people over four sessions — €229', 'A small live group of six people over four sessions — €229', 4),
    (v_q_id, 'None of these right now', 'None of these right now', 5);

  INSERT INTO survey_question_mapping (survey_id, question_id) VALUES (v_survey_id, v_q_id);
END $$;
