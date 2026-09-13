-- Restores the single-stage scoring and the body trigram index.
-- NOTE: reverting brings back the 1.5-5.3 second query times measured at 15,835
-- chunks, and the index costs 55 MB against a 500 MB ceiling. Revert only if the
-- two-stage ranking is shown to differ in a way that matters.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brain_chunk_body_trgm
  ON public.brain_chunk USING gin (body gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.brain_search(query_text text, k integer DEFAULT 30, per_source integer DEFAULT 0)
 RETURNS TABLE(id bigint, source text, source_id text, title text, url text, body text, meta jsonb, updated_at timestamp with time zone, period_end date, score real)
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
  hits AS (
    SELECT c.id FROM public.brain_chunk c, parsed p WHERE c.fts @@ p.tsq
    UNION SELECT c.id FROM public.brain_chunk c, q WHERE c.title %> q.qt
    UNION SELECT c.id FROM words w JOIN public.brain_chunk c ON c.title %> w.w
  ),
  scored AS (
    SELECT c.id, c.source, c.source_id, c.title, c.url, c.body, c.meta, c.updated_at, c.period_end,
           (coalesce(ts_rank(c.fts, p.tsq), 0) * 4.0
            + word_similarity(q.qt, coalesce(c.title, '')) * 2.0
            + word_similarity(q.qt, c.body))::REAL AS score
      FROM public.brain_chunk c JOIN hits h ON h.id = c.id
      CROSS JOIN parsed p CROSS JOIN q
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
