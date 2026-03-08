-- =============================================================
-- Survey Behavior Tracking Table
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard)
--
-- NOTE: The existing `survey` table already has a `status` column
-- (values: 'active', etc.) used by the submit_survey RPC.
-- The admin panel uses that column to toggle survey status.
-- =============================================================

-- Survey behavior event table (tracking per-question timing + drop-off)
CREATE TABLE IF NOT EXISTS survey_behavior_event (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id      uuid NOT NULL,
  q_id            text NOT NULL,
  chapter         text NOT NULL,
  question_index  smallint NOT NULL,
  time_spent_ms   integer NOT NULL,
  answered        boolean NOT NULL DEFAULT false,
  direction       text NOT NULL CHECK (direction IN ('forward','back','abandon','complete')),
  client_ip       text,
  event_time      timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sbe_session ON survey_behavior_event (session_id);
CREATE INDEX IF NOT EXISTS idx_sbe_qid_direction ON survey_behavior_event (q_id, direction);
CREATE INDEX IF NOT EXISTS idx_sbe_event_time ON survey_behavior_event (event_time);

ALTER TABLE survey_behavior_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON survey_behavior_event USING (false);
