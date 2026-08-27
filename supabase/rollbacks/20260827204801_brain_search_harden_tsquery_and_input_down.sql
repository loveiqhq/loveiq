-- Reverse of 20260827204801.
--
-- Restores the PREVIOUS brain_search rather than dropping it, because
-- 20260825215317 created it and dropping it here would leave the earlier
-- migration's object missing. The column is dropped last, since the function
-- above it returns it.
--
-- NOTE: rolling back re-introduces three known defects -- an all-NULL recency
-- tie-break, `42601 syntax error in tsquery` on any dotted host:port question,
-- and an unbounded question length reaching word_similarity. Roll back only to
-- unblock, and roll forward promptly.

-- Mirror of the forward migration: dropping the 10-column form is required
-- before recreating the 9-column one.
DROP FUNCTION IF EXISTS public.brain_search(text, integer, integer);

CREATE FUNCTION public.brain_search(query_text TEXT, k INT DEFAULT 30, per_source INT DEFAULT 0)
RETURNS TABLE (
  id BIGINT, source TEXT, source_id TEXT, title TEXT, url TEXT, body TEXT,
  meta JSONB, updated_at TIMESTAMPTZ, score REAL
)
LANGUAGE sql
STABLE
AS $$
  WITH parsed AS (
    SELECT (SELECT string_agg(lexeme, ' | ') FROM unnest(to_tsvector('english', query_text)))::tsquery AS tsq
  ),
  scored AS (
    SELECT c.id, c.source, c.source_id, c.title, c.url, c.body, c.meta, c.updated_at,
           (coalesce(ts_rank(c.fts, p.tsq), 0) * 4.0
            + word_similarity(query_text, coalesce(c.title, '')) * 2.0
            + word_similarity(query_text, c.body))::REAL AS score
      FROM public.brain_chunk c CROSS JOIN parsed p
     WHERE c.fts @@ p.tsq OR c.title %> query_text
  ),
  ranked AS (
    SELECT s.*, row_number() OVER (PARTITION BY s.source ORDER BY s.score DESC, s.updated_at DESC) AS rn_in_bucket
      FROM scored s
  )
  SELECT r.id, r.source, r.source_id, r.title, r.url, r.body, r.meta, r.updated_at, r.score
    FROM ranked r
   WHERE per_source <= 0 OR r.rn_in_bucket <= per_source
   ORDER BY r.score DESC, r.updated_at DESC
   LIMIT least(greatest(k, 1), 200);
$$;

REVOKE EXECUTE ON FUNCTION public.brain_search(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_search(text, integer, integer) TO service_role;

ALTER TABLE public.brain_chunk DROP COLUMN IF EXISTS period_end;
