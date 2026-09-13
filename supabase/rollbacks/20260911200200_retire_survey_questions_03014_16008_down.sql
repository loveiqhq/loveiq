-- Rollback for supabase/migrations/20260911200200_retire_survey_questions_03014_16008.sql
-- (marks 03014 and 16008 status = 'retired').
--
-- Apply:  psql "$DATABASE_URL" -f supabase/rollbacks/20260911200200_retire_survey_questions_03014_16008_down.sql
--
-- DATA LOSS: none. Only a status flag moves; no row is added or removed, and answers never
-- referenced `status` in the first place.
--
-- Reverting this WITHOUT also restoring the questions to data/survey-data.ts puts them back
-- into the state the forward migration removed: active in the database, absent from the
-- survey, which /admin/health reports as config drift at severity "risk" and which
-- scripts/check-survey-db-sync.js now warns about. Only useful as part of restoring the
-- questions properly — see docs/survey-removed-questions.md.
--
-- Idempotent: guarded on status.

BEGIN;

UPDATE survey_question
SET status            = 'active',
    updated_date_time = now()
WHERE frontend_qid IN ('03014', '16008')
  AND status <> 'active';

COMMIT;
