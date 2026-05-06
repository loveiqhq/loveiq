-- V2b Survey Text Update (full sync to data/survey-source.csv as of 2026-05-06)
-- Updates survey_question text + subinfo + how_used + back_info for 27 questions
-- and answer_option.option_text for 5 questions with option-label changes.
-- Mirrors the merged data/survey-source.csv exactly.

BEGIN;

-- ─── 1. survey_question text fields ────────────────────────────────────────

UPDATE survey_question SET
  question = 'I often crave more novelty and variety in my sexual life.',
  subinfo = 'Answer from your usual pattern. Novelty can mean new activities, fantasies, roles, pacing, settings, or simply wanting things to feel less same-same.',
  how_used = 'Helps estimate whether your erotic style leans more toward novelty-seeking or familiarity and steadiness.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '01005';

UPDATE survey_question SET
  question = 'When you think about times you’ve wanted sex, what usually happened before the desire showed up?',
  subinfo = 'Think about your recent usual pattern, not one unusual moment. Choose the option that best describes what tends to come before desire becomes available.',
  how_used = 'Helps identify your primary desire activation pattern, which is important for archetype scoring and recommendation logic.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '02001';

UPDATE survey_question SET
  question = 'My sexual desire usually builds only after affection, touch, or other erotic cues.',
  subinfo = 'Think about how desire usually starts for you. Cues can include affection, flirtation, fantasy, emotional closeness, or erotic touch.',
  how_used = 'A strong indicator of whether desire tends to be responsive rather than internally self-starting.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '02002';

UPDATE survey_question SET
  question = 'I enjoy sex more when it’s planned rather than spontaneous.',
  subinfo = 'Answer from what genuinely feels better, not what sounds most romantic. Planned can mean scheduled or simply expected.',
  how_used = 'Helps determine whether anticipation and structure support desire better than spontaneity.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '02003';

UPDATE survey_question SET
  question = 'What kind of sexual initiation tends to work best for you?',
  subinfo = 'Think about what most often leads to good experiences. Initiation can mean who makes the first move, signals interest, or creates the opening.',
  how_used = 'Helps distinguish self-starting, partner-led, mutual, and planned initiation patterns.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '02004';

UPDATE survey_question SET
  question = 'I usually prefer sex to feel intense, charged, or high-energy rather than soft, gentle, or calm.',
  subinfo = 'Answer from the erotic energy you usually prefer, not one mood or experience.',
  how_used = 'Helps position your erotic style on a calm-to-intense spectrum.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '03008';

UPDATE survey_question SET
  question = 'Which erotic perspective most strongly turns you on?',
  subinfo = 'Answer from fantasy or real experience; choose the perspective with the strongest erotic pull.',
  how_used = 'Helps distinguish being seen, watching, and inward/relational arousal patterns.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '03013';

UPDATE survey_question SET
  question = 'During sex, I can usually reach orgasm when I want to.',
  subinfo = 'Answer from your typical partnered experience in recent months under reasonably good conditions. This is about pattern, not pressure or performance.',
  how_used = 'Used to tailor pacing, expectations, and guidance around orgasm and partnered pleasure. It does not directly define your archetype.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '03014';

UPDATE survey_question SET
  question = 'When someone I feel close to pulls away, I usually…',
  subinfo = 'Think about a typical moment when you sense less contact, warmth, or responsiveness than you want. Focus on your most common first reaction.',
  how_used = 'Helps identify pursuit, withdrawal, protest, or self-regulation patterns that shape intimacy dynamics.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '08003';

UPDATE survey_question SET
  question = 'I usually want more closeness and togetherness than space and independence.',
  subinfo = 'If current relationship reflects a lasting shift in how you do closeness and independence, let that matter.',
  how_used = 'Places you on a closeness-versus-distance pattern that shapes intimacy recommendations.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '08004';

UPDATE survey_question SET
  question = 'I tend to lose sexual interest when another person becomes too emotionally dependent on me.',
  subinfo = 'Answer from what usually happens when a partner’s dependence starts to feel like pressure or too much responsibility, not from what you think should happen.',
  how_used = 'We use this to tell whether too much emotional dependence or neediness tends to cool desire for you.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '08012';

UPDATE survey_question SET
  question = 'During sex, how do you most naturally communicate what you want?',
  subinfo = 'You may have more than one natural style. Focus on what tends to happen most easily when you are relatively relaxed and in the moment.',
  how_used = 'This tells us whether your communication style is more quiet, embodied, concise, expressive, or emotionally transparent.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '10002';

UPDATE survey_question SET
  question = 'If the other person is quiet or neutral during sex, my arousal drops.',
  subinfo = 'Answer from your nervous system response. Does low feedback make you lose momentum, confidence, or erotic engagement?',
  how_used = 'This is one of the strongest clues for whether your arousal depends on visible feedback, enthusiasm, and feeling responded to.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '10005';

UPDATE survey_question SET
  question = 'Which power dynamic most naturally activates desire for you?',
  subinfo = 'Focus on the dynamic that feels most natural and energizing in your body. This is about what activates desire, not what sounds right in theory.',
  how_used = 'This gives us a direct clue about whether your energy tends toward leading, surrendering, switching, or staying mostly role-light.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '11001';

UPDATE survey_question SET
  question = 'I enjoy clear structure, protocol, or rules in sexual dynamics.',
  subinfo = 'Structure can be light or explicit. Answer from whether clear expectations, roles, or agreed rules tend to make sex feel easier, safer, or hotter.',
  how_used = 'We use this to tell whether rules, roles, and explicit agreements make sex feel freer for you rather than restrictive.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '11002';

UPDATE survey_question SET
  question = 'In sex, my attention naturally goes more toward who I’m with than toward myself.',
  subinfo = 'Answer from your current sexual baseline. Think about where your attention tends to go most naturally during sex, not where you think it should go.',
  how_used = 'This helps us distinguish giving-focused, balanced, and receiving-or-guided dynamics in the way you naturally relate during sex.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '11003';

UPDATE survey_question SET
  question = 'When my the other person feels emotionally vulnerable or unsettled, soothing or reassuring them can deepen my sexual connection.',
  subinfo = 'This can include insecurity, anxiety, shame, or overwhelm—not just checking if the person is enjoying sex.',
  how_used = 'This is a very strong clue for whether caregiving and emotional soothing are part of what makes sex feel connecting for you.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '11004';

UPDATE survey_question SET
  question = 'Which changes would meaningfully improve your sex life over the next 3 months?',
  subinfo = 'Think about what would make the biggest positive difference over the next 3 months. Focus on what feels genuinely relevant now.',
  how_used = 'This sets the main focus of your next-step suggestions, so the report starts with what matters most to you now.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '16001';

UPDATE survey_question SET
  question = 'Working on my sexuality is a priority for me right now.',
  subinfo = 'Answer from your real priorities in this season of life, not from what you think you should care about.',
  how_used = 'This tells us whether to make your recommendations more immediate and action-oriented or more exploratory and grounded.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '16002';

UPDATE survey_question SET
  question = 'When you reflect on your current sexuality and pleasure, which description feels most true for you?',
  subinfo = 'Think of this as your current season, not a fixed identity. Focus on the phase that feels closest to your baseline over the past 4–8 weeks.',
  how_used = 'This helps us locate the season you are in now—paused, repairing, awakening, expanding, grounded, or evolving—so the report meets you where you are.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '16005';

UPDATE survey_question SET
  question = 'Where would you like your sexuality to be in 3–6 months?',
  subinfo = 'Several may appeal, but pick the direction that would make the biggest positive difference for you right now.',
  how_used = 'This shows the direction you want to grow, so recommendations aim toward your desired phase instead of only describing the present.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '16006';

UPDATE survey_question SET
  question = 'What most gets in the way of improving your sexuality?',
  subinfo = 'Think about what is truly blocking movement right now, not just what sounds important in theory.',
  how_used = 'This tells us which obstacles to prioritize first so the report focuses on what is actually blocking progress.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '16014';

UPDATE survey_question SET
  question = 'Which statement best describes your relationship with sexuality right now?',
  subinfo = 'Think about your current season, not your ideal self. If more than one partly fits, focus on the one that feels most central right now.',
  how_used = 'Helps distinguish whether lower sexual engagement reflects preference, life load, or emotional/relational difficulty.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '01003';

UPDATE survey_question SET
  question = 'What most reliably motivates you to want sex?',
  subinfo = 'Several motives may fit. Focus on the recurring drivers that bring your desire online most reliably, not every reason sex can matter.',
  how_used = 'This is one of the most important direct questions in the assessment because it tells us what actually pulls desire online for you: bonding, play, novelty, power, meaning, repair, comfort, intensity, escape, or service.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '14020';

UPDATE survey_question SET
  question = 'If you had a clear plan that felt like a good fit, when would you realistically start?',
  subinfo = 'Assume the plan is clear and genuinely fits you. Then answer from your real timing, not your fantasy self with more time and energy.',
  how_used = 'We use this to match recommendations to your real timing, not an ideal timeline.',
  back_info = 'N/A',
  updated_date_time = now()
WHERE frontend_qid = '16004';

-- ─── 2. answer_option.option_text for option-label changes ─────────────────

UPDATE answer_option SET option_text = 'Satisfied & actively engaged', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '01003')   AND display_order = 1;
UPDATE answer_option SET option_text = 'Want more than I currently have', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '01003')   AND display_order = 2;
UPDATE answer_option SET option_text = 'Frustrated or unfulfilled', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '01003')   AND display_order = 3;
UPDATE answer_option SET option_text = 'Feels complicated or inconsistent', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '01003')   AND display_order = 4;
UPDATE answer_option SET option_text = 'Present, but not a priority right now', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '01003')   AND display_order = 5;
UPDATE answer_option SET option_text = 'Currently not a focus for me', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '01003')   AND display_order = 6;
UPDATE answer_option SET option_text = 'Unsure / still figuring it out', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '01003')   AND display_order = 7;

UPDATE answer_option SET option_text = 'Spontaneous', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '02001')   AND display_order = 1;
UPDATE answer_option SET option_text = 'Responsive', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '02001')   AND display_order = 2;
UPDATE answer_option SET option_text = 'Planned window', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '02001')   AND display_order = 3;
UPDATE answer_option SET option_text = 'Varies by person or context', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '02001')   AND display_order = 4;
UPDATE answer_option SET option_text = 'Desire has been low lately', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '02001')   AND display_order = 5;

UPDATE answer_option SET option_text = 'I initiate', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '02004')   AND display_order = 1;
UPDATE answer_option SET option_text = 'I’m usually not the one to initiate', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '02004')   AND display_order = 2;
UPDATE answer_option SET option_text = 'A planned opening works best for me', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '02004')   AND display_order = 3;
UPDATE answer_option SET option_text = 'Initiation flows organically, without a set role or expectation', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '02004')   AND display_order = 4;

UPDATE answer_option SET option_text = 'Being watched / admired', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '03013')   AND display_order = 1;
UPDATE answer_option SET option_text = 'Watching or observing another person', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '03013')   AND display_order = 2;
UPDATE answer_option SET option_text = 'Absorbed in sensation / connection', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '03013')   AND display_order = 3;
UPDATE answer_option SET option_text = 'Not sure', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '03013')   AND display_order = 4;

-- Q16001: V1 had 10 options, V2 has 11 (new option "Improving connection..." inserted at position 8).
-- Plan: shift existing rows 8/9/10 → 9/10/11 (preserving FK ids), refresh their text to V2 wording
-- where applicable, then INSERT the new option at display_order = 8.
UPDATE answer_option SET option_text = 'Wanting sex more often (desire)', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16001') AND display_order = 1;
UPDATE answer_option SET option_text = 'More pleasure or orgasm', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16001') AND display_order = 2;
UPDATE answer_option SET option_text = 'Less pain or physical discomfort', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16001') AND display_order = 3;
UPDATE answer_option SET option_text = 'Feeling more connected & close', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16001') AND display_order = 4;
UPDATE answer_option SET option_text = 'Communicating more clearly', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16001') AND display_order = 5;
UPDATE answer_option SET option_text = 'More excitement & novelty', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16001') AND display_order = 6;
UPDATE answer_option SET option_text = 'Feeling more confident in my body', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16001') AND display_order = 7;

DO $$
DECLARE
  v_qid bigint;
  v_id8 bigint; v_id9 bigint; v_id10 bigint;
  v_already_inserted boolean;
BEGIN
  SELECT id INTO v_qid FROM survey_question WHERE frontend_qid = '16001';
  SELECT EXISTS (
    SELECT 1 FROM answer_option
    WHERE survey_question_id = v_qid AND option_text = 'Improving connection to my own sexuality'
  ) INTO v_already_inserted;
  IF v_already_inserted THEN
    RETURN; -- migration already applied (idempotent)
  END IF;

  SELECT id INTO v_id8  FROM answer_option WHERE survey_question_id = v_qid AND display_order = 8;
  SELECT id INTO v_id9  FROM answer_option WHERE survey_question_id = v_qid AND display_order = 9;
  SELECT id INTO v_id10 FROM answer_option WHERE survey_question_id = v_qid AND display_order = 10;

  -- Shift existing rows up (10 → 11 first to avoid collisions), preserving ids/FKs.
  UPDATE answer_option SET display_order = 11, option_text = 'Something else', updated_date_time = now() WHERE id = v_id10;
  UPDATE answer_option SET display_order = 10, option_text = 'Being more aligned with someone I’m involved with', updated_date_time = now() WHERE id = v_id9;
  UPDATE answer_option SET display_order = 9,  option_text = 'Healing past hurt or blocks', updated_date_time = now() WHERE id = v_id8;

  -- Insert new V2 option at the now-vacant display_order = 8.
  INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
  VALUES (v_qid, 'Improving connection to my own sexuality', 'Improving connection to my own sexuality', 8);
END $$;

UPDATE answer_option SET option_text = 'I’m not sure what would actually help', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16014')   AND display_order = 1;
UPDATE answer_option SET option_text = 'I don’t have enough time or energy', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16014')   AND display_order = 2;
UPDATE answer_option SET option_text = 'Someone I’m involved with isn’t aligned or engaged', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16014')   AND display_order = 3;
UPDATE answer_option SET option_text = 'It doesn’t feel emotionally safe yet', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16014')   AND display_order = 4;
UPDATE answer_option SET option_text = 'Shame, pressure, or self-judgment get in the way', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16014')   AND display_order = 5;
UPDATE answer_option SET option_text = 'Physical pain or body-related issues', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16014')   AND display_order = 6;
UPDATE answer_option SET option_text = 'Support feels too expensive or hard to access', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16014')   AND display_order = 7;
UPDATE answer_option SET option_text = 'I struggle to stay consistent over time', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16014')   AND display_order = 8;
UPDATE answer_option SET option_text = 'Nothing major is in the way right now', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16014')   AND display_order = 9;
UPDATE answer_option SET option_text = 'Something else', updated_date_time = now() WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16014')   AND display_order = 10;

COMMIT;
