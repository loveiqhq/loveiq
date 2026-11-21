-- Mira's self-checks (22 Nov 2026): the anxiety check (GAD-7), the mood check (PHQ-9) and the
-- loneliness check (the Three-Item Loneliness Scale), taken from Home or /mira/assessments for
-- self-reflection and coaching, never diagnosis (features/mira/content/checks.ts). Additive only.
-- Follows 20261121030000. Rollback: supabase/rollbacks/20261122090000_mira_checks_down.sql
--
-- mira_check: one row per finished check: the scale and the answers as given, in the scale's own
--   values (GAD-7 and PHQ-9 0 to 3, the loneliness scale 1 to 3). No score column: the app scores
--   the answers (features/mira/content/checks.ts), so a band changed after review applies to every
--   result, and the browser never sends a score. Health data (Art. 9 GDPR): only its person sees
--   it, and it goes with the account (ON DELETE CASCADE), with "Delete my check results" and with
--   an under-18 stop. The app asks for 14 days between two results of a scale (28 for loneliness);
--   the unique index keeps a double submit from storing two on one day.
-- mira_user.use_checks: "Mira may use my check results", off unless the person turns it on. Only
--   then does the latest band of each check (never answers or scores) reach Mira's context.
--
-- Service role only, like every other Mira object.
-- migration-lint: ignore (the index is created on a table created empty in this same file)

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.mira_check (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.mira_user (id) ON DELETE CASCADE,
  scale      text NOT NULL CHECK (scale IN ('gad7', 'phq9', 'ucla3')),
  answers    smallint[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mira_check_answers CHECK (
    array_position(answers, NULL) IS NULL
    AND CASE scale
      WHEN 'gad7' THEN cardinality(answers) = 7 AND 0 <= ALL (answers) AND 3 >= ALL (answers)
      WHEN 'phq9' THEN cardinality(answers) = 9 AND 0 <= ALL (answers) AND 3 >= ALL (answers)
      WHEN 'ucla3' THEN cardinality(answers) = 3 AND 1 <= ALL (answers) AND 3 >= ALL (answers)
      ELSE false
    END
  )
);

-- One result per scale and UTC day; also the index for every read (by person, by person and scale).
CREATE UNIQUE INDEX IF NOT EXISTS mira_check_one_a_day
  ON public.mira_check (user_id, scale, ((created_at AT TIME ZONE 'UTC')::date));

ALTER TABLE public.mira_check ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mira_check FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mira_check TO service_role;
REVOKE ALL ON SEQUENCE public.mira_check_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mira_check_id_seq TO service_role;

COMMENT ON TABLE public.mira_check IS
  'Mira self-checks: a finished GAD-7, PHQ-9 or Three-Item Loneliness Scale, its answers as given; scored by the app (features/mira/content/checks.ts). Health data, seen only by its person.';

ALTER TABLE public.mira_user
  ADD COLUMN IF NOT EXISTS use_checks boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.mira_user.use_checks IS
  'The person turned on "Mira may use my check results": the latest band of each self-check (never answers or scores) goes into Mira''s context. Off by default.';

COMMIT;
