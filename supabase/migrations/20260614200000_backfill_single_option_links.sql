-- Companion to 20260614170000 (resync) + 20260614190000 (multi backfill).
-- Single-select answers submitted 2026-05-19 → 2026-06-14 survived the option
-- drift (the submit_survey 'single' branch stores the raw label in answer_text
-- when the option lookup misses) but were left UNLINKED — answer_option_id NULL —
-- which silently undercounts every option-distribution analytic that joins
-- answer_option. They displayed fine (admin reads answer_text as a fallback), so
-- this is an analytics-integrity fix, not a visible-data fix.
--
-- Now that answer_option.option_text is back in sync, re-link any unlinked single
-- answer whose answer_text EXACTLY matches a current option, and clear the
-- now-redundant text mirror to match the canonical shape the RPC writes for a
-- matched single (answer_option_id set, answer_text NULL). Custom "Something
-- else" / "Other" free-text never matches an option, so it is left untouched.
--
-- IDEMPOTENT: only targets rows still NULL on answer_option_id; re-running is a
-- no-op. Dry-run before applying: 3,745 relinkable, 644 left as custom text.

UPDATE survey_submission_answer ssa
SET answer_option_id = ao.id,
    answer_text = NULL
FROM survey_question sq, answer_option ao
WHERE ssa.survey_question_id = sq.id
  AND sq.type = 'single'
  AND ssa.answer_option_id IS NULL
  AND ssa.was_skipped = false
  AND ssa.answer_text IS NOT NULL
  AND ao.survey_question_id = sq.id
  AND ao.option_text = ssa.answer_text;
