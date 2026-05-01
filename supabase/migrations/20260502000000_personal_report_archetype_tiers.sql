-- Per-archetype tier tracking on personal_report.
--
-- The previous model stored only archetype names (`unlocked_archetypes text[]`)
-- and assumed every entry was a `full_report` unlock. We're letting users buy
-- Essentials per archetype too, so we need the tier alongside each name.
--
-- New shape: archetype_tiers jsonb of `{ "<archetype name>": "essentials" |
-- "full_report" }`. We keep `unlocked_archetypes` in sync (mirror of the keys)
-- for any reader that hasn't been migrated yet — a follow-up commit can drop
-- it once all callers move to the new column.

ALTER TABLE personal_report
  ADD COLUMN IF NOT EXISTS archetype_tiers jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill from the legacy column. Every entry there was a full_report unlock.
UPDATE personal_report
   SET archetype_tiers = COALESCE(
     (SELECT jsonb_object_agg(name, 'full_report')
        FROM unnest(unlocked_archetypes) AS t(name)),
     '{}'::jsonb
   )
 WHERE archetype_tiers = '{}'::jsonb
   AND unlocked_archetypes IS NOT NULL
   AND array_length(unlocked_archetypes, 1) > 0;

-- Replace the legacy `add_unlocked_archetype` RPC with one that accepts a
-- tier and merges with "highest tier wins" semantics so an essentials buy
-- never downgrades a prior full_report unlock.
CREATE OR REPLACE FUNCTION public.upsert_archetype_tier(
  p_personal_report_id bigint,
  p_archetype text,
  p_tier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_tier text;
  next_tier text;
  result jsonb;
BEGIN
  IF p_archetype IS NULL OR length(p_archetype) = 0 THEN
    RAISE EXCEPTION 'archetype_required' USING ERRCODE = '22023';
  END IF;
  IF p_tier NOT IN ('essentials', 'full_report') THEN
    RAISE EXCEPTION 'invalid_tier' USING ERRCODE = '22023';
  END IF;

  SELECT (archetype_tiers->>p_archetype) INTO existing_tier
    FROM personal_report
   WHERE id = p_personal_report_id;

  next_tier := CASE
    WHEN existing_tier = 'full_report' THEN 'full_report'
    ELSE p_tier
  END;

  UPDATE personal_report
     SET archetype_tiers = archetype_tiers || jsonb_build_object(p_archetype, next_tier),
         unlocked_archetypes = ARRAY(
           SELECT k FROM jsonb_object_keys(
             archetype_tiers || jsonb_build_object(p_archetype, next_tier)
           ) AS t(k)
           ORDER BY k
         )
   WHERE id = p_personal_report_id
   RETURNING archetype_tiers INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'personal_report_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_archetype_tier(bigint, text, text) TO service_role;

-- Drop the legacy single-tier RPC. Application callers move to upsert_archetype_tier.
DROP FUNCTION IF EXISTS public.add_unlocked_archetype(bigint, text);
