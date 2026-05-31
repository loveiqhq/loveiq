-- T-11: consent versioning for marketing opt-in (GDPR Art. 7(1)).
--
-- The 20260521210000_marketing_opt_in.sql migration only captures the boolean
-- + timestamp. If we change the Q16015 wording later, we lose the ability to
-- prove what THIS user consented to.
--
-- Approach: just ADD COLUMN here. The application layer stamps the value
-- via a follow-up UPDATE after the existing submit_survey RPC returns the
-- submission_id. Keeping the RPC untouched avoids accidentally regressing
-- the answer_options / answer_history logic accreted over many migrations.
--
-- The version string is owned in code (MARKETING_OPT_IN_TERMS_VERSION in
-- features/survey/server/server.ts). Operators bump it whenever the Q16015
-- copy changes.

-- migration-lint: ignore
-- (Reason: pure ADD COLUMN with NULL default. Safe online operation.)

ALTER TABLE survey_submission
  ADD COLUMN IF NOT EXISTS marketing_opt_in_terms_version TEXT;
