-- The State of Desire sheet's tick (Mark's sheet after Q16005): "I am interested in the study.
-- Email me a 5€ off code." Kept on the submission with its own consent record, which Eman's
-- switch note asks for before the sheet goes on (survey_sheet_desire): when the box was ticked,
-- and the version of the words it was ticked under (DESIRE_SHEET_COPY_VERSION in
-- features/survey/surveySheetsCopy.ts), as marketing_opt_in_terms_version does for Q16015.
-- Nothing sends the code by itself: the code is Mark's, and he sends it by hand from the
-- submission's #incoming-surveys message (17 Nov), which reads the tick off this row.
--
-- Stamped by the survey's submit in a PATCH of its own, only for a ticked box
-- (features/survey/server/server.ts). Additive only. Rollback:
-- supabase/rollbacks/20261117230000_survey_state_of_desire_opt_in_down.sql
--
-- APPLY BEFORE THE DEPLOY. The #incoming-surveys message selects state_of_desire_opt_in_at
-- (features/attribution/server/journey.ts): without the column that read fails, and every
-- survey's message falls back to its one-line text. The stamp itself fails no submission.

-- migration-lint: ignore
-- (Reason: pure ADD COLUMN with NULL default. Safe online operation.)

ALTER TABLE survey_submission
  ADD COLUMN IF NOT EXISTS state_of_desire_opt_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS state_of_desire_opt_in_version text;

COMMENT ON COLUMN survey_submission.state_of_desire_opt_in_at IS
  'When the reader ticked the State of Desire sheet''s box (email me a 5€ off code). Null: not ticked.';

COMMENT ON COLUMN survey_submission.state_of_desire_opt_in_version IS
  'The version of the box''s words the tick was given under (DESIRE_SHEET_COPY_VERSION).';
