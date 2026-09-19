-- V9 DB sync: seed Q16015 (added to the V9 questionnaire in commit bf49c3b
-- but never persisted to survey_question) and retire Q01003/Q16003/Q16004
-- (removed from the V9 runtime but still referenced by ~322 historical
-- survey_submission_answer rows each, so we cannot DELETE — flip status
-- to 'retired' instead).
--
-- Applied via Supabase MCP on 2026-05-22; this file is the canonical record.

BEGIN;

-- 1. Insert Q16015 into survey_question. Marketing opt-in question, not
--    scored. Required=false per V9 convention for marketing-opt-in rows.
INSERT INTO survey_question (
  type, question, subinfo, display_order, required, status, frontend_qid, how_used
)
VALUES (
  'single',
  'Would you like to receive free LoveIQ hints and insights?',
  'This includes insights on sexuality, intimacy, research papers, news and future advanced tests.',
  62,
  false,
  'active',
  '16015',
  'Marketing opt-in (not used in scoring; routed to Resend Audience when "Yes").'
);

-- 2. Insert the two answer_option rows for Q16015 (matches the strings the
--    survey UI offers — startsWith("yes") drives the marketing_opt_in flag).
INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
SELECT sq.id, 'Yes, I want to keep learning about myself.', 'yes', 1
FROM survey_question sq WHERE sq.frontend_qid = '16015';

INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
SELECT sq.id, 'No, I am not interested in this growth opportunity.', 'no', 2
FROM survey_question sq WHERE sq.frontend_qid = '16015';

-- 3. Retire Q01003 / Q16003 / Q16004. Each has ~322 historical
--    survey_submission_answer rows so we cannot DELETE without losing
--    referential integrity. Marking status='retired' so any future
--    admin query/dashboard can filter them out cleanly. The runtime
--    survey never offers them because the questions aren't in
--    data/survey-data.ts anymore (regenerator dropped them in V9).
UPDATE survey_question
SET status = 'retired', updated_date_time = now()
WHERE frontend_qid IN ('01003', '16003', '16004');

COMMIT;
