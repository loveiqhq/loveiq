-- Rollback of 20261120050000_mira_outcomes.sql: mira_ap_events goes back to the body of
-- 20261120040000, the ask column and the body check table go. Roll the code back first: it
-- writes ask and reads mira_body_check. Dropping the table deletes every body check answer.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261120050000_mira_outcomes_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

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
  'AP-Analytics, Mira (beta): the named mira_event rows as one JSON array of [name, anon_id, user_id, detail, [ms, ...]] per person, name and detail, in first-event order; detail = the prop the page reads (rating, chip, method, score or choice, by name) (features/admin/server/ap/mira.ts).';

ALTER TABLE public.mira_message DROP COLUMN IF EXISTS ask;

DROP TABLE IF EXISTS public.mira_body_check;

COMMIT;
