-- RECOVERED FILE, written 2026-08-27. Same story as
-- 20260824171027_arm_cohorts_by_axis.sql: the ledger has carried this version since
-- 2026-08-24 with no file behind it, so production has the column and any environment
-- rebuilt from this repo would not.
--
-- `question_count` is read back when a survey Slack message is edited or backfilled,
-- so that the header can keep saying how many questions the person answered without
-- re-counting the answer rows. Nullable: rows written before it existed have none, and
-- the sender omits the clause rather than guessing.

ALTER TABLE slack_journey_message
  ADD COLUMN IF NOT EXISTS question_count integer;

COMMENT ON COLUMN slack_journey_message.question_count IS
  'Questions answered on the submission, captured when the Slack survey message was first sent so an edit or backfill can restate it without recounting. Null for rows written before 2026-08-24.';
