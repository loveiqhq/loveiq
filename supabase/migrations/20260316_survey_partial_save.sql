-- Migration: survey_partial_save table
--
-- Stores partial survey answers for users who abandon the survey.
-- Upserted by session_id on every forward navigation + page unload.
-- Separate from survey_submission to avoid polluting the completed submissions table.

CREATE TABLE IF NOT EXISTS survey_partial_save (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id    uuid NOT NULL UNIQUE,
  answers       jsonb NOT NULL DEFAULT '{}',
  current_index smallint NOT NULL DEFAULT 0,
  started_at    timestamptz,
  utm_tracker   text,
  client_ip     text,
  saved_at      timestamptz NOT NULL DEFAULT now()
);

-- Index on saved_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_survey_partial_save_saved_at
  ON survey_partial_save (saved_at);

-- RLS: only service_role can access this table
ALTER TABLE survey_partial_save ENABLE ROW LEVEL SECURITY;
