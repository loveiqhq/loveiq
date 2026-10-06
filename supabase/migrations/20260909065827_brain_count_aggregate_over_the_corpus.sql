-- "How many" has never been answerable.
--
-- `brain_search` returns at most 30 ranked chunks. Every question of the shape "how many
-- meetings did we have in August", "how much of what we hold is email", "who has written
-- the most", "how many decisions since June" therefore had two possible answers: a guess,
-- or a number read off a capped result list, which is a guess wearing a citation.
--
-- PostgREST aggregates are disabled on this project (PGRST123), so `select=source,count()`
-- is a 400. The alternative to this function was a fan-out of ~20 `count=exact` HEAD
-- requests, one per bucket, which is 20 round trips to do what one GROUP BY does and
-- cannot group by a value that is not known in advance -- which is most of them.
--
-- THE FILTERS ARE `brain_search`'s, CLAUSE FOR CLAUSE. A count that filters differently
-- from the search it describes is worse than no count: it disagrees with the list sitting
-- next to it and there is no way to tell which one is lying.
--
-- THE TEXT FILTER IS THE ONE DELIBERATE DIFFERENCE, and it is the difference between
-- ranking and counting. `brain_search` ORs its lexemes -- it casts a wide recall net and
-- lets scoring sort it out. A count has no scoring to hide behind, so "how many mention
-- report pricing" under OR would count every chunk mentioning "report" and report a
-- number that is simply false. `plainto_tsquery` ANDs, which is what the question means.
--
-- `total` is a count of matching CHUNKS, never the sum of the buckets. Grouping by an
-- array field (`people`) puts a chunk with three names into three buckets on purpose, so
-- the sum exceeds the corpus and only the distinct count answers "how many match at all".

CREATE OR REPLACE FUNCTION public.brain_count(
  group_by text DEFAULT NULL::text,
  q text DEFAULT NULL::text,
  sources text[] DEFAULT NULL::text[],
  exclude_sources text[] DEFAULT NULL::text[],
  since date DEFAULT NULL::date,
  until date DEFAULT NULL::date,
  meta_filter jsonb DEFAULT NULL::jsonb,
  bucket_limit integer DEFAULT 50
)
 RETURNS TABLE(bucket text, n bigint, total bigint)
 LANGUAGE sql
 STABLE
AS $function$
  WITH matched AS (
    SELECT c.id, c.source, c.period_end, c.meta
      FROM public.brain_chunk c
     WHERE (q               IS NULL OR c.fts @@ plainto_tsquery('english', left(q, 1000)))
       AND (sources         IS NULL OR c.source = ANY(sources))
       AND (exclude_sources IS NULL OR NOT (c.source = ANY(exclude_sources)))
       AND (since           IS NULL OR c.period_end >= since)
       AND (until           IS NULL OR c.period_end <= until)
       AND (meta_filter     IS NULL OR c.meta @> meta_filter)
  ),
  labelled AS (
    -- The two dimensions that are columns rather than metadata, plus the ungrouped
    -- total as a single bucket so one code path answers "how many" and "how many each".
    SELECT m.id,
           CASE WHEN group_by IS NULL      THEN '(all)'
                WHEN group_by = 'source'   THEN m.source
                ELSE to_char(m.period_end, 'YYYY-MM')
           END AS b
      FROM matched m
     WHERE group_by IS NULL OR group_by IN ('source', 'month')
    UNION ALL
    -- Any metadata key. An array value expands, so a chunk naming three people counts
    -- under each of them -- which is what "how many chunks per person" has to mean.
    SELECT m.id,
           CASE WHEN jsonb_typeof(m.meta -> group_by) = 'array' THEN v.val
                ELSE m.meta ->> group_by END
      FROM matched m
      LEFT JOIN LATERAL jsonb_array_elements_text(
                 CASE WHEN jsonb_typeof(m.meta -> group_by) = 'array'
                      THEN m.meta -> group_by END
               ) AS v(val) ON true
     WHERE group_by IS NOT NULL AND group_by NOT IN ('source', 'month')
  )
  SELECT coalesce(l.b, '(none)') AS bucket,
         count(*) AS n,
         (SELECT count(*) FROM matched) AS total
    FROM labelled l
   GROUP BY 1
   ORDER BY 2 DESC, 1
   LIMIT greatest(1, least(200, coalesce(bucket_limit, 50)));
$function$;

COMMENT ON FUNCTION public.brain_count IS
  'Counts brain_chunk rows under brain_search''s filters, optionally grouped by source, month, or any meta key. total is distinct matching chunks; bucket sums may exceed it when grouping by an array field.';
