-- Rollback for supabase/migrations/20260911233000_recover_lost_marketing_opt_in_answers.sql
--
-- Apply:  psql "$DATABASE_URL" -f supabase/rollbacks/20260911233000_recover_lost_marketing_opt_in_answers_down.sql
--
-- DATA LOSS: yes, by definition — it removes restored consent answers and puts those
-- submissions back to "we never recorded what they said". Only run this if the
-- restoration itself is judged wrong, not to tidy up.
--
-- Scoped precisely by the audit trail rather than by a date or an id list: only rows this
-- migration created carry a `recover_marketing_opt_in` entry in admin_audit_log, so an
-- answer given normally can never be caught by it.
--
-- Idempotent: matches nothing once reverted.

BEGIN;

DELETE FROM survey_submission_answer a
USING survey_question q, admin_audit_log l
WHERE q.id = a.survey_question_id
  AND q.frontend_qid = '16015'
  AND l.action = 'recover_marketing_opt_in'
  AND l.resource_id::bigint = a.survey_submission_id;

UPDATE survey_submission ss
SET marketing_opt_in               = NULL,
    marketing_opt_in_at            = NULL,
    marketing_opt_in_terms_version = NULL,
    updated_date_time              = now()
FROM admin_audit_log l
WHERE l.action = 'recover_marketing_opt_in'
  AND l.resource_id::bigint = ss.id;

-- The audit entries stay. They are the record that this happened and was undone.
COMMIT;
