-- Reverts to lexical-only ranking. Search still works; it simply stops finding
-- documents that share no words with the question.
--
-- This deliberately does NOT drop brain_search and restore the three-argument form
-- from 20260829120000. By the time anyone runs this, the DEPLOYED APP IS PASSING
-- FOUR ARGUMENTS -- so restoring the old signature would take search down exactly
-- as hard as the bug this file exists to undo. A rollback that requires a
-- simultaneous app rollback to avoid an outage is not a rollback.
--
-- So the signature is kept and only the vector BEHAVIOUR is removed: the recall arm
-- and the similarity term are gone, `query_embedding` is accepted and ignored. Old
-- and new callers both keep working, with or without the index.
--
-- The body below is the lexical function from 20260829120000, with the vector parts
-- lifted out. It is duplicated rather than referenced because a rollback that
-- depends on re-running another file is one that fails when you least want it to.
CREATE OR REPLACE FUNCTION public.brain_search(
  query_text text,
  k integer DEFAULT 30,
  per_source integer DEFAULT 0,
  query_embedding halfvec(384) DEFAULT NULL
)
 RETURNS TABLE(id bigint, source text, source_id text, title text, url text, body text,
               meta jsonb, updated_at timestamp with time zone, period_end date, score real)
 LANGUAGE sql
 STABLE
AS $function$
  WITH q AS (SELECT left(query_text, 1000) AS qt),
  parsed AS (
    SELECT (SELECT string_agg(quote_literal(lexeme), ' | ')
              FROM unnest(to_tsvector('english', q.qt)))::tsquery AS tsq FROM q
  ),
  words AS (
    SELECT w FROM (
      SELECT DISTINCT w FROM q, regexp_split_to_table(lower(q.qt), '\W+') AS w
       WHERE length(w) > 3 AND to_tsvector('english', w) <> ''::tsvector
    ) d LIMIT 40
  ),
  hits AS MATERIALIZED (
    SELECT c.id FROM public.brain_chunk c, parsed p WHERE c.fts @@ p.tsq
    UNION SELECT c.id FROM public.brain_chunk c, q WHERE c.title %> q.qt
    UNION SELECT c.id FROM words w JOIN public.brain_chunk c ON c.title %> w.w
  ),
  cheap AS (
    SELECT c.id,
           (coalesce(ts_rank(c.fts, p.tsq), 0) * 4.0
            + word_similarity(q.qt, coalesce(c.title, '')) * 2.0)::REAL AS s0
      FROM public.brain_chunk c
      JOIN hits h ON h.id = c.id
      CROSS JOIN parsed p CROSS JOIN q
     ORDER BY s0 DESC LIMIT 150
  ),
  scored AS (
    SELECT c.id, c.source, c.source_id, c.title, c.url, c.body, c.meta, c.updated_at, c.period_end,
           (ch.s0 + word_similarity(q.qt, c.body))::REAL AS score
      FROM cheap ch JOIN public.brain_chunk c ON c.id = ch.id CROSS JOIN q
  ),
  ranked AS (
    SELECT s.*, row_number() OVER (
             PARTITION BY s.source, coalesce(s.meta->>'grain','')
             ORDER BY s.score DESC, s.period_end DESC NULLS LAST) AS rn_in_bucket
      FROM scored s
  )
  SELECT r.id, r.source, r.source_id, r.title, r.url, r.body, r.meta, r.updated_at, r.period_end, r.score
    FROM ranked r WHERE per_source <= 0 OR r.rn_in_bucket <= per_source
   ORDER BY r.score DESC, r.period_end DESC NULLS LAST
   LIMIT least(greatest(k,1), 200);
$function$;

-- Dropped last: while the function above still referenced the index, dropping it
-- first would have made every search fall back to a sequential scan mid-rollback.
DROP INDEX IF EXISTS public.idx_brain_chunk_embedding;
