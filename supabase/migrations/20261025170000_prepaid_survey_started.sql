-- prepaid_report_access.survey_started_at: when a pay-to-start buyer's survey first saved an
-- answer (its draft), after paying. AP-Analytics' Landing page shows each pay-to-start page's
-- "Started survey" from it (Marcus's board; Eman, 25 Oct 2026): an unfinished survey has no
-- other link to its purchase, and a finished one is already linked by consumed_submission_id.
--
-- Written once, by /api/survey-partial after a buyer's draft is saved, on a paid row only
-- (paid_at set, survey_started_at still null). Nothing personal: a timestamp.
--
-- APPLY BEFORE DEPLOYING the change that reads it: the Pay to start page names the column in
-- its read, and a missing column fails that read.

BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.prepaid_report_access
  ADD COLUMN IF NOT EXISTS survey_started_at timestamptz;

COMMENT ON COLUMN public.prepaid_report_access.survey_started_at IS
  'When the buyer''s survey first saved an answer, after paying. Set once by /api/survey-partial on a paid row; null: not started, or started before the column was written.';

COMMIT;
