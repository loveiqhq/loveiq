-- Database rows for the demand block: C9 (16016), C10 (16017) and C12 (16018).
--
-- WHY THIS MIGRATION EXISTS. submit_survey resolves a question by
-- survey_question.frontend_qid and, finding nothing, does this:
--
--     IF v_question_id IS NULL THEN
--       -- Unknown question key - skip gracefully
--       CONTINUE;
--
-- The answer is discarded with no error. Shipping the survey copy without these rows
-- would render all three questions, feel completely normal, and collect NOTHING. Picks
-- degrade the same way one level down: each is matched to an answer_option by exact
-- option_text, and a miss stores raw text with a NULL answer_option_id - the failure that
-- dropped multi-select answers from 2026-05-19 to 2026-06-14.
--
-- Every option_text below was GENERATED from data/survey-data.ts rather than retyped,
-- because the exact string match is the whole contract and one stray character breaks it
-- silently.
--
-- INERT FOR PRODUCTION. Production renders the survey from data/survey-data.ts on main,
-- which does not contain these questions. These rows are shown to nobody and change no
-- production behaviour; they only mean that when the STAGING frontend asks the questions,
-- the answers have somewhere to land. Two visible side effects, both cosmetic:
-- /admin/health may report config drift, and check-survey-db-sync warns in the reverse
-- direction (DB rows with no CSV row) until the frontend reaches main.
--
-- display_order appends after the current maximum rather than slotting into position, for
-- the reason given in 20260911152724: the survey renders in qId order and this column only
-- affects admin listings.
--
-- Idempotent: each block is skipped when its frontend_qid already exists.

-- 16016 - C9 / D1 - topic ranking. 53 topics, capped at three picks client-side.
DO $$
DECLARE
  v_survey_id BIGINT;
  v_q_id      BIGINT;
  v_order     INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM survey_question WHERE frontend_qid = '16016') THEN
    RAISE NOTICE 'survey_question 16016 already exists, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_survey_id FROM survey WHERE title = 'LoveIQ Survey' AND status = 'active' LIMIT 1;
  IF v_survey_id IS NULL THEN
    RAISE EXCEPTION 'No active "LoveIQ Survey" row found - refusing to add an orphan question';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_order FROM survey_question;

  INSERT INTO survey_question (type, question, subinfo, display_order, required, frontend_qid, status)
  VALUES ('multiple', 'Beyond sex, which of these would you most want to understand about yourself?', 'Pick the ones that matter most to you right now — up to three. This helps us decide what to build next, so there are no wrong answers.', v_order, true, '16016', 'active')
  RETURNING id INTO v_q_id;

  INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
  VALUES
    (v_q_id, 'Low mood & loss of interest', 'Low mood & loss of interest', 1),
    (v_q_id, 'Low energy & motivation', 'Low energy & motivation', 2),
    (v_q_id, 'Low self-worth & confidence', 'Low self-worth & confidence', 3),
    (v_q_id, 'Feeling numb or disconnected', 'Feeling numb or disconnected', 4),
    (v_q_id, 'Anxiety, tension & worry', 'Anxiety, tension & worry', 5),
    (v_q_id, 'Fear of judgement in social situations', 'Fear of judgement in social situations', 6),
    (v_q_id, 'Perfectionism & fear of failure', 'Perfectionism & fear of failure', 7),
    (v_q_id, 'Anger & irritability', 'Anger & irritability', 8),
    (v_q_id, 'Emotions that overwhelm', 'Emotions that overwhelm', 9),
    (v_q_id, 'Rapid mood swings', 'Rapid mood swings', 10),
    (v_q_id, 'Feeling empty inside', 'Feeling empty inside', 11),
    (v_q_id, 'Past stress echoing now', 'Past stress echoing now', 12),
    (v_q_id, 'Burnout & chronic stress', 'Burnout & chronic stress', 13),
    (v_q_id, 'Grief & loss', 'Grief & loss', 14),
    (v_q_id, 'Shame carried from the past', 'Shame carried from the past', 15),
    (v_q_id, 'Poor or broken sleep', 'Poor or broken sleep', 16),
    (v_q_id, 'Constant fatigue & exhaustion', 'Constant fatigue & exhaustion', 17),
    (v_q_id, 'Stress showing up in the body', 'Stress showing up in the body', 18),
    (v_q_id, 'Changes in appetite & eating', 'Changes in appetite & eating', 19),
    (v_q_id, 'Trouble focusing & follow-through', 'Trouble focusing & follow-through', 20),
    (v_q_id, 'Procrastination & avoidance', 'Procrastination & avoidance', 21),
    (v_q_id, 'Overwhelmed by everyday tasks', 'Overwhelmed by everyday tasks', 22),
    (v_q_id, 'Distance in my relationship', 'Distance in my relationship', 23),
    (v_q_id, 'Conflict & arguments that escalate', 'Conflict & arguments that escalate', 24),
    (v_q_id, 'Loneliness & isolation', 'Loneliness & isolation', 25),
    (v_q_id, 'Pulling close, then away', 'Pulling close, then away', 26),
    (v_q_id, 'Trouble saying no & setting boundaries', 'Trouble saying no & setting boundaries', 27),
    (v_q_id, 'Trouble trusting others', 'Trouble trusting others', 28),
    (v_q_id, 'Mismatched desire with a partner', 'Mismatched desire with a partner', 29),
    (v_q_id, 'Body image & feeling comfortable', 'Body image & feeling comfortable', 30),
    (v_q_id, 'Shame about sex', 'Shame about sex', 31),
    (v_q_id, 'Dating feels exhausting', 'Dating feels exhausting', 32),
    (v_q_id, 'Fear of rejection when making a move', 'Fear of rejection when making a move', 33),
    (v_q_id, 'Repeating the same relationship pattern', 'Repeating the same relationship pattern', 34),
    (v_q_id, 'Being single when you don''t want to be', 'Being single when you don''t want to be', 35),
    (v_q_id, 'Doubts about committing', 'Doubts about committing', 36),
    (v_q_id, 'Tension with parents or family', 'Tension with parents or family', 37),
    (v_q_id, 'Parenting stress & feeling stretched', 'Parenting stress & feeling stretched', 38),
    (v_q_id, 'Co-parenting after separation', 'Co-parenting after separation', 39),
    (v_q_id, 'Caring for someone who depends on you', 'Caring for someone who depends on you', 40),
    (v_q_id, 'Fertility, pregnancy & becoming a parent', 'Fertility, pregnancy & becoming a parent', 41),
    (v_q_id, 'A difficult workplace', 'A difficult workplace', 42),
    (v_q_id, 'Money worries', 'Money worries', 43),
    (v_q_id, 'Feeling stuck in your career', 'Feeling stuck in your career', 44),
    (v_q_id, 'Money conflict with a partner', 'Money conflict with a partner', 45),
    (v_q_id, 'Feeling like a fraud at work', 'Feeling like a fraud at work', 46),
    (v_q_id, 'Drinking more than you want to', 'Drinking more than you want to', 47),
    (v_q_id, 'Scrolling, gaming & screens', 'Scrolling, gaming & screens', 48),
    (v_q_id, 'Adjusting to a big life change', 'Adjusting to a big life change', 49),
    (v_q_id, 'Not knowing who you are', 'Not knowing who you are', 50),
    (v_q_id, 'Life feels without meaning', 'Life feels without meaning', 51),
    (v_q_id, 'Feeling wired differently from others', 'Feeling wired differently from others', 52),
    (v_q_id, 'Not feeling like you belong', 'Not feeling like you belong', 53);

  INSERT INTO survey_question_mapping (survey_id, question_id) VALUES (v_survey_id, v_q_id);
END $$;

-- 16017 - C10 / D2 - prior attempt. Standalone stem: the engine has no piping, so it cannot name the topic picked in 16016.
DO $$
DECLARE
  v_survey_id BIGINT;
  v_q_id      BIGINT;
  v_order     INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM survey_question WHERE frontend_qid = '16017') THEN
    RAISE NOTICE 'survey_question 16017 already exists, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_survey_id FROM survey WHERE title = 'LoveIQ Survey' AND status = 'active' LIMIT 1;
  IF v_survey_id IS NULL THEN
    RAISE EXCEPTION 'No active "LoveIQ Survey" row found - refusing to add an orphan question';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_order FROM survey_question;

  INSERT INTO survey_question (type, question, subinfo, display_order, required, frontend_qid, status)
  VALUES ('single', 'Thinking about what you just picked — have you tried to work on it before?', 'Every answer here is useful. Having tried and got stuck tells us as much as never having started.', v_order, true, '16017', 'active')
  RETURNING id INTO v_q_id;

  INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
  VALUES
    (v_q_id, 'Yes, and I got somewhere', 'Yes, and I got somewhere', 1),
    (v_q_id, 'Yes, and I got stuck', 'Yes, and I got stuck', 2),
    (v_q_id, 'I''ve thought about it, but never really tried', 'I''ve thought about it, but never really tried', 3),
    (v_q_id, 'No, this is new for me', 'No, this is new for me', 4);

  INSERT INTO survey_question_mapping (survey_id, question_id) VALUES (v_survey_id, v_q_id);
END $$;

-- 16018 - C12 / D4 - waitlist opt-in. Stored as an ordinary answer; there is no per-topic waitlist table.
DO $$
DECLARE
  v_survey_id BIGINT;
  v_q_id      BIGINT;
  v_order     INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM survey_question WHERE frontend_qid = '16018') THEN
    RAISE NOTICE 'survey_question 16018 already exists, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_survey_id FROM survey WHERE title = 'LoveIQ Survey' AND status = 'active' LIMIT 1;
  IF v_survey_id IS NULL THEN
    RAISE EXCEPTION 'No active "LoveIQ Survey" row found - refusing to add an orphan question';
  END IF;

  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_order FROM survey_question;

  INSERT INTO survey_question (type, question, subinfo, display_order, required, frontend_qid, status)
  VALUES ('single', 'We''re building more of these. Want first access to what you picked?', 'Saying yes only means we let you know when it exists. Nothing is for sale here and no payment is taken.', v_order, true, '16018', 'active')
  RETURNING id INTO v_q_id;

  INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
  VALUES
    (v_q_id, 'Yes, tell me when it''s ready', 'Yes, tell me when it''s ready', 1),
    (v_q_id, 'No thanks', 'No thanks', 2);

  INSERT INTO survey_question_mapping (survey_id, question_id) VALUES (v_survey_id, v_q_id);
END $$;
