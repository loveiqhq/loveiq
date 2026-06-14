-- One-time recovery: re-link multi-select picks that were SILENTLY DROPPED
-- between 2026-05-19 and 2026-06-14 because the client option labels (V3) no
-- longer matched answer_option.option_text in the DB (see the resync migration
-- 20260614170000). The submit_survey RPC stores the parent answer row but the
-- option-link inserts missed, leaving ~1,774 empty multi-select answers.
--
-- The user's actual picks survive in survey_partial_save.answers (the autosave
-- snapshot, keyed by session_id, storing the V3 labels verbatim). Now that the
-- DB option_text is back in sync, those labels resolve to answer_option rows, so
-- we can rebuild the lost survey_submission_answer_options links.
--
-- Scope guard: only currently-EMPTY multi-select answers (no existing option
-- links, not skipped) whose submission has a partial-save snapshot. SELECT
-- DISTINCT avoids dup pairs; the NOT EXISTS guard makes this IDEMPOTENT
-- (re-running inserts nothing once a row has links). Scoring is unaffected (it
-- always used the raw answers map, never these links).
--
-- Dry-run before applying: 3,634 links across 1,733 answers in 320 submissions.

INSERT INTO survey_submission_answer_options (survey_submission_answer_id, answer_option_id)
SELECT DISTINCT ssa.id, ao.id
FROM survey_submission_answer ssa
JOIN survey_submission ss ON ss.id = ssa.survey_submission_id
JOIN survey_question sq ON sq.id = ssa.survey_question_id AND sq.type = 'multiple'
JOIN survey_partial_save ps ON ps.session_id = ss.session_id
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(ps.answers -> sq.frontend_qid) = 'array'
       THEN ps.answers -> sq.frontend_qid
       ELSE '[]'::jsonb END
) AS pick(label)
JOIN answer_option ao
  ON ao.survey_question_id = sq.id
 AND ao.option_text = pick.label
WHERE ssa.was_skipped = false
  AND ssa.answer_option_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM survey_submission_answer_options o
    WHERE o.survey_submission_answer_id = ssa.id
  );
