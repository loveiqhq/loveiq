-- find_text finds a text the word index keeps inside a longer token (17 Oct 2026).
--
-- THE PROBLEM. find_text takes its candidates from `fts` and then checks the literal text.
-- The parser keeps a link, an email address, a host or a file name as one token, so a text
-- inside one is never a candidate and the literal check never sees it. Verified on
-- production:
--   * an address inside a Google Docs sharing link in a Notion task title: "nothing indexed
--     holds";
--   * two addresses run together ("...@loveiq.orgmb@loveiq.org"): 181 of 182 documents;
--   * a link URL-encoded inside a redirect (url=https%3A%2F%2Fcalendly.com...): 2 of 3;
--   * an invoice number inside a file name ("Invoice-<number>.pdf" is one token): 3 of 5
--     parts.
--
-- THE FIX. `exact_terms` holds only the whitespace-separated runs of title and body that
-- contain @, ://, www., %40 or %3A, or end in a file extension, lower-cased, plus the
-- URL-decoded form of each such run that holds a %. A trigram index on it lets find_text
-- match any part of those runs. A trigram index on every body would be about 150 MB; on
-- production's text this column is 5.3 MB on 17,310 of 34,615 rows, and its index 13 to
-- 15 MB (built from that text, 17 Oct).
--
-- WHO FILLS IT. A BEFORE INSERT OR UPDATE OF title, body trigger, so every writer is
-- covered, for the reason the embedding trigger gives: a rule each ingester has to remember
-- is a rule the next one forgets. `fts` is not touched, and the table is not rewritten: a
-- column with no default is a catalogue change.
--
-- THE EXISTING ROWS ARE FILLED OUTSIDE THIS MIGRATION, by
-- scripts/brain-backfill-exact-terms.ts, 1,000 rows per call of
-- brain_backfill_exact_terms(). Its UPDATE sets exact_terms and nothing else, so the
-- UPDATE OF title, body trigger does not fire, and brain_chunk_embedding_follows_text,
-- which clears an embedding only when title or body changes, keeps every embedding.
--
-- Rollback: supabase/rollbacks/20261017120000_brain_chunk_exact_terms_down.sql.

BEGIN;
-- Every ingester writes this table: fail in 3 seconds rather than queue their writes and
-- every search behind the ALTER's lock. Re-run it if it does.
SET LOCAL lock_timeout = '3s';

ALTER TABLE public.brain_chunk ADD COLUMN IF NOT EXISTS exact_terms text;

COMMENT ON COLUMN public.brain_chunk.exact_terms IS
  'The runs of title and body the word index keeps whole (links, addresses, file names), lower-cased, plus each URL-decoded. Filled by a trigger; read by find_text through a trigram index.';

-- Every %XX as its byte, the whole read as UTF-8. Text that is not UTF-8 once decoded (a
-- Latin-1 é is %E9, a NUL is %00) gets its printable ASCII escapes decoded instead, so a
-- write never fails on what a link holds.
CREATE OR REPLACE FUNCTION public.brain_url_decode(t text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE STRICT PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN convert_from(
    (SELECT string_agg(CASE WHEN m[1] IS NULL THEN convert_to(m[2], 'UTF8') ELSE decode(m[1], 'hex') END,
                       ''::bytea ORDER BY n)
       FROM regexp_matches(t, '%([0-9a-f]{2})|([^%]+|%)', 'gi') WITH ORDINALITY AS r(m, n)),
    'UTF8');
EXCEPTION WHEN character_not_in_repertoire THEN
  RETURN (SELECT string_agg(CASE WHEN m[1] IS NULL THEN m[2] ELSE chr(('x' || m[1])::bit(8)::int) END,
                            '' ORDER BY n)
            FROM regexp_matches(t, '%([2-7][0-9a-f])|([^%]+|%)', 'gi') WITH ORDINALITY AS r(m, n));
END;
$function$;

-- One regex pass, linear in the text: 5 ms for 200,000 characters with no match, about 1 ms
-- for a part of an email on production. The extensions are documents, data, images, audio,
-- video, archives and code; production's runs end most often in pdf, md, docx, ts, png and
-- json (17 Oct).
CREATE OR REPLACE FUNCTION public.brain_exact_terms(p_title text, p_body text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT string_agg(DISTINCT v.t, ' ')
    FROM regexp_matches(
           lower(coalesce(p_title, '') || ' ' || coalesce(p_body, '')),
           '(\S*(?:@|://|www\.|%40|%3a)\S*|\S*\.(?:pdf|docx?|xlsx?|xlsm|pptx?|od[tsp]|rtf|txt|csv|tsv|md|json|xml|ya?ml|html?|sql|ics|eml|png|jpe?g|gif|svg|webp|heic|mp[34]|m4a|mov|wav|zip|[jt]sx?|mjs|css|sh|py)[^a-z0-9[:space:]]*(?=\s|$))',
           'g') AS r(m)
   CROSS JOIN LATERAL (VALUES (r.m[1]),
           (CASE WHEN strpos(r.m[1], '%') > 0 THEN public.brain_url_decode(r.m[1]) END)) AS v(t)
   WHERE v.t IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.brain_chunk_set_exact_terms()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.exact_terms := public.brain_exact_terms(NEW.title, NEW.body);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS brain_chunk_exact_terms_follow_text ON public.brain_chunk;
CREATE TRIGGER brain_chunk_exact_terms_follow_text
  BEFORE INSERT OR UPDATE OF title, body ON public.brain_chunk
  FOR EACH ROW
  EXECUTE FUNCTION public.brain_chunk_set_exact_terms();

-- ONE BACKFILL BATCH: the next p_limit rows after p_after, by id. Sets exact_terms only, and
-- only where it differs, so a second run writes nothing. A row an ingester rewrote after the
-- batch was read already has the terms of its new text from the trigger, so it is left
-- alone. Waits at most 2 seconds for a row an ingester holds, then fails; the script tries
-- again. Each row's terms are computed once: PostgREST stops a statement at 8 seconds.
CREATE OR REPLACE FUNCTION public.brain_backfill_exact_terms(p_after bigint, p_limit integer)
RETURNS TABLE (last_id bigint, scanned integer, written integer)
LANGUAGE sql
SET search_path TO 'public', 'pg_temp'
SET lock_timeout TO '2s'
AS $function$
  WITH batch AS (
    SELECT id, title, body, public.brain_exact_terms(title, body) AS terms
      FROM public.brain_chunk
     WHERE id > p_after
     ORDER BY id
     LIMIT least(greatest(p_limit, 1), 1000)
  ), filled AS (
    UPDATE public.brain_chunk c
       SET exact_terms = b.terms
      FROM batch b
     WHERE c.id = b.id
       AND c.exact_terms IS DISTINCT FROM b.terms
       AND c.title IS NOT DISTINCT FROM b.title
       AND c.body = b.body
    RETURNING c.id
  )
  SELECT (SELECT max(id) FROM batch), (SELECT count(*)::int FROM batch), (SELECT count(*)::int FROM filled);
$function$;

REVOKE ALL ON FUNCTION public.brain_url_decode(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.brain_exact_terms(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.brain_backfill_exact_terms(bigint, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_url_decode(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.brain_exact_terms(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.brain_backfill_exact_terms(bigint, integer) TO service_role;

COMMIT;

-- Outside the transaction, as Postgres requires and the migration lint enforces. Built on an
-- empty column, so it is quick; the backfill then fills it.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brain_chunk_exact_terms_trgm
  ON public.brain_chunk USING gin (exact_terms gin_trgm_ops);
