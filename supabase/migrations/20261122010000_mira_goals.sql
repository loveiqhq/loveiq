-- Mira's challenges and goals (post-MVP "Challenges & goals", 22 Nov 2026): a signed-in person's
-- small goals in their own words, with an optional weekly target, and the days they ticked them.
-- Additive only. Follows 20261121030000.
-- Rollback: supabase/rollbacks/20261122010000_mira_goals_down.sql
--
-- mira_goal: one row per goal. challenge: the coaching topic it belongs to (today only
--   'body-confidence', Mira's; later coaches add theirs). text: the goal as the person wrote or
--   accepted it, 1 to 120 characters. weekly_target: on how many days a week, 1 to 7, or none.
--   via: 'mira' when it was added from one of Mira's suggestions in the chat, else 'hand'.
--   archived_at: put away; completed_at: done. Goes with the account (ON DELETE CASCADE).
-- mira_goal_log: one row per goal and day the person ticked it ("Did it today"), the day in
--   their own time zone. Its user is the goal's (the composite foreign key), so a tick can never
--   land on someone else's goal; it goes with the goal, and so with the account.
--
-- Special-category data (Art. 9: the goals are often about sex), service role only like every
-- other Mira object; docs/compliance/DPIA.md section 7.13.
-- migration-lint: ignore (the indexes are created on tables created empty in this same file)

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.mira_goal (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.mira_user (id) ON DELETE CASCADE,
  challenge     text NOT NULL DEFAULT 'body-confidence' CHECK (challenge ~ '^[a-z][a-z-]{1,39}$'),
  text          text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 120 AND text = btrim(text)),
  weekly_target smallint CHECK (weekly_target BETWEEN 1 AND 7),
  via           text NOT NULL DEFAULT 'hand' CHECK (via IN ('hand', 'mira')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  archived_at   timestamptz,
  completed_at  timestamptz,
  -- The target of mira_goal_log's composite foreign key.
  UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS mira_goal_user_idx ON public.mira_goal (user_id, created_at);

CREATE TABLE IF NOT EXISTS public.mira_goal_log (
  goal_id    uuid NOT NULL,
  user_id    uuid NOT NULL,
  day        date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (goal_id, day),
  FOREIGN KEY (goal_id, user_id) REFERENCES public.mira_goal (id, user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS mira_goal_log_user_idx ON public.mira_goal_log (user_id, day);

ALTER TABLE public.mira_goal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mira_goal_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mira_goal, public.mira_goal_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mira_goal, public.mira_goal_log TO service_role;

COMMENT ON TABLE public.mira_goal IS
  'Mira goals: a signed-in person''s small goals in their own words (Art. 9), optional days a week (1-7), set by hand or from Mira''s suggestion; archived_at = put away, completed_at = done (features/mira/server/goals.ts).';
COMMENT ON TABLE public.mira_goal_log IS
  'Mira goal ticks: one row per goal and day ticked, the day in the person''s own time zone; the composite key keeps a tick on its own user''s goal.';

COMMIT;
