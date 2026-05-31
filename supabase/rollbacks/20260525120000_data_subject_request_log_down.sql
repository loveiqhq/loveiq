-- DOWN migration for 20260525120000_data_subject_request_log.sql.
--
-- Drops the GDPR DSAR audit-trail table. Postgres removes the two indexes
-- (idx_dsr_log_email_sha256, idx_dsr_log_created_at) and the RLS policy with
-- the table automatically.
--
-- WARNING — DATA LOSS: this table is a compliance audit trail of fulfilled
-- export/delete requests (Art. 17(3)(b) retention). Only run this if reverting
-- the DSAR feature entirely. Back the rows up first if the trail must survive:
--   \copy (SELECT * FROM data_subject_request_log) TO 'dsr_log_backup.csv' CSV HEADER
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260525120000_data_subject_request_log_down.sql

BEGIN;

DROP TABLE IF EXISTS data_subject_request_log;

COMMIT;
