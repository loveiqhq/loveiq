-- AP-Analytics' Mira page reads Mira's KPI log through this function (audit before launch,
-- 20 Nov 2026). Additive only. Rollback: supabase/rollbacks/20261120020000_mira_ap_events_down.sql
--
-- The page read every counted mira_event row, a thousand per request, and refused past 100,000
-- (a few weeks of beta use). mira_ap_events(names) answers in ONE value instead: an entry per
-- person (user_id, anon_id), event name and rating, with the times of its events in
-- milliseconds, oldest first; entries in the order of their first event. The page counts exactly
-- as before (features/admin/server/ap/mira.ts), it just no longer pages through rows.
-- ponytail: still every event's time (about 15 bytes each); count in SQL past a few million.
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
