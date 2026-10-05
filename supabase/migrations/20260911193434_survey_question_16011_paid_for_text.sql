-- Brings the DATABASE's copy of 16011 in line with the reworded question the survey now
-- actually asks. The companion migration (20260911151600) added the new answer options;
-- this one updates the question itself, which that migration did not.
--
-- Why it matters even though answers still resolve. `submit_survey` looks a question up
-- by `frontend_qid`, so picks land correctly either way — this is not a data-loss fix.
-- It is a provenance fix, and there are three consequences of leaving it:
--
--   1. The reword CHANGED WHAT THE ANSWER MEANS. "Which of these are already part of your
--      life?" and "Which of these have you actually paid for in the last 12 months?" are
--      different questions; the whole point of the change was that the first was being
--      read as lifestyle and the second is purchase history. Two of the option rows are
--      deliberately reused for continuity ("Therapy, coaching, or counseling", 562 answers
--      linked; "None of these", 751), so a pre-reword pick and a post-reword pick land on
--      the SAME option id. If the question text also stays the same, nothing in the
--      database distinguishes them and the two populations silently merge.
--   2. Any surface that labels an answer from `survey_question.question` — the admin
--      views, exports, anything an analyst writes — would caption new answers with the
--      old stem.
--   3. `features/admin/server/drift-detector.ts` compares the live rows against
--      `data/survey-data.ts` and would report a permanent text mismatch.
--
-- The cutover is the deploy date, recorded in the column comment below so it does not
-- have to be reconstructed from git later. Answers before it mean "part of my life";
-- answers after it mean "I paid for this".
--
-- Idempotent: guarded on the current text, so re-running changes nothing.

UPDATE survey_question
SET question          = 'Which of these have you actually paid for in the last 12 months?',
    subinfo           = 'Only count what you actually paid for in the last year — not what you read about or were given for free.',
    updated_date_time = now()
WHERE frontend_qid = '16011'
  AND question <> 'Which of these have you actually paid for in the last 12 months?';

COMMENT ON TABLE survey_submission_answer IS
  'One row per answered question. NOTE for 16011: the question was reworded on 2026-09-11 from "Which of these are already part of your life?" to "Which of these have you actually paid for in the last 12 months?". Two answer_option rows were intentionally carried over unchanged, so answers before and after that date land on the same option ids but do NOT mean the same thing — the first measures lifestyle, the second measures purchase history. Split on survey_submission.created_date_time before aggregating 16011 across that boundary.';
