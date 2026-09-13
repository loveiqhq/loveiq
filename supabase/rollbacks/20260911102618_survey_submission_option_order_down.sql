-- Rollback for supabase/migrations/20260911102618_survey_submission_option_order.sql
-- (adds survey_submission.option_order — the order answer options were shown in).
--
-- Apply:  psql "$DATABASE_URL" -f supabase/rollbacks/20260911102618_survey_submission_option_order_down.sql
--
-- DATA LOSS: yes. Every recorded display order is dropped, permanently. Those rows cannot
-- be reconstructed — the order a past respondent saw is only knowable because it was
-- written down at the time. Rankings drawn from 16001 / 16011 / 16014 fall back to being
-- uncorrectable for primacy, which is the state this column exists to end.
--
-- DO NOT run this while code that writes `option_order` is deployed. PostgREST rejects the
-- whole PATCH body when a column is missing from its schema cache, and that PATCH also
-- carries `consent_at` and `terms_version`. Deployed code handles this (it retries without
-- the field), but older builds do not. Roll the application back first.

BEGIN;

ALTER TABLE survey_submission DROP COLUMN IF EXISTS option_order;

COMMIT;
