-- Rollback for supabase/migrations/20260911200100_survey_question_16011_paid_for_text.sql
-- (updates 16011's question + subinfo to the reworded "paid for" copy).
--
-- Apply:  psql "$DATABASE_URL" -f supabase/rollbacks/20260911200100_survey_question_16011_paid_for_text_down.sql
--
-- DATA LOSS: none. Restores the exact previous strings, captured from production on
-- 2026-09-11 before the forward migration ran.
--
-- Only run this alongside an application rollback. If the survey still ASKS the reworded
-- question while the database stores the old stem, answers keep resolving (the RPC matches
-- on frontend_qid) but every one of them is captioned with a question nobody was asked —
-- which is the exact defect the forward migration fixes.
--
-- Idempotent: guarded on the current text.

BEGIN;

UPDATE survey_question
SET question          = 'Which of these are already part of your life?',
    subinfo           = 'Select what you use regularly (at least monthly). This helps us understand what types of support/subscriptions you’re already comfortable with.',
    updated_date_time = now()
WHERE frontend_qid = '16011'
  AND question <> 'Which of these are already part of your life?';

COMMIT;
