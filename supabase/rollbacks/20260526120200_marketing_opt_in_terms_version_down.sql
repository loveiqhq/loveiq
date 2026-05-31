-- DOWN migration for 20260526120200_marketing_opt_in_terms_version.sql.
--
-- Drops survey_submission.marketing_opt_in_terms_version (pure column).
--
-- WARNING — DATA LOSS: the consent-version string proving WHAT each opted-in
-- user agreed to is discarded. This is GDPR Art. 7(1) evidence — export it
-- first if any opted-in rows exist:
--   \copy (SELECT id, marketing_opt_in_terms_version FROM survey_submission WHERE marketing_opt_in_terms_version IS NOT NULL) TO 'consent_versions.csv' CSV HEADER
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260526120200_marketing_opt_in_terms_version_down.sql

BEGIN;

ALTER TABLE survey_submission
  DROP COLUMN IF EXISTS marketing_opt_in_terms_version;

COMMIT;
