-- Scoring result table for V3 archetype scoring engine
CREATE TABLE IF NOT EXISTS scoring_result (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  survey_submission_id  bigint NOT NULL UNIQUE REFERENCES survey_submission(id),
  engine_version        text NOT NULL DEFAULT 'v3',
  primary_archetype     text NOT NULL,
  percentages           jsonb NOT NULL,
  raw_scores            jsonb NOT NULL,
  diagnostics           jsonb,
  scored_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scoring_result ENABLE ROW LEVEL SECURITY;
