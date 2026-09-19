-- Adds posthog_session_id to survey_submission so the Slack survey notification —
-- and anyone reading a submission later — can open the session replay of the person
-- who filled it in. Captured client-side from posthog.get_session_id() at submit
-- time and written by the existing consent PATCH in submitSurveyOnce.
--
-- Why not reuse hotjar_user_id, which was added (20260506120000) for exactly this
-- job: Hotjar was removed on 2026-08-10 and nothing has written that column since
-- (1,276 historical rows, last write 2026-08-10). Putting a PostHog session id in a
-- column called hotjar_user_id would make every future reader wrong about what they
-- are looking at, and the two ids are not the same KIND of thing either — Hotjar's
-- was a per-USER id, PostHog's is a per-SESSION id, which is what deep-links to one
-- recording. The dead column is left untouched so its history stays readable.
--
-- Nullable, and expected to be null often: a visitor with an ad blocker, or one
-- whose session replay was sampled out, has no session id, and no row before this
-- migration has one.
ALTER TABLE survey_submission
  ADD COLUMN IF NOT EXISTS posthog_session_id text;

COMMENT ON COLUMN survey_submission.posthog_session_id IS
  'PostHog $session_id captured at survey submit. Deep-links to the session replay at /project/<id>/replay/<session_id>. Null when replay was blocked or sampled out. NOTE: PostHog retains recordings for 30 days, so older ids resolve to a missing recording, not a broken link.';

-- migration-lint: ignore
-- (Reason: pure ADD COLUMN with a NULL default, plus a partial index on a column
--  that is NULL in every existing row — the build is empty and the lock is
--  momentary on 1,748 rows. CONCURRENTLY is not an option regardless: Supabase runs
--  each migration inside a transaction, and CREATE INDEX CONCURRENTLY is illegal
--  there. Same shape as 20260506120000_survey_submission_hotjar_user_id.sql.)

-- Partial index: only the rows that have a value, matching the hotjar_user_id
-- precedent. Supports looking a submission up FROM a recording id, which is the
-- direction a debugging session actually goes.
CREATE INDEX IF NOT EXISTS idx_survey_submission_posthog_session_id
  ON survey_submission (posthog_session_id)
  WHERE posthog_session_id IS NOT NULL;
