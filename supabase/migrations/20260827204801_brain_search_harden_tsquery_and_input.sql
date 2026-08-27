-- brain_chunk.period_end + a hardened brain_search.
--
-- WHY THIS EXISTS AS A SEPARATE MIGRATION. Both changes were applied to the live
-- database before this file existed, so the file is written to match the version
-- already stamped in `supabase_migrations.schema_migrations`
-- (20260827204801). Everything here is idempotent, so applying it to a database
-- that already has the changes is a no-op, and a fresh replay from files ends up
-- in the same state.
--
-- THREE DEFECTS ARE FIXED HERE, ALL MEASURED RATHER THAN SUSPECTED:
--
-- 1. RECENCY WAS STRUCTURALLY IMPOSSIBLE. The original tie-break was
--    `updated_at DESC`, but that is the INGEST timestamp -- stamped once per run,
--    so `count(distinct updated_at)` was 1 across all 171 analytics chunks. With
--    scores tying 0.002 apart, "the most recent month" was effectively random:
--    "revenue?" answered with May. `period_end` carries the period a chunk
--    DESCRIBES, which is the only thing that can order by recency.
--
-- 2. ANY QUESTION CONTAINING A DOTTED host:port BROKE RETRIEVAL ENTIRELY.
--    `to_tsvector` keeps host tokens intact and in tsquery a ':' begins a weight
--    label, so 'www.loveiq.org:443' raised `42601 syntax error in tsquery`, the
--    RPC failed, and the asker was told "I couldn't find anything about that".
--    quote_literal() makes every lexeme literal.
--
-- 3. AN UNBOUNDED QUESTION WAS A DENIAL-OF-SERVICE VECTOR. Slack accepts 40,000
--    characters. That string became the left operand of `word_similarity()` on
--    every scored row and exploded the per-word arm -- on the same Postgres that
--    serves checkout, the survey and report reads. Capped at the DB boundary so
--    it holds regardless of caller.
--
-- No index is added on `period_end` on purpose: it is a tie-break applied AFTER
-- `ORDER BY score DESC` over roughly 100 already-scored rows, so an index cannot
-- be used for it. Measured plan after this change: every arm `Index Cond`, max
-- 5 loops, ~116 ms.

ALTER TABLE public.brain_chunk ADD COLUMN IF NOT EXISTS period_end DATE;

COMMENT ON COLUMN public.brain_chunk.period_end IS
  'The period this chunk DESCRIBES (not when it was ingested): the day for a day
   grain, the last day covered for a week/month rollup, the commit date for a
   commit, NULL for a doc. Used as the recency tie-break in brain_search.';

-- Backfill for rows written before the column existed. Day grain comes straight
-- out of source_id; week and month take the last day WITH DATA, which is the
-- same aggregation the ingester performs, so a later real ingest writes identical
-- values and the ordering cannot flip.
WITH days AS (
  SELECT id, source, split_part(source_id, ':', 2)::date AS d
    FROM public.brain_chunk
   WHERE meta->>'grain' = 'day' AND source_id LIKE 'daily:%'
),
day_upd AS (
  UPDATE public.brain_chunk c SET period_end = days.d
    FROM days WHERE c.id = days.id AND c.period_end IS DISTINCT FROM days.d
  RETURNING 1
),
rollup AS (
  SELECT c.id, max(days.d) AS last_day
    FROM public.brain_chunk c
    JOIN days
      ON days.source = c.source
     AND CASE c.meta->>'grain'
           WHEN 'week'  THEN to_char(days.d, 'IYYY-"W"IW')
           WHEN 'month' THEN to_char(days.d, 'YYYY-MM')
         END = split_part(c.source_id, ':', 2)
   WHERE c.meta->>'grain' IN ('week', 'month')
   GROUP BY c.id
)
UPDATE public.brain_chunk c SET period_end = rollup.last_day
  FROM rollup WHERE c.id = rollup.id AND c.period_end IS DISTINCT FROM rollup.last_day;

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
  -- UNION ARMS, NOT ONE OR-CHAIN. The original single-predicate form used none of
  -- the table's three indexes: the plan showed `Index Scan using
  -- idx_brain_chunk_source` (for ordering only) with the whole OR-chain as a
  -- Filter, and the per-word arm as a correlated SubPlan running loops=1851 --
  -- re-splitting the query and re-running to_tsvector once per row. 1,423 ms at
  -- only 2,313 rows, scaling linearly.
  --
  -- OPERATOR DIRECTION IS THE WHOLE TRICK: `c.title %> w.w` uses
  -- idx_brain_chunk_title_trgm; the equivalent-looking `w.w <% c.title` does NOT,
  -- because pg_trgm only accelerates it with the indexed column on the left.
  hits AS (
    SELECT c.id FROM public.brain_chunk c, parsed p WHERE c.fts @@ p.tsq
    UNION
    SELECT c.id FROM public.brain_chunk c, q WHERE c.title %> q.qt
    UNION
    SELECT c.id FROM words w JOIN public.brain_chunk c ON c.title %> w.w
  ),
  scored AS (
    SELECT c.id, c.source, c.source_id, c.title, c.url, c.body, c.meta, c.updated_at, c.period_end,
           (
             coalesce(ts_rank(c.fts, p.tsq), 0) * 4.0
             + word_similarity(q.qt, coalesce(c.title, '')) * 2.0
             + word_similarity(q.qt, c.body)
           )::REAL AS score
      FROM public.brain_chunk c
      JOIN hits h ON h.id = c.id
      CROSS JOIN parsed p
      CROSS JOIN q
  ),
  ranked AS (
    -- Per SOURCE AND GRAIN, not per source. Measured: "how much did we spend on
    -- google ads in august and what did we earn" returned 30 of the top 32 from
    -- `ga4` alone, because every GA4 chunk carries "Google Analytics" in its
    -- title, so the revenue row was never a candidate and the model could only
    -- answer half the question.
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

REVOKE EXECUTE ON FUNCTION public.brain_search(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_search(text, integer, integer) TO service_role;
