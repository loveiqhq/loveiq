-- Marks 03014 and 16008 retired now that the survey no longer asks them.
--
-- Removing a question from `data/survey-data.ts` takes it out of the survey but leaves
-- its database row saying `status = 'active'`. Two things follow from that, and the
-- second is the reason this migration exists rather than being left for later:
--
--   1. `features/admin/server/drift-detector.ts` reads `survey_question?status=eq.active`
--      and compares it with `data/survey-data.ts`. A question active in one and absent
--      from the other lands in `liveOnly`, which the detector raises at severity "risk".
--      Without this migration that finding appears on /admin/health the moment the
--      survey change ships and can never be cleared — a permanent red mark describing a
--      deliberate decision, which is how real alerts get ignored.
--   2. "Active" is simply untrue of a question nobody is asked.
--
-- 'retired' is the value already in use on this column for exactly this purpose; there is
-- no check constraint, so nothing else needs changing.
--
-- WHAT THIS DOES NOT DO. It does not delete anything. The rows stay, their answer_option
-- rows stay, and every historical answer stays joinable — `survey_submission_answer`
-- references `survey_question_id`, never `status`, so retired questions read back exactly
-- as before. Restoring one means flipping this column back plus the steps in
-- docs/survey-removed-questions.md.
--
-- 15011 is deliberately NOT retired here. It is hidden from respondents but still defined
-- in `data/survey-data.ts`, so retiring it would move it from one side of the drift
-- comparison to the other and create the mirror-image finding this migration removes.
--
-- Idempotent: guarded on status.

UPDATE survey_question
SET status            = 'retired',
    updated_date_time = now()
WHERE frontend_qid IN ('03014', '16008')
  AND status <> 'retired';

DO $$
DECLARE
  v_active bigint;
BEGIN
  SELECT count(*) INTO v_active
  FROM survey_question
  WHERE frontend_qid IN ('03014', '16008') AND status = 'active';

  IF v_active > 0 THEN
    RAISE EXCEPTION '% retired question(s) still marked active', v_active;
  END IF;
END $$;
