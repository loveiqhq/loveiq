-- Short links for the AI influencer pilot (30 Oct 2026, features/short-links).
--
-- Seedlane runs four AI influencer profiles for us (Nora, Mila, Elena, Jonas). Its DMs and
-- comments need a short address instead of a long tagged one, so `loveiq.org/<code>` redirects
-- to the landing page with the five utm_ tags (proxy.ts). Seedlane creates the links through
-- /api/short-links with its own notes on each (who a DM went to, the post), and reads their
-- clicks back the same way.
--
-- `meta` holds Seedlane's notes as it sends them. They can name a person (a TikTok handle), so
-- the team export masks the whole column (features/admin/server/team-export.ts) and the
-- PostHog warehouse role does not get this table. Clicks are a count and two times: no IP, no
-- browser, nothing about who followed the link.
--
-- Rollback: supabase/rollbacks/20261030010000_short_link_down.sql.

CREATE TABLE IF NOT EXISTS public.short_link (
  code           text PRIMARY KEY CHECK (code ~ '^[a-z0-9]{7}$' AND code ~ '[0-9]'),
  influencer     text NOT NULL CHECK (influencer ~ '^[a-z0-9_]{2,30}$'),
  platform       text NOT NULL CHECK (platform IN ('tiktok', 'instagram', 'facebook', 'linkedin')),
  placement      text NOT NULL CHECK (placement IN ('bio', 'dm', 'comment', 'ad')),
  meta           jsonb NOT NULL DEFAULT '{}'::jsonb
                   CHECK (jsonb_typeof(meta) = 'object' AND pg_column_size(meta) <= 8192),
  clicks         integer NOT NULL DEFAULT 0,
  first_click_at timestamptz,
  last_click_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.short_link ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS short_link_service_only ON public.short_link;
CREATE POLICY short_link_service_only ON public.short_link
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.short_link FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.short_link TO service_role;

-- Production's default privileges give posthog_readonly SELECT on every new table. This one
-- holds Seedlane's notes, which can name a person, and nothing PostHog joins on: taken away.
-- The role exists on production only, hence the guard.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'posthog_readonly') THEN
    REVOKE ALL ON public.short_link FROM posthog_readonly;
  END IF;
END
$$;

-- One click: counted and the link returned in one statement, so two clicks at the same moment
-- both count. Called by proxy.ts for a person's click only; a preview or a probe reads the row
-- instead.
CREATE OR REPLACE FUNCTION public.short_link_click(p_code text)
RETURNS TABLE (influencer text, platform text, placement text)
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.short_link AS s
     SET clicks = s.clicks + 1,
         first_click_at = COALESCE(s.first_click_at, now()),
         last_click_at = now()
   WHERE s.code = p_code
  RETURNING s.influencer, s.platform, s.placement;
$$;

REVOKE ALL ON FUNCTION public.short_link_click(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.short_link_click(text) TO service_role;

COMMENT ON TABLE public.short_link IS
  'Short links for the AI influencer pilot (Seedlane, from 2026-10-30): loveiq.org/<code> redirects to the landing page tagged utm_source=platform, utm_medium=social (paid_social for ad), utm_campaign=ai_<influencer>, utm_content=placement, utm_term=code. Created through /api/short-links.';
COMMENT ON COLUMN public.short_link.code IS 'Seven letters or digits, at least one a digit; the address is loveiq.org/<code>, and utm_term carries it.';
COMMENT ON COLUMN public.short_link.influencer IS 'The influencer, as utm_campaign carries it after ai_: mila, elena, jonas, nora.';
COMMENT ON COLUMN public.short_link.platform IS 'Where the link is posted, as utm_source.';
COMMENT ON COLUMN public.short_link.placement IS 'Where on the platform it sits (bio, dm, comment, ad), as utm_content; ad is a promoted post and the only paid one.';
COMMENT ON COLUMN public.short_link.meta IS 'Seedlane''s own notes on the link (for example the handle a DM went to, the post). Can name a person: masked in the team export.';
COMMENT ON COLUMN public.short_link.clicks IS 'Clicks by people; link previews and our own probes are not counted.';
COMMENT ON COLUMN public.short_link.first_click_at IS 'When a person first followed the link.';
COMMENT ON COLUMN public.short_link.last_click_at IS 'When a person last followed the link.';
COMMENT ON COLUMN public.short_link.created_at IS 'When Seedlane created the link.';
