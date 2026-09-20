-- `functions` lists every function in public, which is 230 of them — 149 are
-- provided by pgvector and pg_trgm (halfvec, gtrgm_*, cosine_distance …). That
-- is fine for the forward check (repo -> live: an extension function is never
-- declared by a migration, so it is never looked for), but it makes the REVERSE
-- check impossible: "what does production have that no migration can rebuild"
-- drowns in 149 false positives.
--
-- That reverse direction is the one that mattered. On 2026-09-20 it found five
-- functions and four tables production had that no migration created, which is
-- why `supabase db push` against an empty project failed outright at
-- 20260329231617_admin_security_hardening.sql — and why this repo could not
-- have rebuilt the database for staging or for disaster recovery. Captured in
-- 20260307095959_objects_that_predate_the_migration_history.sql.
--
-- `ownFunctions` is the same list with extension-owned entries removed (81 of
-- 230), so the reverse check can be a real gate instead of a one-off script.
--
-- This file must sort AFTER 20260919270000, which creates the function: the
-- MCP clock-stamped it 20260919225625, which sorted BEFORE, so a fresh replay
-- would have created it here and then overwritten it — losing ownFunctions
-- silently. The ledger row was moved to match this filename.
CREATE OR REPLACE FUNCTION public.get_schema_artifacts()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
  SELECT json_build_object(
    'functions', COALESCE((
      SELECT json_agg(p.proname ORDER BY p.proname)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
    ), '[]'::json),
    'ownFunctions', COALESCE((
      SELECT json_agg(DISTINCT p.proname ORDER BY p.proname)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND NOT EXISTS (
           SELECT 1 FROM pg_depend d
            WHERE d.objid = p.oid
              AND d.classid = 'pg_proc'::regclass
              AND d.deptype = 'e')
    ), '[]'::json),
    'indexes', COALESCE((
      SELECT json_agg(indexname ORDER BY indexname)
        FROM pg_indexes WHERE schemaname = 'public'
    ), '[]'::json),
    'constraints', COALESCE((
      SELECT json_agg(con.conname ORDER BY con.conname)
        FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace
       WHERE n.nspname = 'public'
    ), '[]'::json),
    'columns', COALESCE((
      SELECT json_agg(c.table_name || '.' || c.column_name ORDER BY c.table_name, c.column_name)
        FROM information_schema.columns c
       WHERE c.table_schema = 'public'
    ), '[]'::json),
    'ledger', COALESCE((
      SELECT json_agg(json_build_object('version', m.version, 'name', m.name) ORDER BY m.version)
        FROM supabase_migrations.schema_migrations m
    ), '[]'::json)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_schema_artifacts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_schema_artifacts() TO service_role;
