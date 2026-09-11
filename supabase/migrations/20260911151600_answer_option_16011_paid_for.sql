-- Adds the new answer options for 16011, which was reworded from "Which of these are
-- already part of your life?" to "Which of these have you actually paid for in the last
-- 12 months?".
--
-- THIS MIGRATION IS NOT OPTIONAL, and it must land before the new copy is live.
-- `submit_survey` resolves a pick to an answer_option_id by EXACT option_text match:
--
--   WHERE ao.survey_question_id = v_question_id AND ao.option_text = v_value #>> '{}'
--
-- A label the client can send that has no matching row does not error. It falls through
-- to storing raw text with a NULL answer_option_id, so the pick silently stops joining to
-- anything. That is precisely the bug that dropped multi-select answers between
-- 2026-05-19 and 2026-06-14, and `scripts/check-survey-db-sync.js` exists to catch it.
--
-- Only three rows are needed, not five. "Therapy, coaching, or counseling" and "None of
-- these" were kept with their exact existing wording, so their rows — and the answers
-- already linked to them — carry straight over.
--
-- The four retired options are deliberately NOT deleted. Existing
-- survey_submission_answer_options rows reference them by id; removing them would break
-- the foreign key and take real answers with it. They simply stop being offered.
--
-- Idempotent: guarded on option_text so re-running inserts nothing. display_order
-- continues past whatever the question already has rather than renumbering, because
-- renumbering would reorder the retired options in the admin view for no benefit. The
-- survey itself renders from data/survey-data.ts, not from this column.
INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
SELECT
  q.id,
  v.option_text,
  v.option_text,
  COALESCE((SELECT MAX(ao.display_order) FROM answer_option ao WHERE ao.survey_question_id = q.id), 0) + v.slot
FROM survey_question q
CROSS JOIN (VALUES
  ('Books, courses, or programs', 1),
  ('An app or subscription', 2),
  ('A retreat, workshop, or group', 3)
) AS v(option_text, slot)
WHERE q.frontend_qid = '16011'
  AND NOT EXISTS (
    SELECT 1 FROM answer_option ao
    WHERE ao.survey_question_id = q.id
      AND ao.option_text = v.option_text
  );
