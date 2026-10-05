-- Pin `search_path` on every function we own that is missing one.
--
-- WHAT THIS FIXES. A function with no `search_path` set runs with the CALLER's
-- search_path. For a SECURITY DEFINER function that is a privilege problem: it
-- executes as its owner (`postgres`), so a caller able to create an object in a
-- schema earlier on their path can shadow a table or function name and have
-- their version run as the owner. Supabase's own linter reports it as
-- `function_search_path_mutable`; measured 2026-09-19 it named 23 functions,
-- 16 of them SECURITY DEFINER.
--
-- For the SECURITY INVOKER ones the risk is smaller but the reason to pin is
-- the same in kind: `brain_search` and friends resolve `halfvec`, `%` and
-- `similarity()` through the path, so a different path is a different function.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY THIS SELECTS ITSELF INSTEAD OF LISTING NAMES.
--
-- The obvious version of this migration is a hardcoded list, and the obvious
-- way to build that list is "every function in `public` with `proconfig IS
-- NULL`". That query returns **over 130 rows here**, and almost all of them
-- belong to pgvector and pg_trgm — `vector_add`, `halfvec_cmp`, `gtrgm_union`,
-- `word_similarity_op` and so on. Those extensions are installed INTO `public`
-- on this project (the linter flags that separately as `extension_in_public`),
-- so they are indistinguishable from our own functions by schema alone.
--
-- Altering an extension's functions is wrong twice over: it is not ours to
-- change, and `ALTER EXTENSION ... UPDATE` will overwrite it anyway, so the
-- setting silently disappears at the next extension upgrade and the linter
-- warning comes back with no record of why.
--
-- The `pg_depend` clause below is what separates them: `deptype = 'e'` marks a
-- function as an extension member. With it, the loop selects exactly the 23 the
-- linter means.
--
-- Self-selecting rather than a fixed list so that a function added later with
-- no `search_path` is caught by a re-run, instead of this file going quietly
-- stale the way the list in 20260915162358 did.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY `public, pg_temp` IS THE RIGHT VALUE HERE.
--
-- Every one of these reads tables in `public`, and both extensions they depend
-- on are installed in `public` too — verified, not assumed: `brain_search`
-- takes a `halfvec` argument and calls `similarity()`, and both resolve in
-- `public` on this project. `pg_temp` goes LAST by convention so a session
-- temp table can never shadow a real one.
--
-- If the extensions are ever moved to their own schema (the sane fix for
-- `extension_in_public`), this value must gain that schema in the same change
-- or `brain_search` breaks.
--
-- `ALTER FUNCTION ... SET` does not touch a body, does not change ownership or
-- grants, and is idempotent — so this is re-runnable and safe to apply ahead of
-- or behind 20260919180000, which pins the four sparkline functions as part of
-- fixing their day bounds.

DO $migration$
DECLARE
  fn      RECORD;
  n_def   INT := 0;
  n_inv   INT := 0;
BEGIN
  FOR fn IN
    SELECT p.oid,
           p.proname,
           p.prosecdef,
           pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.proconfig IS NULL
       -- THE LOAD-BEARING CLAUSE. Without it this touches ~130 pgvector and
       -- pg_trgm functions that are not ours to alter.
       AND NOT EXISTS (
         SELECT 1
           FROM pg_depend d
          WHERE d.objid = p.oid
            AND d.classid = 'pg_proc'::regclass
            AND d.deptype = 'e'
       )
     ORDER BY p.proname
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
      fn.proname, fn.args
    );
    IF fn.prosecdef THEN n_def := n_def + 1; ELSE n_inv := n_inv + 1; END IF;
    RAISE NOTICE 'pinned search_path on %(%)  [%]',
      fn.proname, fn.args, CASE WHEN fn.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END;
  END LOOP;

  RAISE NOTICE 'search_path pinned on % function(s): % SECURITY DEFINER, % SECURITY INVOKER',
    n_def + n_inv, n_def, n_inv;

  /*
   * A re-run legitimately finds nothing, so zero is NOT an error. But leaving
   * a SECURITY DEFINER function unpinned IS, and this is the only place that
   * would notice — so check the end state rather than the work done.
   */
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.prosecdef
       AND p.proconfig IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
       )
  ) THEN
    RAISE EXCEPTION
      'a SECURITY DEFINER function in public still has no search_path after this ran — the pg_depend filter or the ALTER is not doing what it claims';
  END IF;
END
$migration$;
