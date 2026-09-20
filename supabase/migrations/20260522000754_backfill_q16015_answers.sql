-- Item 7: backfill survey_submission_answer for Q16015 on the 4 submissions
-- captured BEFORE Q16015 was seeded into survey_question (today). The
-- marketing_opt_in COLUMN is correct on all 4; we're filling the
-- side-table so admin dashboards that join on survey_submission_answer
-- show Q16015 for these too.
--
-- yes_opt_id = 198, no_opt_id = 199, survey_question_id = 62 (queried first).
--
-- This file was applied directly to the remote database via Supabase Studio
-- on 2026-05-22 and only later committed to the repo for parity. The
-- ON CONFLICT DO NOTHING makes re-application a no-op if `supabase db push`
-- ever re-runs it against a DB where these answer rows already exist.
-- Guarded by EXISTS, not just ON CONFLICT. These are PRODUCTION submission ids
-- and question/option ids. Against an empty database none of them exist, and a
-- bare INSERT aborts the whole push with
--   violates foreign key constraint "fk_ssa_submission"
--   Key (survey_submission_id)=(384) is not present in table "survey_submission"
-- ON CONFLICT cannot help: the row is refused by the FK, not by a unique index.
--
-- A backfill has nothing to back-fill on a fresh database, so the correct
-- behaviour there is to insert nothing. On production all four rows exist and
-- this stays the no-op it already was. Found 2026-09-20 by the first replay.
INSERT INTO survey_submission_answer
  (survey_submission_id, survey_question_id, answer_option_id, answer_text, answered_at)
SELECT v.submission_id, v.question_id, v.option_id, NULL, v.answered_at
  FROM (VALUES
    (384, 62, 199, '2026-05-21 21:10:55.131902+00'::timestamptz),
    (385, 62, 199, '2026-05-21 21:14:54.498908+00'::timestamptz),
    (386, 62, 198, '2026-05-21 22:53:24.101232+00'::timestamptz),
    (387, 62, 198, '2026-05-22 00:04:20.951754+00'::timestamptz)
  ) AS v(submission_id, question_id, option_id, answered_at)
 WHERE EXISTS (SELECT 1 FROM survey_submission ss WHERE ss.id = v.submission_id)
   AND EXISTS (SELECT 1 FROM survey_question sq WHERE sq.id = v.question_id)
   AND EXISTS (SELECT 1 FROM answer_option ao WHERE ao.id = v.option_id)
ON CONFLICT DO NOTHING;
