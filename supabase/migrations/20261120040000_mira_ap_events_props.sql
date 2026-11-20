-- AP-Analytics' Mira page counts the design's figures from one prop of five events (audit before
-- launch, 20 Nov 2026). Replaces 20261120020000's body; the signature, grants and answer shape
-- stay. Rollback: supabase/rollbacks/20261120040000_mira_ap_events_props_down.sql
--
-- Each entry's 4th value was props->>'rating'. It is now the one prop the page reads for that
-- event, by name: rating's rating (1, -1), chat_started's chip (the starter chip's index, -1 for
-- the person's own words), signup_completed's method (email, google), nps's score (0 to 10, null
-- for "Not now") and nudge_prefs_saved's choice (pause, twice_weekly, types); null for any other
-- event. Entries are per person, name and that value, as before (features/admin/server/ap/mira.ts).
--
-- Service role only, like every other Mira object.

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

COMMIT;
