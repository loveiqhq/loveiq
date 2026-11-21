-- Rollback of 20261122040000_mira_coaches.sql: mira_ap_events goes back to the body of
-- 20261121030000 (no detail for the coaches' events). AP › Mira's "Coaches & picks" card then
-- shows no coach, outcome or practice; the events keep their props. Nothing else changes.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261122040000_mira_coaches_down.sql

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
    json_agg(
      json_build_array(g.name, g.anon_id, g.user_id, g.detail, g.times, g.team, g.source, g.referrer_host)
      ORDER BY g.first_id
    ),
    '[]'::json
  )
  FROM (
    SELECT name,
           anon_id,
           user_id,
           detail,
           team,
           source,
           referrer_host,
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
               END AS detail,
               coalesce(props ->> 'team' = 'true', false) AS team,
               CASE
                 WHEN name IN ('chat_opened', 'chat_started', 'signup_completed') AND props ? 'source'
                 THEN coalesce(props ->> 'source', '')
               END AS source,
               CASE
                 WHEN name IN ('chat_opened', 'chat_started', 'signup_completed')
                 THEN props ->> 'referrer_host'
               END AS referrer_host
          FROM public.mira_event
         WHERE name = ANY (p_names)
      ) e
     GROUP BY name, anon_id, user_id, detail, team, source, referrer_host
  ) g;
$$;

REVOKE ALL ON FUNCTION public.mira_ap_events(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mira_ap_events(text[]) TO service_role;

COMMENT ON FUNCTION public.mira_ap_events(text[]) IS
  'AP-Analytics, Mira (beta): the named mira_event rows as one JSON array of [name, anon_id, user_id, detail, [ms, ...], team, source, referrer_host] per person, name, detail, team and source, in first-event order; detail = the prop the page reads (rating, chip, method, score, choice, q or topic, by name); team = from a team browser; source and referrer_host = where the visit came from, on chat_opened, chat_started and signup_completed (features/admin/server/ap/mira.ts).';

COMMIT;
