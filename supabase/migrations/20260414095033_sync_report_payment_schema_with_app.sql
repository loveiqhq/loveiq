-- Align the restored normalized schema with the shapes the current app already writes/reads.

ALTER TABLE IF EXISTS personal_report
  ALTER COLUMN report_id DROP NOT NULL;

ALTER TABLE IF EXISTS report_access_token
  ADD COLUMN IF NOT EXISTS token text,
  ADD COLUMN IF NOT EXISTS survey_submission_id bigint;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'report_access_token'
      AND column_name = 'report_access_email_id'
  ) THEN
    EXECUTE $sql$
      UPDATE report_access_token rat
      SET survey_submission_id = pr.survey_submission_id
      FROM report_access_email rae
      JOIN personal_report pr ON pr.id = rae.personal_report_id
      WHERE rat.report_access_email_id = rae.id
        AND rat.survey_submission_id IS NULL
    $sql$;

    EXECUTE $sql$
      ALTER TABLE report_access_token
        ALTER COLUMN report_access_email_id DROP NOT NULL
    $sql$;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'report_access_token_survey_submission_id_fkey'
  ) THEN
    ALTER TABLE report_access_token
      ADD CONSTRAINT report_access_token_survey_submission_id_fkey
      FOREIGN KEY (survey_submission_id) REFERENCES survey_submission(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS report_access_token_survey_submission_id_idx
  ON report_access_token (survey_submission_id);

CREATE UNIQUE INDEX IF NOT EXISTS report_access_token_token_idx
  ON report_access_token (token)
  WHERE token IS NOT NULL;
