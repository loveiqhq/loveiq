-- Recency, and a stage-1 cut wide enough to deliver the limit that was asked for.
--
-- WHY THIS EXISTS. `brain_search` had no recency term at all. `period_end` appeared
-- only as an ORDER BY tie-break on a REAL score, so it fired on exact float equality
-- and never engaged. The brain therefore could not tell a decision made two days ago
-- from a commit made in March, which is the single thing it most needs to do: the
-- point of a company brain is to say "that was already decided, this way, last week".
--
-- MEASURED, WITH REAL QUERY EMBEDDINGS. Rank of the correct answer, six probes, the
-- live corpus, the vector arm active exactly as production runs it:
--
--     probe                       w=0   0.3   0.6   0.9   1.5   2.5
--     purge          (doc)          1     1     1     1     1     1
--     coupon         (doc)          2     1     1     1     1     1
--     landing        (doc)          3     2     1     1     1     1
--     pivot   (22 Aug decision)     2     2     2     2     2     3
--     revenue    (analytics)        6     5     4     4     4     3
--     chapters (recent meeting)     -     -    10    10     9     6
--
-- 0.6 is the knee. Below it the doc probes have not converged; above it nothing
-- improves until 2.5, where `pivot` starts DEGRADING -- recency begins outweighing
-- relevance, which is the failure mode this term must not have.
--
-- Worth recording because it is counter-intuitive: the timeless documentation
-- lookups get BETTER, not worse. A policy doc had been losing to five-month-old
-- commits, and `coalesce(period_end, CURRENT_DATE)` gives it the same standing as
-- anything else current. An earlier draft that scored NULL as 0 destroyed all three.
--
-- THE STAGE-1 CUT GOES 150 -> 400, and the two knobs are not substitutes. The cut
-- happens on a score that EXCLUDES the body term, out of ~3,300 lexical candidates
-- for a typical question, and then dedup collapses what survives to far fewer
-- documents -- which is why asking for 15 sources returned 9. Measured across the
-- six probes at limit 15: 88 of 90 rows deliverable at 150, 90 of 90 at 400.
-- Stage 1 is a top-N heapsort over the same candidate set either way; the extra 250
-- rows are primary-key lookups on pages already in shared buffers.
--
-- The signature is UNCHANGED, so this is a true replacement and not an overload.
-- That distinction took production search down once (see
-- 20260830100000_brain_search_semantic.sql:110-123) and is worth restating: adding
-- a parameter here, even with a DEFAULT, would leave the deployed app's four-argument
-- call ambiguous and unresolvable.

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
            -- a vague question. 0.25 is measured, not chosen: see the header.
            - CASE WHEN c.source = 'gmail' AND c.meta->>'bulk' = 'true'
                   THEN 0.25 ELSE 0 END
            -- RECENCY. `period_end` was only ever an ORDER BY tie-break on a REAL,
            -- so it fired on exact float equality and never engaged at all -- a
            -- point periods.ts:17-18 already states in prose.
            --
            -- Exponential, not linear: what has to be true is that "this week"
            -- clearly beats "three months ago" and that everything past a quarter
            -- is flat. Same shape as the embedding term above, and for the same
            -- reason -- measure where the signal still discriminates.
            --
            -- coalesce(period_end, CURRENT_DATE) IS LOAD-BEARING. The 487 `doc`
            -- chunks are the only rows with a NULL period_end, and they are the
            -- repo's own markdown, rewritten on every push. They are CURRENT by
            -- construction, not undated because they are old. Scoring NULL as 0
            -- was measured and it is a doc-killer: "why is the data retention
            -- purge turned off" and "what does STRIPE_COUPON_100 do" both lose
            -- their answer to a five-month-old email.
            --
            -- greatest(...,0) clamps the handful of future-dated calendar chunks,
            -- which would otherwise score exp(+age) and take every slot.
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
             ORDER BY s.score DESC) AS rn_in_doc
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
