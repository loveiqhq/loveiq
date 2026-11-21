-- Coaches & picks (22 Nov 2026, features/mira/content/coaches.ts): AP › Mira reads the one detail
-- of the coaches' events. Replaces the body of 20261121030000; the signature, grants and answer
-- shape stay. No table or column changes.
-- Rollback: supabase/rollbacks/20261122040000_mira_coaches_down.sql
--
-- mira_ap_events: each entry's detail is now also, by name: notify_me's coach (a coming-soon
--   coach's id; Home's card before 22 Nov sent its challenge, "Libido challenges" or "Saying
--   what you want", which the page reads as the same coach), finder_done's coach (an id, or
--   none), picks_shown's basis (chats or start), pick_clicked's pick (practice-1 to 7 or
--   coach-<id>), guide_ask's practice (1 to 7) and search_empty's where (home or roster). The
--   route only lets these values in (POST /api/mira/event), so no words reach the log.
--
-- Another stream that also replaces mira_ap_events must keep these WHEN lines (and add its own):
-- a CREATE OR REPLACE applied later wins whole.
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
                 -- Coaches & picks (20261122040000): ids and numbers only, never words.
                 WHEN 'notify_me' THEN 'coach'
                 WHEN 'finder_done' THEN 'coach'
                 WHEN 'picks_shown' THEN 'basis'
                 WHEN 'pick_clicked' THEN 'pick'
                 WHEN 'guide_ask' THEN 'practice'
                 WHEN 'search_empty' THEN 'where'
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
  'AP-Analytics, Mira (beta): the named mira_event rows as one JSON array of [name, anon_id, user_id, detail, [ms, ...], team, source, referrer_host] per person, name, detail, team and source, in first-event order; detail = the prop the page reads (rating, chip, method, score, choice, q, topic, coach, basis, pick, practice or where, by name); team = from a team browser; source and referrer_host = where the visit came from, on chat_opened, chat_started and signup_completed (features/admin/server/ap/mira.ts).';

COMMIT;
