-- Adds hotjar_user_id to survey_submission so admin detail can deep-link to a
-- Hotjar recording. Captured client-side from the _hjSessionUser_<siteid> cookie
-- at survey submit time. Nullable: pre-Hotjar rows and consent-declined sessions
-- have NULL.
ALTER TABLE survey_submission
  ADD COLUMN IF NOT EXISTS hotjar_user_id text;

COMMENT ON COLUMN survey_submission.hotjar_user_id IS
  'Hotjar user_id parsed from _hjSessionUser_<siteid> cookie at submit time. Used by admin to deep-link to recordings.';

-- Partial index: only the rows with a value (vast majority will be NULL).
CREATE INDEX IF NOT EXISTS idx_survey_submission_hotjar_user_id
  ON survey_submission (hotjar_user_id)
  WHERE hotjar_user_id IS NOT NULL;
