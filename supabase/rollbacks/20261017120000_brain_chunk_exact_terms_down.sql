-- Rollback for 20261017120000_brain_chunk_exact_terms.
--
-- FIRST revert the code that reads the column (find_text in app/api/mcp/route.ts filters
-- on exact_terms), or every find_text call fails while PostgREST reports the column
-- missing. Nothing else reads it.
--
-- Drops the trigram index (CONCURRENTLY, so outside the transaction), then the trigger,
-- the three functions and the column. No data is lost: exact_terms is derived from title
-- and body, and the migration plus scripts/brain-backfill-exact-terms.ts rebuild it.
--
-- Dropping the trigger and the column takes an exclusive lock on brain_chunk, which every
-- ingester writes, so it waits at most 3 seconds and then fails rather than queue those
-- writes behind it. Re-run it if it does.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261017120000_brain_chunk_exact_terms_down.sql

DROP INDEX CONCURRENTLY IF EXISTS public.idx_brain_chunk_exact_terms_trgm;

BEGIN;
SET LOCAL lock_timeout = '3s';

DROP TRIGGER IF EXISTS brain_chunk_exact_terms_follow_text ON public.brain_chunk;
DROP FUNCTION IF EXISTS public.brain_chunk_set_exact_terms();
DROP FUNCTION IF EXISTS public.brain_backfill_exact_terms(bigint, integer);
DROP FUNCTION IF EXISTS public.brain_exact_terms(text, text);
DROP FUNCTION IF EXISTS public.brain_url_decode(text);
ALTER TABLE public.brain_chunk DROP COLUMN IF EXISTS exact_terms;

COMMIT;
