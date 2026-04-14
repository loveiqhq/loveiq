DROP TABLE IF EXISTS report_access_token CASCADE;

CREATE TABLE report_access_token (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token text NOT NULL UNIQUE,
  survey_submission_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_access_token ON report_access_token (token);

ALTER TABLE report_access_token ENABLE ROW LEVEL SECURITY;
