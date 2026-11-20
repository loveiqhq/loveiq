-- Rollback of 20261120040000_mira_ap_events_props.sql: mira_ap_events goes back to the body of
-- 20261120020000 (each entry's 4th value is props->>'rating' again). Roll the code back first:
-- the page that reads the new value would see no chips, sign-up methods or pauses, and every NPS
-- answer as "Not now".
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261120040000_mira_ap_events_props_down.sql

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
    json_agg(json_build_array(g.name, g.anon_id, g.user_id, g.rating, g.times) ORDER BY g.first_id),
    '[]'::json
  )
  FROM (
    SELECT name,
           anon_id,
           user_id,
           props ->> 'rating' AS rating,
           min(id) AS first_id,
           array_agg(floor(extract(epoch FROM created_at) * 1000)::bigint ORDER BY id) AS times
      FROM public.mira_event
     WHERE name = ANY (p_names)
     GROUP BY name, anon_id, user_id, props ->> 'rating'
  ) g;
$$;

REVOKE ALL ON FUNCTION public.mira_ap_events(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mira_ap_events(text[]) TO service_role;

COMMENT ON FUNCTION public.mira_ap_events(text[]) IS
  'AP-Analytics, Mira (beta): the named mira_event rows as one JSON array of [name, anon_id, user_id, rating, [ms, ...]] per person, name and rating, in first-event order (features/admin/server/ap/mira.ts).';

COMMIT;
