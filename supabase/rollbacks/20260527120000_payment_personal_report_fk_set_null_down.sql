-- DOWN migration for 20260527120000_payment_personal_report_fk_set_null.sql.
--
-- Reverts payment.personal_report_id FK from ON DELETE SET NULL back to the
-- original ON DELETE RESTRICT (no ON DELETE clause = RESTRICT default).
--
-- NOTE: any payment rows whose personal_report_id was already SET NULL by a
-- cascade while this migration was live are NOT restored — the original report
-- id is unknown. RESTRICT only governs FUTURE deletes; existing NULLs remain.
-- Re-applying RESTRICT re-blocks DSAR deletion of personal_report rows for
-- paying users (the Art. 17 gap the forward migration fixed).
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260527120000_payment_personal_report_fk_set_null_down.sql

BEGIN;

ALTER TABLE payment
  DROP CONSTRAINT fk_payment_personal_report;

ALTER TABLE payment
  ADD CONSTRAINT fk_payment_personal_report
  FOREIGN KEY (personal_report_id)
  REFERENCES personal_report(id);

COMMIT;
