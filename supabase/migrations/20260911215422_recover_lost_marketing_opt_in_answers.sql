-- Restores the marketing-opt-in answers the survey collected but never submitted.
--
-- The defect: `goNext` closed over `answers`, so with auto-advance on, the 350ms timer
-- that submits from the LAST question fired a callback captured before that question's
-- answer existed. The payload went out one key short. Fixed in the application the same
-- day (getLatestAnswers, see features/survey/ui/hooks/useSurveyState.ts); this repairs
-- the rows it already cost.
--
-- Evidence, and why this is restoration rather than invention. Each of these submissions
-- has a `survey_partial_save` draft on the SAME session id, written 15-52 seconds AFTER
-- the submission, that DOES contain the 16015 answer. That is the exact signature of the
-- race: the client held the answer throughout, the submit did not carry it, and the next
-- autosave wrote it down. The answer is the respondent's own, recorded by our own code,
-- against their own session.
--
-- Deliberately conservative:
--   * same-session drafts only. A draft from a different sitting is not evidence of what
--     someone answered in this one, and this is a consent field.
--   * only where 16015 has no answer AND marketing_opt_in IS NULL, so nothing already
--     recorded can be overwritten.
--   * only where the draft text matches an answer_option exactly, so no free text is
--     invented.
--   * `answered_at` and `marketing_opt_in_at` are the SUBMISSION time, not now(). The
--     click happened moments before it; dating consent to this migration would be false.
--   * terms version 2026-05-21, the only value any opt-in carried across the whole window
--     (2026-07-27 to 2026-09-11), so it is not a guess.
--
-- Coverage is bounded by the drafts, which only exist from 2026-08-12: of 403 affected
-- submissions all-time, 20 are recoverable (11 yes, 9 no; 2 of the yes are real
-- customers, the rest staff test runs). The other 383 have no evidence anywhere and are
-- deliberately left alone.
--
-- Every change is written to admin_audit_log. Idempotent: re-running matches nothing.

BEGIN;

CREATE TEMP TABLE _recovered ON COMMIT DROP AS
SELECT ss.id                              AS submission_id,
       ss.created_date_time               AS submitted_at,
       p.answers->>'16015'                AS draft_answer,
       ao.id                              AS option_id,
       (p.answers->>'16015') ILIKE 'yes%' AS opted_in
FROM survey_submission ss
JOIN survey_partial_save p ON p.session_id = ss.session_id
JOIN survey_question sq    ON sq.frontend_qid = '16015'
JOIN answer_option ao      ON ao.survey_question_id = sq.id
                          AND ao.option_text = p.answers->>'16015'
WHERE ss.status = 'completed'
  AND ss.marketing_opt_in IS NULL
  AND p.answers ? '16015'
  AND NOT EXISTS (
    SELECT 1 FROM survey_submission_answer a
    WHERE a.survey_submission_id = ss.id AND a.survey_question_id = sq.id);

INSERT INTO survey_submission_answer
  (survey_submission_id, survey_question_id, answer_option_id, answered_at)
SELECT r.submission_id,
       (SELECT id FROM survey_question WHERE frontend_qid = '16015'),
       r.option_id,
       r.submitted_at
FROM _recovered r;

UPDATE survey_submission ss
SET marketing_opt_in               = r.opted_in,
    marketing_opt_in_at            = CASE WHEN r.opted_in THEN r.submitted_at END,
    marketing_opt_in_terms_version = CASE WHEN r.opted_in THEN '2026-05-21' END,
    updated_date_time              = now()
FROM _recovered r
WHERE ss.id = r.submission_id;

INSERT INTO admin_audit_log (admin_email, action, resource_type, resource_id, metadata)
SELECT 'ec@loveiq.org',
       'recover_marketing_opt_in',
       'survey_submission',
       r.submission_id,
       jsonb_build_object(
         'reason', 'answer lost by the auto-advance submit race, fixed 2026-09-11',
         'restored_from', 'survey_partial_save draft on the same session id',
         'answer', r.draft_answer,
         'marketing_opt_in', r.opted_in,
         'dated_to', r.submitted_at)
FROM _recovered r;

DO $$
DECLARE v_bad bigint;
BEGIN
  SELECT count(*) INTO v_bad
  FROM _recovered r
  WHERE (SELECT count(*) FROM survey_submission_answer a
         JOIN survey_question q ON q.id = a.survey_question_id
         WHERE a.survey_submission_id = r.submission_id AND q.frontend_qid = '16015') <> 1;
  IF v_bad > 0 THEN RAISE EXCEPTION '% recovered row(s) lack exactly one 16015 answer', v_bad; END IF;

  SELECT count(*) INTO v_bad
  FROM _recovered r JOIN survey_submission ss ON ss.id = r.submission_id
  WHERE ss.marketing_opt_in IS DISTINCT FROM r.opted_in;
  IF v_bad > 0 THEN RAISE EXCEPTION 'flag disagrees with the restored answer on % row(s)', v_bad; END IF;
END $$;

COMMIT;
