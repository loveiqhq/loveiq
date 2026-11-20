-- Mira's team traffic and campaign sources (21 Nov 2026). Additive only. Follows 20261120050000.
-- Rollback: supabase/rollbacks/20261121030000_mira_team_and_source_down.sql
--
-- The team tests Mira from personal Gmail accounts and anonymous browsers, which counted as real
-- people. A teammate's browser now carries loveiq_team=1 (set by an AP sign-in, or AP › Mira's
-- "This browser counts as team"; loveiq_probe=1 counts the same), and Mira's routes mark what
-- comes from it (features/mira/server/attribution.ts):
--
-- mira_user.is_team: an account created or signed in from a team browser. AP › Mira leaves it
--   out like an account with a team address (ADMIN_TEST_EMAIL_REGEX). Never unset by the app.
-- mira_ap_events: also answers, per entry, `team` (props.team = true: the event came from a
--   team browser) and where the visit came from on chat_opened, chat_started and
--   signup_completed: `source` (the link's utm_source; '' for a recorded visit without one,
--   null where nothing was recorded, before this) and `referrer_host` (the referring site of an
--   untagged visit). Entries are per person, name, detail, team and source, as before plus those.
--
-- Service role only, like every other Mira object.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_user
  ADD COLUMN IF NOT EXISTS is_team boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.mira_user.is_team IS
  'Created or signed in from a team browser (cookie loveiq_team=1 or loveiq_probe=1): left out of AP-Analytics like a team address (features/mira/server/attribution.ts).';

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
