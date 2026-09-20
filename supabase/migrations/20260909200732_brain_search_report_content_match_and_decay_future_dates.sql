-- Two changes, both about the same failure: FRESHNESS STANDING IN FOR RELEVANCE.
--
-- Measured 2026-09-09. "which of our customer personas uses Headspace or Whoop" --
-- a question nothing in the corpus answers -- returned eight confident hits scoring
-- 2.309 down to 2.097. Every one of them was either dated this week or carried no
-- date at all. The content terms contributed almost nothing; the ranking was
-- recency plus a constant, and the reader had no way to tell.
--
-- 1. `content_score` IS REPORTED, RANKING IS NOT CHANGED. The caller can now see how
--    much of a hit's score came from actually matching the question rather than from
--    being recent. Nothing here reorders anything -- a new output column only -- so
--    the change cannot regress retrieval. The floor and the wording live in the tool,
--    where they can be tuned without a migration.
--
--    This is what a relevance floor needs and never had. `search_company_context`
--    already carried prose warning the model that gibberish returns confident
--    sources; a number the caller can read is better than a warning it must remember.
--
-- 2. A FUTURE DATE IS NOT FRESH. The unanchored branch clamped negative distances to
--    zero, so a calendar event dated 2027-01-07 scored as maximally recent -- and
--    "what happened in the last team meeting" answered with a meeting four months
--    away, while the real notes from this week never appeared. 100 of 380 calendar
--    chunks are future-dated, so this was not an edge case.
--
--    `abs()` is exactly what the anchored branch already does, for exactly the reason
--    written there: distance either side is what a date means. The old comment argued
--    a future row "counts as maximally recent, which is right when the anchor is
--    today" -- that reasoning holds for a meeting tomorrow and fails for one next
--    year, and the decay curve already draws that distinction correctly.
--
--    Symmetry keeps "when is our next sync" working: the nearest occurrence either
--    side of today wins, which is the right answer to both that and "how did the last
--    sync go".

DROP FUNCTION IF EXISTS public.brain_search(text, integer, integer, halfvec, text[], text[], date, date, jsonb, date, text);

CREATE FUNCTION public.brain_search(
  query_text text,
  k integer DEFAULT 30,
  per_source integer DEFAULT 0,
  query_embedding halfvec DEFAULT NULL::halfvec,
  sources text[] DEFAULT NULL::text[],
  exclude_sources text[] DEFAULT NULL::text[],
  since date DEFAULT NULL::date,
  until date DEFAULT NULL::date,
  meta_filter jsonb DEFAULT NULL::jsonb,
  anchor_date date DEFAULT NULL::date,
  anchor_grain text DEFAULT NULL::text
)
RETURNS TABLE(
  id bigint, source text, source_id text, title text, url text, body text,
  meta jsonb, updated_at timestamp with time zone, period_end date,
  score real,
  -- Everything in `score` that came from MATCHING: full text, title trigrams,
  -- semantic distance, body trigrams. Excludes recency and both penalties.
  content_score real
)
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
  --
  -- FILTERED HERE, not only downstream: this is a top-120 over the whole corpus, so
  -- filtering after it would leave a narrow request with almost no semantic
  -- candidates.
  vec AS (
    SELECT c.id FROM public.brain_chunk c
     WHERE query_embedding IS NOT NULL AND c.embedding IS NOT NULL
       AND (sources         IS NULL OR c.source = ANY(sources))
       AND (exclude_sources IS NULL OR NOT (c.source = ANY(exclude_sources)))
       AND (since           IS NULL OR c.period_end >= since)
       AND (until           IS NULL OR c.period_end <= until)
       AND (meta_filter     IS NULL OR c.meta @> meta_filter)
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
   SELECT * FROM (
    SELECT c.id,
           -- SPLIT OUT so the caller can see it, summed back into s0 unchanged.
           (coalesce(ts_rank(c.fts, p.tsq), 0) * 4.0
            + word_similarity(q.qt, coalesce(c.title, '')) * 2.0
            -- `gte-small` similarities cluster around 0.7-0.95, so the raw value
            -- shifts every row by roughly the same amount and ranks nothing.
            -- Measuring from a 0.7 floor is what turns it into a discriminating
            -- signal rather than a constant.
            + CASE WHEN query_embedding IS NULL OR c.embedding IS NULL THEN 0
                   ELSE greatest(0, (1 - (c.embedding <=> query_embedding)) - 0.7) * 8.0 END
           )::REAL AS c0,
           (-- DEMOTED, NOT EXCLUDED. Bulk mail stays fully indexed and fully
            -- searchable; it just stops outranking a colleague's actual answer on
            -- a vague question. 0.25 is measured, not chosen. Re-verified 2026-09-06
            -- with the vector arm live: 0 of 8 work questions carry bulk in the
            -- top 5, while newsletter questions still return it at rank 1-2.
            - CASE WHEN c.source = 'gmail' AND c.meta->>'bulk' = 'true'
                   THEN 0.25 ELSE 0 END
            -- FINER THAN THE QUESTION ASKED FOR. A day inside the month someone named
            -- is not an answer to a question about the month, and it was winning:
            -- measured across nine months, the monthly total led only 3 times. "how
            -- many sessions in june 2026" returned the week of 22-28 June -- 90
            -- sessions against the month's 3,969. Right month, wrong number, same
            -- confidence.
            --
            -- 0.5 is sized from the gaps it has to close, not chosen: the largest was
            -- 0.313 (May, whose name is an English stopword so the month word
            -- contributes nothing to ts_rank), and most were under 0.16. February's was
            -- 0.001, which is noise deciding the answer.
            --
            -- A PENALTY ON THE FINER ROW, never a bonus on the matching one. A bonus
            -- would lift analytics above sources that carry no grain at all, and that
            -- is exactly how the query-hint version of this fix pushed the June pricing
            -- decision out of the top 8. Only 726 chunks in the corpus carry a grain --
            -- the analytics, ga4 and gsc series -- so this reorders within those three
            -- and cannot move anything else.
            --
            -- Only the month case. A day-grain anchor is left alone: nothing was
            -- measured wrong there, and a monthly total sitting below the day someone
            -- asked about costs nothing.
            - CASE WHEN anchor_grain = 'month' AND c.meta->>'grain' IN ('day', 'week')
                   THEN 0.5 ELSE 0 END
            -- RECENCY, weight 0.6, measured -- and RE-AIMED, not removed, when the
            -- caller names a period. The term is a prior about what is wanted when the
            -- question does not say which period it means; when it does say, the same
            -- decay is measured from THAT period instead of from today. Unanchored
            -- arithmetic is unchanged, so every question naming no period is untouched.
            --
            -- coalesce(period_end, <the anchor>) is load-bearing: `doc` chunks are the
            -- repo's own markdown, current by construction, and scoring their NULL as
            -- maximally old was measured to destroy every documentation lookup -- so
            -- they sit AT whatever the anchor is.
            --
            -- ABS ON BOTH BRANCHES. Distance either side of the reference date is what
            -- a date means. The unanchored branch used to clamp a future date to zero
            -- distance, which scored a meeting in 2027 as maximally fresh and let it
            -- answer "what happened in the last team meeting".
            + 0.6 * exp(-abs(CASE
                           WHEN anchor_date IS NULL
                             THEN CURRENT_DATE - coalesce(c.period_end, CURRENT_DATE)
                           ELSE anchor_date - coalesce(c.period_end, anchor_date)
                         END)::real / 45.0)
           )::REAL AS adj
      FROM public.brain_chunk c
      JOIN hits h ON h.id = c.id
      CROSS JOIN parsed p CROSS JOIN q
     WHERE (sources         IS NULL OR c.source = ANY(sources))
       AND (exclude_sources IS NULL OR NOT (c.source = ANY(exclude_sources)))
       AND (since           IS NULL OR c.period_end >= since)
       AND (until           IS NULL OR c.period_end <= until)
       AND (meta_filter     IS NULL OR c.meta @> meta_filter)
   ) x ORDER BY (x.c0 + x.adj) DESC LIMIT 400
  ),
  -- STAGE 2 — the body term, for only the 400 that could still win.
  scored AS (
    SELECT c.id, c.source, c.source_id, c.title, c.url, c.body, c.meta, c.updated_at, c.period_end,
           (ch.c0 + ch.adj + word_similarity(q.qt, c.body))::REAL AS score,
           (ch.c0 + word_similarity(q.qt, c.body))::REAL           AS content_score
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
  SELECT r.id, r.source, r.source_id, r.title, r.url, r.body, r.meta, r.updated_at, r.period_end,
         r.score, r.content_score
    FROM ranked r WHERE per_source <= 0 OR r.rn_in_bucket <= per_source
   ORDER BY r.score DESC, r.period_end DESC NULLS LAST
   LIMIT least(greatest(k,1), 200);
$function$;
