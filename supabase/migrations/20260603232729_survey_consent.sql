-- Audit M2: persist per-submission consent accountability for GDPR Art. 5(2)
-- (accountability) and Art. 9(2)(a) (explicit consent for special-category data).
--
-- The survey UI hard-gates submission behind the age-confirmation + terms
-- checkboxes (the "I agree" button is disabled until both are ticked), but that
-- consent was never recorded server-side. The controller therefore could not
-- evidence WHICH version of the consent terms a given data subject agreed to.
--
-- These columns are stamped (best-effort follow-up PATCH) on every submission by
-- submitSurveyOnce() in features/survey/server/server.ts. consent_at is the
-- submission-receipt time (consent is a precondition gated immediately before in
-- the same flow); terms_version matches CONSENT_TERMS_VERSION in that file.

ALTER TABLE survey_submission
  ADD COLUMN IF NOT EXISTS consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text;

COMMENT ON COLUMN survey_submission.consent_at IS
  'When the age + terms consent gate was satisfied for this submission (stamped at submission receipt; the UI gates submission on the consent checkboxes). Audit M2.';
COMMENT ON COLUMN survey_submission.terms_version IS
  'Version of the consent terms the data subject accepted; matches CONSENT_TERMS_VERSION in features/survey/server/server.ts. Audit M2.';
