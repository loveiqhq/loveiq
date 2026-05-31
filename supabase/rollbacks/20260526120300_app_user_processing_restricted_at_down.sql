-- DOWN migration for 20260526120300_app_user_processing_restricted_at.sql.
--
-- Drops app_user.processing_restricted_at. The partial index
-- (idx_app_user_processing_restricted_at) is removed automatically with the
-- column, so an explicit DROP INDEX CONCURRENTLY is unnecessary.
--
-- WARNING — COMPLIANCE: any user currently under an Art. 18 processing
-- restriction loses that marker; nurture / scoring / analytics would resume
-- processing them. Export restricted users first:
--   \copy (SELECT id, email FROM app_user WHERE processing_restricted_at IS NOT NULL) TO 'restricted_users.csv' CSV HEADER
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260526120300_app_user_processing_restricted_at_down.sql

BEGIN;

ALTER TABLE public.app_user
  DROP COLUMN IF EXISTS processing_restricted_at;

COMMIT;
