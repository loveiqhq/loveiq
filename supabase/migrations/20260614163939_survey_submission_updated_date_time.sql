-- Add survey_submission.updated_date_time (was missing).
--
-- The admin submission-detail GET (app/api/admin/submissions/[id]/route.ts) selects
-- `updated_date_time`, and the PATCH uses it for the F-05 optimistic-lock + GDPR
-- rectification. The column was assumed to exist (personal_report / payment have the
-- created/updated_date_time pair) but no migration ever added it to survey_submission,
-- so every detail view + every PATCH 400'd at PostgREST and surfaced as a 500
-- ("Admin submission detail query failed" / api_5xx).
--
-- Additive + idempotent. Backfill existing rows to their created_date_time so the
-- optimistic-lock baseline + the GET echo are sane; new rows default to now(); the
-- PATCH already bumps it on every update.

ALTER TABLE survey_submission ADD COLUMN IF NOT EXISTS updated_date_time timestamptz;

UPDATE survey_submission
SET updated_date_time = created_date_time
WHERE updated_date_time IS NULL;

ALTER TABLE survey_submission ALTER COLUMN updated_date_time SET DEFAULT now();
