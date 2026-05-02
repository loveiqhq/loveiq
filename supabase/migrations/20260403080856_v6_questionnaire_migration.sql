-- V6 Questionnaire Migration
-- Updates survey_question types, question text, and answer_option rows
-- for the V5→V6 scoring migration.
--
-- Changes:
--   Q08004: single → scale (scalarized to DIM_CLOSENESS_ORIENTATION)
--   Q11003: single → scale (scalarized to DIM_PARTNER_FOCUS)
--   Q03003: single → multiple (erotic environment, split public_risk)
--   Q10002: single → multiple (communication style, split nonverbal)
--   Q14020: single → multiple (motivation, refreshed labels)
--   Q02004: label refresh only (still single)
--   Q03006: added non_deliberate option (still single)

BEGIN;

-- ─── 1. Update question types and text ──────────────────────────────────────

-- Q08004: single → scale
UPDATE survey_question
SET type = 'scale',
    question = 'In relationships, I usually want more closeness and togetherness than space and independence.'
WHERE frontend_qid = '08004';

-- Q11003: single → scale
UPDATE survey_question
SET type = 'scale',
    question = E'In sex, my attention naturally goes more toward my partner\u2019s experience than toward my own.'
WHERE frontend_qid = '11003';

-- Q03003: single → multiple
UPDATE survey_question
SET type = 'multiple',
    question = 'What kinds of erotic settings or atmosphere feel most alive or activating for you?'
WHERE frontend_qid = '03003';

-- Q10002: single → multiple
UPDATE survey_question
SET type = 'multiple',
    question = 'During intimacy, how do you most naturally communicate what you want?'
WHERE frontend_qid = '10002';

-- Q14020: single → multiple
UPDATE survey_question
SET type = 'multiple',
    question = 'What most reliably motivates you to want sex?'
WHERE frontend_qid = '14020';

-- Q02004: update question text only
UPDATE survey_question
SET question = 'What kind of initiation tends to work best for you?'
WHERE frontend_qid = '02004';

-- Q03006: update question text only
UPDATE survey_question
SET question = 'When it comes to figuring out what works for you sexually, which approach fits you best?'
WHERE frontend_qid = '03006';

-- ─── 2. Update answer_option labels for Q02004 ─────────────────────────────

UPDATE answer_option SET option_text = 'I initiate'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '02004')
  AND option_text = 'I start it';

UPDATE answer_option SET option_text = 'My partner initiates'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '02004')
  AND option_text = 'My partner starts';

UPDATE answer_option SET option_text = 'We make space for it intentionally'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '02004')
  AND option_text = 'Planned window';

UPDATE answer_option SET option_text = 'It unfolds naturally and either of us may begin'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '02004')
  AND option_text = 'Playful either-way';

-- ─── 3. Update answer_option labels for Q03003 ─────────────────────────────
-- Old: Private, Adventurous, Ritualized, Spontaneous, Public-risk, Other
-- New: Private and protected, Novel or adventurous, Deliberate or ritualized,
--      Spontaneous or unplanned, Edge taboo or transgression, Visible or semi-public, Something else

UPDATE answer_option SET option_text = 'Private and protected'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '03003')
  AND option_text = 'Private';

UPDATE answer_option SET option_text = 'Novel or adventurous'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '03003')
  AND option_text = 'Adventurous';

UPDATE answer_option SET option_text = 'Deliberate or ritualized'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '03003')
  AND option_text = 'Ritualized';

UPDATE answer_option SET option_text = 'Spontaneous or unplanned'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '03003')
  AND option_text = 'Spontaneous';

-- Split Public-risk into two new options
UPDATE answer_option SET option_text = 'Edge, taboo, or transgression'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '03003')
  AND option_text = 'Public-risk';

-- Add the new Visible or semi-public option
INSERT INTO answer_option (survey_question_id, option_text, display_order)
SELECT sq.id, 'Visible or semi-public', 6
FROM survey_question sq
WHERE sq.frontend_qid = '03003'
  AND NOT EXISTS (
    SELECT 1 FROM answer_option ao
    WHERE ao.survey_question_id = sq.id AND ao.option_text = 'Visible or semi-public'
  );

UPDATE answer_option SET option_text = 'Something else'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '03003')
  AND option_text = 'Other';

-- ─── 4. Update answer_option labels for Q03006 ─────────────────────────────

UPDATE answer_option SET option_text = 'Structure and feedback'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '03006')
  AND option_text = 'Clear guidance & feedback';

UPDATE answer_option SET option_text = 'Curiosity and experimentation'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '03006')
  AND option_text = 'Trying things out & learning by doing';

UPDATE answer_option SET option_text = 'Natural flow and spontaneity'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '03006')
  AND option_text = 'Going with intuition & what feels natural';

-- Add the new non_deliberate option
INSERT INTO answer_option (survey_question_id, option_text, display_order)
SELECT sq.id, 'I prefer not to make it a deliberate process', 4
FROM survey_question sq
WHERE sq.frontend_qid = '03006'
  AND NOT EXISTS (
    SELECT 1 FROM answer_option ao
    WHERE ao.survey_question_id = sq.id
      AND ao.option_text = 'I prefer not to make it a deliberate process'
  );

-- ─── 5. Update answer_option labels for Q10002 ─────────────────────────────
-- Old: Mostly silent / nonverbal, Through touch & body movement,
--      Short direct phrases, Continuous verbal feedback, Emotional check-ins & reassurance
-- New: Touch and body cues, Brief direct words, Ongoing verbal feedback,
--      Emotional check-ins, Mostly nonverbal cues, I communicate very little

UPDATE answer_option SET option_text = 'Touch and body cues'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '10002')
  AND option_text = 'Through touch & body movement';

UPDATE answer_option SET option_text = 'Brief direct words'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '10002')
  AND option_text LIKE 'Short, direct phrases%';

UPDATE answer_option SET option_text = 'Ongoing verbal feedback'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '10002')
  AND option_text = 'Continuous verbal feedback';

UPDATE answer_option SET option_text = 'Emotional check-ins'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '10002')
  AND option_text = 'Emotional check-ins & reassurance';

-- Narrow "Mostly silent / nonverbal" to "Mostly nonverbal cues"
UPDATE answer_option SET option_text = 'Mostly nonverbal cues'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '10002')
  AND option_text = 'Mostly silent / nonverbal';

-- Add the new "I communicate very little" option
INSERT INTO answer_option (survey_question_id, option_text, display_order)
SELECT sq.id, 'I communicate very little', 6
FROM survey_question sq
WHERE sq.frontend_qid = '10002'
  AND NOT EXISTS (
    SELECT 1 FROM answer_option ao
    WHERE ao.survey_question_id = sq.id
      AND ao.option_text = 'I communicate very little'
  );

-- ─── 6. Update answer_option labels for Q14020 ─────────────────────────────

UPDATE answer_option SET option_text = 'Bonding and closeness'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '14020')
  AND option_text = 'Bonding / intimacy';

UPDATE answer_option SET option_text = 'Pleasure and play'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '14020')
  AND option_text = 'Pleasure / play';

UPDATE answer_option SET option_text = 'Novelty and discovery'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '14020')
  AND option_text = 'Novelty / exploration';

UPDATE answer_option SET option_text = 'Intensity and edge'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '14020')
  AND option_text = 'Intensity / edge';

UPDATE answer_option SET option_text = 'Feeling desired'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '14020')
  AND option_text = 'Validation / being desired';

UPDATE answer_option SET option_text = 'Power and polarity'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '14020')
  AND option_text = 'Power';

UPDATE answer_option SET option_text = 'Meaning and devotion'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '14020')
  AND option_text = 'Meaning / spiritual union';

UPDATE answer_option SET option_text = 'Comfort and familiarity'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '14020')
  AND option_text = 'Comfort / routine closeness';

UPDATE answer_option SET option_text = 'Giving and service'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '14020')
  AND option_text = 'Service';

UPDATE answer_option SET option_text = 'Healing and soothing'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '14020')
  AND option_text = 'Healing / soothing';

UPDATE answer_option SET option_text = 'Escape and relief'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '14020')
  AND option_text = 'Escape / switching off';

COMMIT;
