-- V2 Survey Text Update
-- Updates question text for 19 reworded questions and Q16011 answer options.
-- All scoring-relevant answer labels are unchanged; no scoring config updates needed.

BEGIN;

-- ─── 1. Update question text ───────────────────────────────────────────────

UPDATE survey_question SET question = E'Right now, I feel satisfied with my sex life.' WHERE frontend_qid = '01002';
UPDATE survey_question SET question = E'I often crave more novelty and variety in my sexual experiences.' WHERE frontend_qid = '01005';
UPDATE survey_question SET question = E'How does desire most often begin for you?' WHERE frontend_qid = '02001';
UPDATE survey_question SET question = E'Emotional connection is important for me to feel sexual desire.' WHERE frontend_qid = '03004';
UPDATE survey_question SET question = E'I usually prefer sex to feel intense, charged, or high-energy rather than soft, gentle, or low-pressure.' WHERE frontend_qid = '03008';
UPDATE survey_question SET question = E'Sexual tension, anticipation, or pursuit reliably turns me on.' WHERE frontend_qid = '03009';
UPDATE survey_question SET question = E'Without some degree of edge, taboo, or intensity, sex can feel flat.' WHERE frontend_qid = '03012';
UPDATE survey_question SET question = E'Which erotic perspective most strongly turns you on?' WHERE frontend_qid = '03013';
UPDATE survey_question SET question = E'I generally feel secure in my close relationships.' WHERE frontend_qid = '08002';
UPDATE survey_question SET question = E'I tend to lose sexual interest when my partner becomes too emotionally dependent on me.' WHERE frontend_qid = '08012';
UPDATE survey_question SET question = E'I sometimes use flirtation or sex to influence the relationship dynamic or get my needs met.' WHERE frontend_qid = '09013';
UPDATE survey_question SET question = E'If my partner is quiet or neutral during sex, my arousal drops.' WHERE frontend_qid = '10005';
UPDATE survey_question SET question = E'Which power dynamic most naturally activates desire for you?' WHERE frontend_qid = '11001';
UPDATE survey_question SET question = E'I enjoy clear structure, protocol, or rules in sexual dynamics.' WHERE frontend_qid = '11002';
UPDATE survey_question SET question = E'I seek intense sex to escape numbness, stress or to feel something.' WHERE frontend_qid = '14021';
UPDATE survey_question SET question = E'Working on my sexuality is a priority for me right now.' WHERE frontend_qid = '16002';
UPDATE survey_question SET question = E'Meaningful change in my sexuality feels possible for me in the next 3\u20136 months.' WHERE frontend_qid = '16003';
UPDATE survey_question SET question = E'Which support formats are already part of your life?' WHERE frontend_qid = '16011';
UPDATE survey_question SET question = E'Understanding my sexuality is important to me.' WHERE frontend_qid = '16013';

-- ─── 2. Update Q16011 answer_option labels ─────────────────────────────────
-- Old: 7 options → New: 6 options (restructured)

UPDATE answer_option SET option_text = 'Therapy, coaching, or counseling'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16011')
  AND option_text = 'Therapy / coaching';

UPDATE answer_option SET option_text = 'Books or long-form reading'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16011')
  AND option_text = 'Books';

UPDATE answer_option SET option_text = 'Apps for wellbeing or self-regulation'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16011')
  AND option_text = 'Meditation apps';

UPDATE answer_option SET option_text = 'Digital content subscriptions'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16011')
  AND option_text = 'Music or streaming subscriptions';

UPDATE answer_option SET option_text = 'Courses, programs, or memberships'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16011')
  AND option_text = 'Other paid subscriptions';

UPDATE answer_option SET option_text = 'None of these'
WHERE survey_question_id = (SELECT id FROM survey_question WHERE frontend_qid = '16011')
  AND option_text = 'None';

-- Note: "Other" option (id=172) kept in DB — existing submissions reference it via FK.
-- Frontend won't show it since it's not in survey-data.ts.

COMMIT;
