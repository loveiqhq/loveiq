-- Records the order answer options were actually SHOWN in, per submission, so that
-- rankings drawn from multi-select questions can be corrected for primacy bias.
--
-- Why this exists: 16001 and 16014 are ranked-intent questions whose options were
-- rendered in a fixed order that was never recorded. Every respondent saw the same
-- order, so the share each option received cannot be separated from the advantage of
-- being near the top — which makes ~1,250 existing responses unusable as a ranking,
-- permanently and unfixably after the fact. Randomising the order without storing it
-- would replace one unusable dataset with another. Storing it is the half that gets
-- forgotten, and it is the half that matters.
--
-- Shape: { "<frontend_qid>": ["<option text>", ...] }, listing options top-to-bottom
-- as that respondent saw them. Option TEXT rather than ids because that is what the
-- client holds and what submit_survey already matches on; ids would need a lookup the
-- client cannot do.
--
-- Written by the existing best-effort consent PATCH in submitSurveyOnce, NOT by the
-- submit_survey RPC. Same reasoning as posthog_session_id (20260827190907): the RPC's
-- signature would have to change, and with it every caller and the migration that
-- defines it, to carry one nullable value that nothing in the answer fan-out needs.
--
-- Per-submission rather than per-answer because one session shows one order per
-- question; putting it on each answer row would duplicate it.
--
-- Nullable, and expected to be null for a long time: every row written before this
-- migration has no recorded order, and rows are only populated for questions that opt
-- into randomisation. Deliberately NOT backfilled — the order shown to past
-- respondents is genuinely unknown, and inventing a uniform one would assert something
-- false about data whose whole problem is that the order was uniform.
ALTER TABLE survey_submission
  ADD COLUMN IF NOT EXISTS option_order jsonb;

COMMENT ON COLUMN survey_submission.option_order IS
  'Order answer options were shown in for this submission, as {"<frontend_qid>": ["<option text>", ...]} top-to-bottom. Only present for questions that opt into randomisation (see features/survey/questionFlags.ts). Null for every submission before 2026-09-11 and for any submission whose best-effort consent PATCH failed. Needed to separate primacy bias from real preference when ranking multi-select answers; rankings from rows where this is null are not comparable to rows where it is set.';
