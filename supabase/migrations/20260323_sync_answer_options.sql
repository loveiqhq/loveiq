-- Migration: Sync survey questions and answer options to match updated survey-data.ts
-- Generated from: data/survey-data.ts (new CSV sync 2026-03-23)
-- Covers:
--   PART 0a: Fix question type (Q16001 single → multiple, per V4 spec)
--   PART 0b: Insert missing answer_options (option count mismatches)
--   PART 1:  Update ALL answer_option labels to match frontend
--   PART 2:  Sync survey_question.question text

BEGIN;

-- ============================================================
-- PART 0a: Fix Q16001 broken multi-select data + type change
-- ============================================================
-- V4 changed Q16001 from single-choice to multiple-choice, but the DB type
-- was never updated. The RPC's 'single' branch stored multi-select answers as
-- raw JSON array strings in answer_text (e.g. '["Pleasure & orgasm","Pain / ..."]')
-- instead of proper survey_submission_answer_options junction rows.
--
-- Step 1: Parse broken JSON arrays → create proper junction rows (before label update)
-- Step 2: Change question type to 'multiple'

-- Step 1: Fix broken data (submissions where answer_text is a JSON array)
DO $$
DECLARE
  v_q16001_id BIGINT;
  v_rec RECORD;
  v_elem TEXT;
  v_opt_id BIGINT;
BEGIN
  SELECT id INTO v_q16001_id FROM survey_question WHERE frontend_qid = '16001';

  FOR v_rec IN
    SELECT ssa.id as answer_id, ssa.answer_text
    FROM survey_submission_answer ssa
    WHERE ssa.survey_question_id = v_q16001_id
      AND ssa.answer_text IS NOT NULL
      AND ssa.answer_text LIKE '["%'
  LOOP
    -- Parse JSON array and create junction rows
    FOR v_elem IN SELECT jsonb_array_elements_text(v_rec.answer_text::jsonb)
    LOOP
      SELECT ao.id INTO v_opt_id
      FROM answer_option ao
      WHERE ao.survey_question_id = v_q16001_id
        AND ao.option_text = v_elem;

      IF v_opt_id IS NOT NULL THEN
        INSERT INTO survey_submission_answer_options (survey_submission_answer_id, answer_option_id)
        VALUES (v_rec.answer_id, v_opt_id)
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    -- Clear the raw JSON text now that data is properly linked
    UPDATE survey_submission_answer SET answer_text = NULL WHERE id = v_rec.answer_id;
  END LOOP;
END $$;

-- Step 2: Change question type
UPDATE survey_question SET type = 'multiple' WHERE frontend_qid = '16001';

-- ============================================================
-- PART 0b: Insert missing answer_options (option count mismatches)
-- ============================================================

-- Q01003: DB has 4 options, frontend has 7 → insert 3 missing
INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
SELECT sq.id, 'Present but often deprioritized', 'Present but often deprioritized', 5
FROM survey_question sq WHERE sq.frontend_qid = '01003'
AND NOT EXISTS (SELECT 1 FROM answer_option ao WHERE ao.survey_question_id = sq.id AND ao.display_order = 5);

INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
SELECT sq.id, 'Currently not a focus for me', 'Currently not a focus for me', 6
FROM survey_question sq WHERE sq.frontend_qid = '01003'
AND NOT EXISTS (SELECT 1 FROM answer_option ao WHERE ao.survey_question_id = sq.id AND ao.display_order = 6);

INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
SELECT sq.id, 'Unsure / still figuring it out', 'Unsure / still figuring it out', 7
FROM survey_question sq WHERE sq.frontend_qid = '01003'
AND NOT EXISTS (SELECT 1 FROM answer_option ao WHERE ao.survey_question_id = sq.id AND ao.display_order = 7);

-- Q16011: DB has 6 options, frontend has 7 → insert 1 missing ("None" at position 7)
-- Current DB has: Therapy/coaching(1), Books(2), Meditation apps(3),
--   Music or streaming(4), Other paid subs(5), Other(6)
-- Frontend wants: ...(5), Other(6), None(7)
INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
SELECT sq.id, 'None', 'None', 7
FROM survey_question sq WHERE sq.frontend_qid = '16011'
AND NOT EXISTS (SELECT 1 FROM answer_option ao WHERE ao.survey_question_id = sq.id AND ao.display_order = 7);

-- Q16012: DB has 4 options, frontend has 6 → insert 2 missing
-- Current DB has: €0(1), €50(2), €200(3), €1000+(4)
-- Frontend wants: €0(1), €1–99(2), €100–299(3), €300–699(4), €700–1,499(5), €1,500+(6)
INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
SELECT sq.id, '€700–1,499', '€700–1,499', 5
FROM survey_question sq WHERE sq.frontend_qid = '16012'
AND NOT EXISTS (SELECT 1 FROM answer_option ao WHERE ao.survey_question_id = sq.id AND ao.display_order = 5);

INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
SELECT sq.id, '€1,500+', '€1,500+', 6
FROM survey_question sq WHERE sq.frontend_qid = '16012'
AND NOT EXISTS (SELECT 1 FROM answer_option ao WHERE ao.survey_question_id = sq.id AND ao.display_order = 6);

-- ============================================================
-- PART 1: Update ALL answer_option labels to match frontend
-- ============================================================

-- 01003 — single (7 options)
UPDATE answer_option SET option_text = 'Satisfied & actively engaged' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '01003' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Want more than I currently have' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '01003' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Frustrated or unfulfilled' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '01003' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Feels complicated or inconsistent' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '01003' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Present but often deprioritized' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '01003' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Currently not a focus for me' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '01003' AND answer_option.display_order = 6;
UPDATE answer_option SET option_text = 'Unsure / still figuring it out' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '01003' AND answer_option.display_order = 7;

-- 02001 — single (5 options)
UPDATE answer_option SET option_text = 'Spontaneous' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '02001' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Responsive' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '02001' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Planned window' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '02001' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Varies by partner/context' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '02001' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Desire has been low lately' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '02001' AND answer_option.display_order = 5;

-- 02004 — single (4 options)
UPDATE answer_option SET option_text = 'I start it' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '02004' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'My partner starts' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '02004' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Planned window' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '02004' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Playful either-way' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '02004' AND answer_option.display_order = 4;

-- 03003 — single (6 options)
UPDATE answer_option SET option_text = 'Private' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03003' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Adventurous' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03003' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Ritualized' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03003' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Spontaneous' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03003' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Public-risk' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03003' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Other' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03003' AND answer_option.display_order = 6;

-- 03005 — single (7 options)
UPDATE answer_option SET option_text = 'Sensation-led' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03005' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Safety/context-led' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03005' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Connection-led' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03005' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Novelty/adventure-led' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03005' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Mastery/competence-led' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03005' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Fantasy/imagination-led' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03005' AND answer_option.display_order = 6;
UPDATE answer_option SET option_text = 'Not sure / varies' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03005' AND answer_option.display_order = 7;

-- 03006 — single (3 options)
UPDATE answer_option SET option_text = 'Clear guidance & feedback' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03006' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Trying things out & learning by doing' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03006' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Going with intuition & what feels natural' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03006' AND answer_option.display_order = 3;

-- 03010 — single (5 options)
UPDATE answer_option SET option_text = 'Very safe and predictable' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03010' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Mostly safe, with a little novelty' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03010' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Balanced' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03010' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Adventurous, with clear boundaries' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03010' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Strong edge or taboo energy' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03010' AND answer_option.display_order = 5;

-- 03013 — single (4 options)
UPDATE answer_option SET option_text = 'Being watched / admired' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03013' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Watching my partner' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03013' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Absorbed in sensation / connection' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03013' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Not sure' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '03013' AND answer_option.display_order = 4;

-- 08003 — single (5 options)
UPDATE answer_option SET option_text = 'Seek reassurance / pursue' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '08003' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Shut down / withdraw' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '08003' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Protest / get angry' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '08003' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Self-soothe / stay grounded' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '08003' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Varies' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '08003' AND answer_option.display_order = 5;

-- 08004 — single (3 options)
UPDATE answer_option SET option_text = 'Crave closeness' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '08004' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Keep distance' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '08004' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Balance both' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '08004' AND answer_option.display_order = 3;

-- 10002 — single (5 options)
UPDATE answer_option SET option_text = 'Mostly silent / nonverbal' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '10002' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Through touch & body movement' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '10002' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Short, direct phrases (e.g. “slower”, “like that”)' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '10002' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Continuous verbal feedback' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '10002' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Emotional check-ins & reassurance' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '10002' AND answer_option.display_order = 5;

-- 11001 — single (5 options)
UPDATE answer_option SET option_text = 'Lead / direct' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '11001' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Surrender / be led' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '11001' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Switch' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '11001' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Egalitarian / no roles' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '11001' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Not sure / depends' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '11001' AND answer_option.display_order = 5;

-- 11003 — single (4 options)
UPDATE answer_option SET option_text = 'Primarily focused on my partner' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '11003' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'A balance of giving and receiving' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '11003' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Primarily focused on my own experience' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '11003' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'It changes depending on mood or partner' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '11003' AND answer_option.display_order = 4;

-- 14020 — single (11 options)
UPDATE answer_option SET option_text = 'Bonding / intimacy' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '14020' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Pleasure / play' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '14020' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Novelty / exploration' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '14020' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Intensity / edge' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '14020' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Validation / being desired' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '14020' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Power' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '14020' AND answer_option.display_order = 6;
UPDATE answer_option SET option_text = 'Meaning / spiritual union' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '14020' AND answer_option.display_order = 7;
UPDATE answer_option SET option_text = 'Comfort / routine closeness' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '14020' AND answer_option.display_order = 8;
UPDATE answer_option SET option_text = 'Service' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '14020' AND answer_option.display_order = 9;
UPDATE answer_option SET option_text = 'Healing / soothing' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '14020' AND answer_option.display_order = 10;
UPDATE answer_option SET option_text = 'Escape / switching off' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '14020' AND answer_option.display_order = 11;

-- 15003 — single (6 options)
UPDATE answer_option SET option_text = '18–24' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15003' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = '25–34' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15003' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = '35–44' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15003' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = '45–54' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15003' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = '55–64' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15003' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = '65+' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15003' AND answer_option.display_order = 6;

-- 15004 — single (7 options)
UPDATE answer_option SET option_text = 'Single' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15004' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Monogamous' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15004' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Monogamish' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15004' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Open' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15004' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Polyamorous' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15004' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Solo-poly' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15004' AND answer_option.display_order = 6;
UPDATE answer_option SET option_text = 'Fluid / Undefined' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15004' AND answer_option.display_order = 7;

-- 15005 — single (7 options)
UPDATE answer_option SET option_text = 'No' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15005' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Yes, youngest is 0–3' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15005' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Yes, youngest is 4–10' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15005' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Yes, youngest is 11–17' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15005' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Yes, children are 18+ and live with me' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15005' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Yes, children are 18+ and do not live with me' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15005' AND answer_option.display_order = 6;
UPDATE answer_option SET option_text = 'Prefer not to answer' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15005' AND answer_option.display_order = 7;

-- 15006 — single (5 options)
UPDATE answer_option SET option_text = 'Very low' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15006' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Low' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15006' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Medium' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15006' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'High' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15006' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Very high' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15006' AND answer_option.display_order = 5;

-- 15007 — single (5 options)
UPDATE answer_option SET option_text = 'Very rested' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15007' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Rather rested' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15007' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'In between' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15007' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Rather tired' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15007' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Very tired' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15007' AND answer_option.display_order = 5;

-- 15008 — single (6 options)
UPDATE answer_option SET option_text = 'No' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15008' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Yes, mainly physical health' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15008' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Yes, mainly mental health' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15008' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Yes, both physical and mental health' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15008' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'I’m not sure' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15008' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Prefer not to answer' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15008' AND answer_option.display_order = 6;

-- 15009 — single (5 options)
UPDATE answer_option SET option_text = 'No' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15009' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Yes, lowers my drive' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15009' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Yes, increases my drive' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15009' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Yes, not sure how it affects me' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15009' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Prefer not to answer' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15009' AND answer_option.display_order = 5;

-- 15010 — single (5 options)
UPDATE answer_option SET option_text = 'Woman' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15010' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Man' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15010' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Nonbinary' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15010' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Other' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15010' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'I’d rather not label this' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15010' AND answer_option.display_order = 5;

-- 15011 — single (8 options)
UPDATE answer_option SET option_text = 'Heterosexual' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15011' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Homosexual' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15011' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Bisexual' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15011' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Pansexual' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15011' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Queer' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15011' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Questioning / exploring' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15011' AND answer_option.display_order = 6;
UPDATE answer_option SET option_text = 'Other' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15011' AND answer_option.display_order = 7;
UPDATE answer_option SET option_text = 'I don’t use a label' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '15011' AND answer_option.display_order = 8;

-- 16001 — multiple (10 options)
UPDATE answer_option SET option_text = 'Wanting sex more often (desire)' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16001' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Feeling more pleasure or orgasm' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16001' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Less pain or physical discomfort' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16001' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Feeling more connected & close' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16001' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Communicating needs more clearly' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16001' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'More excitement & novelty' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16001' AND answer_option.display_order = 6;
UPDATE answer_option SET option_text = 'Feeling more confident in my body' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16001' AND answer_option.display_order = 7;
UPDATE answer_option SET option_text = 'Healing past hurt or blocks' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16001' AND answer_option.display_order = 8;
UPDATE answer_option SET option_text = 'Being more aligned with my partner' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16001' AND answer_option.display_order = 9;
UPDATE answer_option SET option_text = 'Something else' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16001' AND answer_option.display_order = 10;

-- 16004 — single (7 options)
UPDATE answer_option SET option_text = 'Within 7 days' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16004' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Within 30 days' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16004' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = '1–3 months' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16004' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = '3–6 months' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16004' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = '6–12 months' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16004' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Later than 12 months' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16004' AND answer_option.display_order = 6;
UPDATE answer_option SET option_text = 'Not sure yet' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16004' AND answer_option.display_order = 7;

-- 16005 — single (6 options)
UPDATE answer_option SET option_text = 'Recharging / Pausing' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16005' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Repairing / Reconnecting' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16005' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Awakening / Exploring' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16005' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Expanding / Experimenting' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16005' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Grounded / Integrated' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16005' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Evolving / Transcending' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16005' AND answer_option.display_order = 6;

-- 16006 — single (6 options)
UPDATE answer_option SET option_text = 'Recharging / Pausing' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16006' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Repairing / Reconnecting' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16006' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Awakening / Exploring' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16006' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Expanding / Experimenting' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16006' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Grounded / Integrated' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16006' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Evolving / Transcending' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16006' AND answer_option.display_order = 6;

-- 16007 — single (5 options)
UPDATE answer_option SET option_text = 'Research on my own' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16007' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Structured tool/app/journal' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16007' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Program/course' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16007' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Professional support' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16007' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Act only when urgent' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16007' AND answer_option.display_order = 5;

-- 16008 — multiple (6 options)
UPDATE answer_option SET option_text = 'Self-guided tools' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16008' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Short structured program' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16008' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Live group experience' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16008' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Partner-inclusive guidance' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16008' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = '1:1 professional support' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16008' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Not sure yet' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16008' AND answer_option.display_order = 6;

-- 16011 — multiple (7 options)
UPDATE answer_option SET option_text = 'Therapy / coaching' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16011' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'Books' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16011' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'Meditation apps' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16011' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'Music or streaming subscriptions' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16011' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Other paid subscriptions' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16011' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Other' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16011' AND answer_option.display_order = 6;
UPDATE answer_option SET option_text = 'None' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16011' AND answer_option.display_order = 7;

-- 16012 — single (6 options)
UPDATE answer_option SET option_text = '€0' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16012' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = '€1–99' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16012' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = '€100–299' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16012' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = '€300–699' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16012' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = '€700–1,499' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16012' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = '€1,500+' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16012' AND answer_option.display_order = 6;

-- 16014 — multiple (10 options)
UPDATE answer_option SET option_text = 'I’m not sure what would actually help' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16014' AND answer_option.display_order = 1;
UPDATE answer_option SET option_text = 'I don’t have enough time or energy' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16014' AND answer_option.display_order = 2;
UPDATE answer_option SET option_text = 'My partner isn’t aligned or engaged' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16014' AND answer_option.display_order = 3;
UPDATE answer_option SET option_text = 'It doesn’t feel emotionally safe yet' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16014' AND answer_option.display_order = 4;
UPDATE answer_option SET option_text = 'Shame, pressure, or self-judgment get in the way' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16014' AND answer_option.display_order = 5;
UPDATE answer_option SET option_text = 'Physical pain or body-related issues' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16014' AND answer_option.display_order = 6;
UPDATE answer_option SET option_text = 'Support feels too expensive or hard to access' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16014' AND answer_option.display_order = 7;
UPDATE answer_option SET option_text = 'I struggle to stay consistent over time' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16014' AND answer_option.display_order = 8;
UPDATE answer_option SET option_text = 'Nothing major is in the way right now' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16014' AND answer_option.display_order = 9;
UPDATE answer_option SET option_text = 'Something else' FROM survey_question sq WHERE answer_option.survey_question_id = sq.id AND sq.frontend_qid = '16014' AND answer_option.display_order = 10;


-- Sync survey_question.question text to match updated CSV
UPDATE survey_question SET question = 'What is your email?' WHERE frontend_qid = '00000';
UPDATE survey_question SET question = 'What is your first name?' WHERE frontend_qid = '00001';
UPDATE survey_question SET question = 'Overall, how satisfied are you with your sex life right now?' WHERE frontend_qid = '01002';
UPDATE survey_question SET question = 'Which statement best describes your relationship with sexuality right now?' WHERE frontend_qid = '01003';
UPDATE survey_question SET question = 'I often crave more novelty/variety in my sexual experiences.' WHERE frontend_qid = '01005';
UPDATE survey_question SET question = 'Sex is often uncomfortable or painful for me.' WHERE frontend_qid = '01006';
UPDATE survey_question SET question = 'Which is most true for you?' WHERE frontend_qid = '02001';
UPDATE survey_question SET question = 'I enjoy intimacy more when it’s planned rather than spontaneous.' WHERE frontend_qid = '02003';
UPDATE survey_question SET question = 'In a good scenario, initiation feels best when…' WHERE frontend_qid = '02004';
UPDATE survey_question SET question = 'What kind of erotic environment feels most alive for you?' WHERE frontend_qid = '03003';
UPDATE survey_question SET question = 'How essential is emotional connection for your sexual desire?' WHERE frontend_qid = '03004';
UPDATE survey_question SET question = 'Which description best fits what gets you from neutral to turned-on most often?' WHERE frontend_qid = '03005';
UPDATE survey_question SET question = 'I usually want sex to feel more...' WHERE frontend_qid = '03008';
UPDATE survey_question SET question = 'Tension, pursuit, or being ‘hard to get’ reliably turns me on.' WHERE frontend_qid = '03009';
UPDATE survey_question SET question = 'Which erotic atmosphere feels best for you most often?' WHERE frontend_qid = '03010';
UPDATE survey_question SET question = 'Without some edge/taboo/intensity, sex can feel flat.' WHERE frontend_qid = '03012';
UPDATE survey_question SET question = 'Which of the following sounds most arousing to you?' WHERE frontend_qid = '03013';
UPDATE survey_question SET question = 'I can usually reach orgasm with a partner when I want to.' WHERE frontend_qid = '03014';
UPDATE survey_question SET question = 'I generally feel secure in relationships.' WHERE frontend_qid = '08002';
UPDATE survey_question SET question = 'When my partner pulls away, I usually…' WHERE frontend_qid = '08003';
UPDATE survey_question SET question = 'Regarding interdependence in relationships, I tend to...' WHERE frontend_qid = '08004';
UPDATE survey_question SET question = 'After emotional repair (a good vulnerable talk), I often feel more desire.' WHERE frontend_qid = '08005';
UPDATE survey_question SET question = 'I lose interest when my partner becomes too emotionally dependent.' WHERE frontend_qid = '08012';
UPDATE survey_question SET question = 'I sometimes use flirtation/sex to influence the dynamic or get needs met.' WHERE frontend_qid = '09013';
UPDATE survey_question SET question = 'During intimacy, how do you prefer to communicate your needs and desires?' WHERE frontend_qid = '10002';
UPDATE survey_question SET question = 'I’m comfortable expressing what turns me on.' WHERE frontend_qid = '10003';
UPDATE survey_question SET question = 'I’m comfortable expressing what I don’t want.' WHERE frontend_qid = '10004';
UPDATE survey_question SET question = 'If my partner is quiet/neutral during sex, my arousal drops.' WHERE frontend_qid = '10005';
UPDATE survey_question SET question = 'Which dynamic feels most natural?' WHERE frontend_qid = '11001';
UPDATE survey_question SET question = 'I enjoy clear structure/protocol/rules in sexual dynamics.' WHERE frontend_qid = '11002';
UPDATE survey_question SET question = 'In sex I most naturally…' WHERE frontend_qid = '11003';
UPDATE survey_question SET question = 'What most reliably motivates you to want sex?' WHERE frontend_qid = '14020';
UPDATE survey_question SET question = 'I seek intense sex to escape numbness/stress or to feel something.' WHERE frontend_qid = '14021';
UPDATE survey_question SET question = 'Which country do you live in?' WHERE frontend_qid = '15001';
UPDATE survey_question SET question = 'Which ZIP / postal code do you live in?' WHERE frontend_qid = '15002';
UPDATE survey_question SET question = 'Which age range are you in?' WHERE frontend_qid = '15003';
UPDATE survey_question SET question = 'What relationship structure are you currently in?' WHERE frontend_qid = '15004';
UPDATE survey_question SET question = 'Do you have children?' WHERE frontend_qid = '15005';
UPDATE survey_question SET question = 'How high is your overall stress level most of the time?' WHERE frontend_qid = '15006';
UPDATE survey_question SET question = 'How rested do you usually feel when you wake up?' WHERE frontend_qid = '15007';
UPDATE survey_question SET question = 'What is your gender identity?' WHERE frontend_qid = '15010';
UPDATE survey_question SET question = 'What is your sexual orientation?' WHERE frontend_qid = '15011';
UPDATE survey_question SET question = 'Which changes would meaningfully improve your sex life over the next 3 months?' WHERE frontend_qid = '16001';
UPDATE survey_question SET question = 'How important is it for you to work on this right now?' WHERE frontend_qid = '16002';
UPDATE survey_question SET question = 'How possible does change feel in the next 3–6 months?' WHERE frontend_qid = '16003';
UPDATE survey_question SET question = 'Where would you like your sexuality to be in 3–6 months?' WHERE frontend_qid = '16006';
UPDATE survey_question SET question = 'What kind of support would feel most helpful for your top focus?' WHERE frontend_qid = '16008';
UPDATE survey_question SET question = 'Which of the following do you regularly use?' WHERE frontend_qid = '16011';
UPDATE survey_question SET question = 'How important is understanding your sexuality for your life?' WHERE frontend_qid = '16013';
UPDATE survey_question SET question = 'What most gets in the way of improving your sexuality?' WHERE frontend_qid = '16014';

COMMIT;
