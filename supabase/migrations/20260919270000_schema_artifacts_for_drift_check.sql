-- Let the drift check run without handing CI a Postgres password.
--
-- `migration-drift` has never executed. It gates on SUPABASE_DB_URL, which was
-- never set, and a job whose only step is skipped still reports SUCCESS — so it
-- has been green and blind on every commit since it was written. Confirmed again
-- on 2026-09-19: "SUPABASE_DB_URL unset — skipping drift check."
--
-- The obvious fix is to set that secret, but it is a direct superuser-ish
-- connection string, and every workflow run and every fork-less PR would then
-- carry full read-write access to production. The job only ever runs five
-- read-only catalogue queries, so it does not need anything like that.
--
-- This returns exactly those five results as one JSON document, callable through
-- PostgREST with the service-role key that is ALREADY a repository secret. No
-- new credential class, no `pg` dependency in CI.
--
-- Read-only by construction: it SELECTs from catalogues and takes no parameters,
-- so there is no injection surface and nothing to write. service_role only.

CREATE OR REPLACE FUNCTION public.get_schema_artifacts()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $function$
  SELECT json_build_object(
    'functions', COALESCE((
      SELECT json_agg(p.proname ORDER BY p.proname)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
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
    -- "table.column", the shape the drift script compares on.
    'columns', COALESCE((
      SELECT json_agg(c.table_name || '.' || c.column_name ORDER BY c.table_name, c.column_name)
        FROM information_schema.columns c
       WHERE c.table_schema = 'public'
    ), '[]'::json),
    -- The ledger the repo's filenames are checked against. Lives outside the
    -- public schema, which is why PostgREST cannot read it directly and this
    -- function has to.
    'ledger', COALESCE((
      SELECT json_agg(json_build_object('version', m.version, 'name', m.name) ORDER BY m.version)
        FROM supabase_migrations.schema_migrations m
    ), '[]'::json)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_schema_artifacts() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_schema_artifacts() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_schema_artifacts() TO service_role;

COMMENT ON FUNCTION public.get_schema_artifacts() IS
  'Read-only catalogue snapshot (functions, indexes, constraints, columns, '
  'migration ledger) for the CI migration-drift check, so it can run with the '
  'service-role key instead of a direct Postgres connection string.';
