-- Rollback of 20261025170000_prepaid_survey_started. FIRST deploy a Pay to start page and an
-- /api/survey-partial that no longer read or write the column. The stamps are lost with it.
-- Then delete the migration's ledger row.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.prepaid_report_access DROP COLUMN IF EXISTS survey_started_at;

COMMIT;
