-- ═══════════════════════════════════════════════════════════════════════════
-- Atomic add_unlocked_archetype RPC
-- ═══════════════════════════════════════════════════════════════════════════
-- The previous client-side pattern in lib/report/personalReport.ts performed
-- a read-modify-write on personal_report.unlocked_archetypes:
--   1. SELECT unlocked_archetypes
--   2. compute next = unique([...existing, archetype])
--   3. PATCH ... { unlocked_archetypes: next }
--
-- Two webhooks for the same personal_report racing through that sequence
-- BOTH read the same baseline and BOTH write — last write wins, the other
-- archetype is silently dropped. Move the merge into a single SQL statement
-- so Postgres serializes via the per-row write lock.
--
-- Note on schema: unlocked_archetypes is a `text[]` column (NOT jsonb). The
-- merge uses array operators accordingly. Earlier versions of this migration
-- assumed jsonb and would have raised a type error at runtime.
--
-- DROP first because we changed the return type from jsonb → text[]; Postgres
-- forbids changing return type via CREATE OR REPLACE.

DROP FUNCTION IF EXISTS public.add_unlocked_archetype(bigint, text);

CREATE FUNCTION public.add_unlocked_archetype(
  p_personal_report_id bigint,
  p_archetype text
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result text[];
BEGIN
  IF p_archetype IS NULL OR length(p_archetype) = 0 THEN
    RAISE EXCEPTION 'archetype_required' USING ERRCODE = '22023';
  END IF;

  -- ARRAY(SELECT DISTINCT unnest(...)) builds a deduped array. Plain
  -- text[] || text[] keeps duplicates. ORDER BY produces a stable on-disk
  -- shape so test snapshots and admin diffs stay deterministic.
  UPDATE personal_report
  SET unlocked_archetypes = ARRAY(
    SELECT DISTINCT x
    FROM unnest(COALESCE(unlocked_archetypes, ARRAY[]::text[]) || ARRAY[p_archetype]) AS t(x)
    ORDER BY x
  )
  WHERE id = p_personal_report_id
  RETURNING unlocked_archetypes INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'personal_report_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN COALESCE(v_result, ARRAY[]::text[]);
END;
$$;

-- Service role only — same lockdown as the rest of the SECURITY DEFINER
-- surface. The Node.js server calls this via the service-role key which
-- bypasses EXECUTE checks.
REVOKE EXECUTE ON FUNCTION public.add_unlocked_archetype(bigint, text)
  FROM PUBLIC, anon, authenticated;
