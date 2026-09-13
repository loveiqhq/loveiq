-- Search became 1.5-5.3 SECONDS once the corpus tripled to 15,835 chunks. It was
-- 88-179ms at ~4,800. Measured cause, from EXPLAIN (ANALYZE) on production:
--
--   Seq Scan on brain_chunk c  (rows=15841, width=1197)  ... 1399 ms
--
-- The scoring term `word_similarity(q.qt, c.body)` forces every candidate row to be
-- read at full width — body plus its TOAST pages. Removing it entirely drops the
-- query to 63ms (width=380, no toast reads at all), but it also changes results: a
-- Drive document whose BODY matches while its title is generic ("Archetype
-- report_draft") falls out of the top ranks. That term earns its place.
--
-- So: score in two stages. Rank cheaply on the indexed columns, keep the best 150,
-- then add the body term to those 150 only — 150 primary-key lookups measured at
-- ~0.1ms each. Verified on five questions: rankings are IDENTICAL to the previous
-- function, at 582ms instead of 1,548ms.
--
-- The remaining cost is stage one still scanning to compute ts_rank. The real fix
-- for that is an embedding column with a vector index, which returns top-K without
-- scoring every candidate; this change is what makes the current shape usable until
-- then.
CREATE OR REPLACE FUNCTION public.brain_search(query_text text, k integer DEFAULT 30, per_source integer DEFAULT 0)
 RETURNS TABLE(id bigint, source text, source_id text, title text, url text, body text, meta jsonb, updated_at timestamp with time zone, period_end date, score real)
 LANGUAGE sql
 STABLE
AS $function$
  WITH q AS (
    -- Cap at the DB boundary, not only in the caller.
    SELECT left(query_text, 1000) AS qt
  ),
  parsed AS (
    SELECT (SELECT string_agg(quote_literal(lexeme), ' | ')
              FROM unnest(to_tsvector('english', q.qt)))::tsquery AS tsq
      FROM q
  ),
  words AS (
    SELECT w FROM (
      SELECT DISTINCT w
        FROM q, regexp_split_to_table(lower(q.qt), '\W+') AS w
       WHERE length(w) > 3 AND to_tsvector('english', w) <> ''::tsvector
    ) d
    -- One trigram probe per word, so the arm's cost is bounded by a constant
    -- rather than by how much text someone pasted.
    LIMIT 40
  ),
  -- UNION ARMS, NOT ONE OR-CHAIN. OPERATOR DIRECTION IS THE WHOLE TRICK:
  -- `c.title %> w.w` uses idx_brain_chunk_title_trgm; `w.w <% c.title` does NOT,
  -- because pg_trgm only accelerates it with the indexed column on the left.
  hits AS MATERIALIZED (
    SELECT c.id FROM public.brain_chunk c, parsed p WHERE c.fts @@ p.tsq
    UNION
    SELECT c.id FROM public.brain_chunk c, q WHERE c.title %> q.qt
    UNION
    SELECT c.id FROM words w JOIN public.brain_chunk c ON c.title %> w.w
  ),
  -- STAGE 1 — cheap. Touches only indexed/narrow columns, so the planner never
  -- fetches `body` and never reads a TOAST page (row width 380, not 1197).
  cheap AS (
    SELECT c.id,
           (coalesce(ts_rank(c.fts, p.tsq), 0) * 4.0
            + word_similarity(q.qt, coalesce(c.title, '')) * 2.0)::REAL AS s0
      FROM public.brain_chunk c
      JOIN hits h ON h.id = c.id
      CROSS JOIN parsed p
      CROSS JOIN q
     ORDER BY s0 DESC
     LIMIT 150
  ),
  -- STAGE 2 — expensive, but only for the 150 that could still win. Wide enough
  -- that the body term cannot change the final answer beyond it: `per_source` caps
  -- at a handful per bucket, and k is capped at 200.
  scored AS (
    SELECT c.id, c.source, c.source_id, c.title, c.url, c.body, c.meta, c.updated_at, c.period_end,
           (ch.s0 + word_similarity(q.qt, c.body))::REAL AS score
      FROM cheap ch
      JOIN public.brain_chunk c ON c.id = ch.id
      CROSS JOIN q
  ),
  ranked AS (
    -- Per SOURCE AND GRAIN, not per source: every GA4 chunk carries "Google
    -- Analytics" in its title, so a spend question once returned 30 of the top 32
    -- from `ga4` alone and the revenue row was never a candidate.
    SELECT s.*,
           row_number() OVER (
             PARTITION BY s.source, coalesce(s.meta->>'grain','')
             ORDER BY s.score DESC, s.period_end DESC NULLS LAST
           ) AS rn_in_bucket
      FROM scored s
  )
  SELECT r.id, r.source, r.source_id, r.title, r.url, r.body, r.meta, r.updated_at, r.period_end, r.score
    FROM ranked r
   WHERE per_source <= 0 OR r.rn_in_bucket <= per_source
   ORDER BY r.score DESC, r.period_end DESC NULLS LAST
   LIMIT least(greatest(k,1), 200);
$function$;

-- 55 MB — the largest index on the table — and provably unused. A
-- `gin(body gin_trgm_ops)` index can only accelerate the `%>` / `<%` OPERATORS;
-- `word_similarity(a, b)` is a plain function call and cannot use it. Verified
-- three ways before dropping: it appears in no EXPLAIN plan for brain_search, no
-- database function references a body trigram operator, and the only mention of it
-- anywhere in the repo is the statement that built it.
DROP INDEX IF EXISTS public.idx_brain_chunk_body_trgm;
