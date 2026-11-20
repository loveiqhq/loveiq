-- Mira's outcome figures (Marcus's MVP success board "Outcomes & satisfaction", 20 Nov 2026):
-- the body check, which intake question a reply of Mira's asked, and the props the staff page
-- reads for two new events. Additive only. Follows 20261120040000.
-- Rollback: supabase/rollbacks/20261120050000_mira_outcomes_down.sql
--
-- mira_body_check: one row per finished body check, the Body Appreciation Scale-2 (Tylka &
--   Wood-Barcalow 2015, Body Image 12:53-67; free to use, items unchanged): the ten answers
--   (1 = never ... 5 = always) and their mean, which is the scale's score. Only a signed-in
--   person who chose to start it has one; it goes with the account (ON DELETE CASCADE).
-- mira_message.ask: the intake question a reply of Mira's asked (an id from
--   features/mira/content/mira-config.json), so a reopened chat still shows its answer buttons.
-- mira_ap_events: also returns intake_answered's q (the question answered, never the answer)
--   and chat_topic's topic (a new chat's topic id, never its words).
--
-- Service role only, like every other Mira object.
-- migration-lint: ignore (the index is created on a table created empty in this same file)

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.mira_body_check (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.mira_user (id) ON DELETE CASCADE,
  answers    smallint[] NOT NULL CHECK (
               cardinality(answers) = 10
               AND array_position(answers, NULL) IS NULL
               AND 1 <= ALL (answers)
               AND 5 >= ALL (answers)
             ),
  score      numeric(3, 2) GENERATED ALWAYS AS (
               (answers[1] + answers[2] + answers[3] + answers[4] + answers[5]
                + answers[6] + answers[7] + answers[8] + answers[9] + answers[10])::numeric / 10
             ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mira_body_check_user_idx ON public.mira_body_check (user_id, created_at);

ALTER TABLE public.mira_body_check ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mira_body_check FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mira_body_check TO service_role;
REVOKE ALL ON SEQUENCE public.mira_body_check_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.mira_body_check_id_seq TO service_role;

COMMENT ON TABLE public.mira_body_check IS
  'Mira body checks: Body Appreciation Scale-2 answers (1-5) and their mean, at the start and after four weeks, only when the person starts one (features/mira/server/body-check.ts).';

ALTER TABLE public.mira_message
  ADD COLUMN IF NOT EXISTS ask text CHECK (ask ~ '^[a-z]{2,16}$');

COMMENT ON COLUMN public.mira_message.ask IS
  'The intake question id this reply of Mira''s asked (mira-config.json intakeQuestions), shown as answer buttons.';

CREATE OR REPLACE FUNCTION public.mira_ap_events(p_names text[])
RETURNS json
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(
    json_agg(json_build_array(g.name, g.anon_id, g.user_id, g.detail, g.times) ORDER BY g.first_id),
    '[]'::json
  )
  FROM (
    SELECT name,
           anon_id,
           user_id,
           detail,
           min(id) AS first_id,
           array_agg(floor(extract(epoch FROM created_at) * 1000)::bigint ORDER BY id) AS times
      FROM (
        SELECT id,
               name,
               anon_id,
               user_id,
               created_at,
               props ->> CASE name
                 WHEN 'rating' THEN 'rating'
                 WHEN 'chat_started' THEN 'chip'
                 WHEN 'signup_completed' THEN 'method'
                 WHEN 'nps' THEN 'score'
                 WHEN 'nudge_prefs_saved' THEN 'choice'
                 WHEN 'intake_answered' THEN 'q'
                 WHEN 'chat_topic' THEN 'topic'
               END AS detail
          FROM public.mira_event
         WHERE name = ANY (p_names)
      ) e
     GROUP BY name, anon_id, user_id, detail
  ) g;
$$;

REVOKE ALL ON FUNCTION public.mira_ap_events(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mira_ap_events(text[]) TO service_role;

COMMENT ON FUNCTION public.mira_ap_events(text[]) IS
  'AP-Analytics, Mira (beta): the named mira_event rows as one JSON array of [name, anon_id, user_id, detail, [ms, ...]] per person, name and detail, in first-event order; detail = the prop the page reads (rating, chip, method, score, choice, q or topic, by name) (features/admin/server/ap/mira.ts).';

COMMIT;
