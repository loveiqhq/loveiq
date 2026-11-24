-- Database rows for Survey 2.0's three closing questions (Mark's Survey Review, 19 Nov 2026):
-- 17001 (how much the survey was enjoyed, 1-7), 17002 (how much the questions helped the reader
-- reflect, 1-7) and 17003 (a fair one-time price for the full report, seven bands).
--
-- WHY THE ROWS. submit_survey resolves a question by survey_question.frontend_qid and, finding
-- nothing, skips the answer with no error (see 20260918081040). Without these rows the three
-- questions would render, feel normal, and collect nothing. 17003 also needs one answer_option
-- per band: submit_survey links a single choice to its option by EXACT option_text.
--
-- ONLY SURVEY 2.0 ASKS THEM. The classic orders never do (features/survey/ui/questionOrder.ts),
-- and 2.0 reaches a reader only while the `survey_2` switch is on, so until then the rows are
-- inert. They must exist before the switch goes on anywhere, and in the database the
-- survey-db-sync workflow checks before a push that carries the survey data, or it goes red
-- (a question it cannot find is CRITICAL).
--
-- 17003 IS A PRICE LADDER. Fixed order, never shuffled (features/survey/questionFlags.ts), and
-- never read by pricing (features/pricing/logic/reportPricing.ts): the reader is told their
-- answer doesn't change the price, and a stated price must not be entangled with the one quoted.
--
-- Idempotent. Each insert skips when its frontend_qid already holds the SAME question, and
-- refuses when the id holds a different one: answers to a new question must never merge into
-- an unrelated row under a shared id. display_order appends after the current maximum; the
-- survey renders in its own order and this column only affects admin listings.

-- 17001 - how much the survey was enjoyed (1-7).
DO $$
DECLARE
  v_survey_id BIGINT;
  v_q_id      BIGINT;
  v_order     INTEGER;
  v_existing  TEXT;
BEGIN
  SELECT question INTO v_existing FROM survey_question WHERE frontend_qid = '17001';
  IF FOUND THEN
    IF v_existing = 'How much did you enjoy taking this survey?' THEN
      RAISE NOTICE 'survey_question 17001 already exists, skipping';
      RETURN;
    END IF;
    RAISE EXCEPTION 'survey_question 17001 already exists with different text (%) - refusing to merge new answers into it', v_existing;
  END IF;

  SELECT id INTO v_survey_id FROM survey WHERE title = 'LoveIQ Survey' AND status = 'active' LIMIT 1;
  IF v_survey_id IS NULL THEN
    RAISE EXCEPTION 'No active "LoveIQ Survey" row found - refusing to add an orphan question';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_order FROM survey_question;

  INSERT INTO survey_question (type, question, subinfo, display_order, required, frontend_qid, status)
  VALUES ('scale', 'How much did you enjoy taking this survey?', 'Go with your overall feeling, not just the last few questions.', v_order, true, '17001', 'active')
  RETURNING id INTO v_q_id;

  INSERT INTO survey_question_mapping (survey_id, question_id) VALUES (v_survey_id, v_q_id);
END $$;

-- 17002 - how much the questions helped the reader reflect (1-7).
DO $$
DECLARE
  v_survey_id BIGINT;
  v_q_id      BIGINT;
  v_order     INTEGER;
  v_existing  TEXT;
BEGIN
  SELECT question INTO v_existing FROM survey_question WHERE frontend_qid = '17002';
  IF FOUND THEN
    IF v_existing = 'How much did the questions help you reflect and learn about your sexuality?' THEN
      RAISE NOTICE 'survey_question 17002 already exists, skipping';
      RETURN;
    END IF;
    RAISE EXCEPTION 'survey_question 17002 already exists with different text (%) - refusing to merge new answers into it', v_existing;
  END IF;

  SELECT id INTO v_survey_id FROM survey WHERE title = 'LoveIQ Survey' AND status = 'active' LIMIT 1;
  IF v_survey_id IS NULL THEN
    RAISE EXCEPTION 'No active "LoveIQ Survey" row found - refusing to add an orphan question';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_order FROM survey_question;

  INSERT INTO survey_question (type, question, subinfo, display_order, required, frontend_qid, status)
  VALUES ('scale', 'How much did the questions help you reflect and learn about your sexuality?', 'Think of any question that made you pause or notice something new about yourself.', v_order, true, '17002', 'active')
  RETURNING id INTO v_q_id;

  INSERT INTO survey_question_mapping (survey_id, question_id) VALUES (v_survey_id, v_q_id);
END $$;

-- 17003 - a fair one-time price for the full report, seven bands in a fixed order.
DO $$
DECLARE
  v_survey_id BIGINT;
  v_q_id      BIGINT;
  v_order     INTEGER;
  v_existing  TEXT;
BEGIN
  SELECT question INTO v_existing FROM survey_question WHERE frontend_qid = '17003';
  IF FOUND THEN
    IF v_existing = 'What feels like a fair price for your full report to become a more intelligent lover?' THEN
      RAISE NOTICE 'survey_question 17003 already exists, skipping';
      RETURN;
    END IF;
    RAISE EXCEPTION 'survey_question 17003 already exists with different text (%) - refusing to merge new answers into it', v_existing;
  END IF;

  SELECT id INTO v_survey_id FROM survey WHERE title = 'LoveIQ Survey' AND status = 'active' LIMIT 1;
  IF v_survey_id IS NULL THEN
    RAISE EXCEPTION 'No active "LoveIQ Survey" row found - refusing to add an orphan question';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_order FROM survey_question;

  INSERT INTO survey_question (type, question, subinfo, display_order, required, frontend_qid, status)
  VALUES (
    'single',
    'What feels like a fair price for your full report to become a more intelligent lover?',
    '60 pages (~2 hours of insights), built from the leading research around sexuality. Consider it is a one-off payment and your answers don''t influence the price of the report.',
    v_order,
    true,
    '17003',
    'active'
  )
  RETURNING id INTO v_q_id;

  INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
  VALUES
    (v_q_id, 'Fair would be to have it for free', 'Fair would be to have it for free', 1),
    (v_q_id, '€1.99–€3.99', '€1.99–€3.99', 2),
    (v_q_id, '€4.00–€9.99', '€4.00–€9.99', 3),
    (v_q_id, '€10.00–€19.99', '€10.00–€19.99', 4),
    (v_q_id, '€20.00–€29.99', '€20.00–€29.99', 5),
    (v_q_id, '€30.00–€49.99', '€30.00–€49.99', 6),
    (v_q_id, '€50.00 or more', '€50.00 or more', 7);

  INSERT INTO survey_question_mapping (survey_id, question_id) VALUES (v_survey_id, v_q_id);
END $$;
