-- Down for 20260906092809_brain_search_caller_filters.
--
-- Restores the four-argument function and drops the nine-argument one. Callers that
-- pass filters will then fail to resolve, which is correct and loud -- silently
-- ignoring a filter would return an UNFILTERED result set shaped exactly like a
-- filtered one, and that is the failure this whole subsystem is written against.
--
-- Order matters here too: create the old signature first, then drop the new one.

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
  -- RECALL, not ranking. This arm exists to surface documents that share no words
  -- with the question at all, which is the whole point of embeddings.
  vec AS (
    SELECT c.id FROM public.brain_chunk c
     WHERE query_embedding IS NOT NULL AND c.embedding IS NOT NULL
     ORDER BY c.embedding <=> query_embedding
     LIMIT 120
  ),
  hits AS MATERIALIZED (
    SELECT c.id FROM public.brain_chunk c, parsed p WHERE c.fts @@ p.tsq
    UNION SELECT c.id FROM public.brain_chunk c, q WHERE c.title %> q.qt
    UNION SELECT c.id FROM words w JOIN public.brain_chunk c ON c.title %> w.w
    UNION SELECT id FROM vec
  ),
  -- STAGE 1 — cheap. Touches no wide column, so no TOAST page is read.
  cheap AS (
    SELECT c.id,
           (coalesce(ts_rank(c.fts, p.tsq), 0) * 4.0
            + word_similarity(q.qt, coalesce(c.title, '')) * 2.0
            -- `gte-small` similarities cluster around 0.7-0.95, so the raw value
            -- shifts every row by roughly the same amount and ranks nothing.
            -- Measuring from a 0.7 floor is what turns it into a discriminating
            -- signal rather than a constant.
            + CASE WHEN query_embedding IS NULL OR c.embedding IS NULL THEN 0
                   ELSE greatest(0, (1 - (c.embedding <=> query_embedding)) - 0.7) * 8.0 END
            -- DEMOTED, NOT EXCLUDED. Bulk mail stays fully indexed and fully
            -- searchable; it just stops outranking a colleague's actual answer on
            -- a vague question. 0.25 is measured, not chosen.
            - CASE WHEN c.source = 'gmail' AND c.meta->>'bulk' = 'true'
                   THEN 0.25 ELSE 0 END
            -- RECENCY, weight 0.6, measured. coalesce(period_end, CURRENT_DATE) is
            -- load-bearing: `doc` chunks are the repo's own markdown, current by
            -- construction, and scoring their NULL as 0 was measured to destroy
            -- every documentation lookup. greatest(...,0) clamps future-dated
            -- calendar rows.
            + 0.6 * exp(-greatest(CURRENT_DATE - coalesce(c.period_end, CURRENT_DATE), 0)::real / 45.0)
           )::REAL AS s0
      FROM public.brain_chunk c
      JOIN hits h ON h.id = c.id
      CROSS JOIN parsed p CROSS JOIN q
     ORDER BY s0 DESC LIMIT 400
  ),
  -- STAGE 2 — the body term, for only the 400 that could still win.
  scored AS (
    SELECT c.id, c.source, c.source_id, c.title, c.url, c.body, c.meta, c.updated_at, c.period_end,
           (ch.s0 + word_similarity(q.qt, c.body))::REAL AS score
      FROM cheap ch JOIN public.brain_chunk c ON c.id = ch.id CROSS JOIN q
  ),
  -- One row per DOCUMENT, not per chunk.
  --
  -- Two different things were putting near-duplicates in the results:
  --   * a long email or doc is stored as `<id>#2`, `<id>#3`... so a single
  --     newsletter could take three of five slots;
  --   * one broadcast email reaches ten mailboxes and is indexed once per
  --     mailbox -- measured, 40.8% of gmail threads share a subject with another.
  -- Collapsing gmail on the subject line handles both at once.
  deduped AS (
    SELECT s.*, row_number() OVER (
             PARTITION BY s.source,
               CASE WHEN s.source = 'gmail' AND coalesce(s.title,'') <> ''
                      THEN regexp_replace(s.title, ' \(part \d+ of \d+\)$', '')
                    WHEN s.meta->>'part' IS NOT NULL THEN split_part(s.source_id, '#', 1)
                    ELSE s.source_id END
             -- PREFER THE DECISION RECORD OVER THE TRANSCRIPT.
             --
             -- A Gemini meeting note is two documents in one file, and this dedup
             -- keeps exactly one part per document. Measured across all 114 notes
             -- on four decision-shaped questions, the winner was a TRANSCRIPT part
             -- 24-46% of the time -- so on roughly a third of meetings the
             -- decisions were discarded at random in favour of "I give you 20
             -- seconds because I also need to get shoes".
             --
             -- A deterministic preference, not a weight: the spread between the two
             -- halves is noise, and no coefficient separates noise reliably. The
             -- transcript is not lost -- `fetch_document` returns the whole file --
             -- which is why this can be a preference rather than a reserved slot,
             -- and why it costs no retrieval budget.
             --
             -- coalesce() is load-bearing: `meta->>'section'` is NULL for every
             -- other source, and `NULL = 'transcript'` is NULL, which sorts LAST
             -- under ASC and would push every non-meeting chunk to the bottom.
             ORDER BY (coalesce(s.meta->>'section','') = 'transcript') ASC,
                      s.score DESC) AS rn_in_doc
      FROM scored s
  ),
  ranked AS (
    SELECT d.*, row_number() OVER (
             PARTITION BY d.source, coalesce(d.meta->>'grain','')
             ORDER BY d.score DESC, d.period_end DESC NULLS LAST) AS rn_in_bucket
      FROM deduped d WHERE d.rn_in_doc = 1
  )
  SELECT r.id, r.source, r.source_id, r.title, r.url, r.body, r.meta, r.updated_at, r.period_end, r.score
    FROM ranked r WHERE per_source <= 0 OR r.rn_in_bucket <= per_source
   ORDER BY r.score DESC, r.period_end DESC NULLS LAST
   LIMIT least(greatest(k,1), 200);
$function$;

DROP FUNCTION IF EXISTS public.brain_search(text, integer, integer, halfvec, text[], text[], date, date, jsonb);
