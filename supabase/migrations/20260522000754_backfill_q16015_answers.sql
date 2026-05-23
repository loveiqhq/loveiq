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
INSERT INTO survey_submission_answer
  (survey_submission_id, survey_question_id, answer_option_id, answer_text, answered_at)
VALUES
  (384, 62, 199, NULL, '2026-05-21 21:10:55.131902+00'),
  (385, 62, 199, NULL, '2026-05-21 21:14:54.498908+00'),
  (386, 62, 198, NULL, '2026-05-21 22:53:24.101232+00'),
  (387, 62, 198, NULL, '2026-05-22 00:04:20.951754+00')
ON CONFLICT DO NOTHING;
