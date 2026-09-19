-- Two defects in `brain_count`, both found by measuring production rather than reading
-- the code, and both of the same kind: a confident number that is not the number asked for.
--
-- 1. IT COUNTED CHUNKS AND CALLED THEM RECORDS. A long document is stored as many rows --
--    the largest call note in the corpus is 311 of them. So "how many call notes do we
--    have" answered 10,516 when the true answer is 696, overstating by fifteen times, and
--    "how much of what we hold is email" compared a 15x-inflated Drive against a 2.2x
--    -inflated Gmail. Both figures are now returned: `docs` is what a "how many" question
--    means, `n` is how much text sits behind it.
--
--    FIRST CHUNK = `part IS NULL OR part = '1'`, because TWO conventions exist in this
--    corpus and the first attempt at this measured only one of them. Most sources omit
--    `part` on the opening chunk; repository documentation sets `part = 1`. Counting only
--    NULLs reports zero documents for all 493 repo chunks. (An earlier attempt derived
--    documents by stripping a numeric suffix from `source_id` instead, and silently
--    collapsed every date-suffixed id -- every GA4 month into one "document" -- which is
--    how a wrong fix nearly shipped on the strength of a wrong measurement.)
--
-- 2. `learned_since` had no way in. `since`/`until` filter `period_end`, the date a record
--    DESCRIBES, so "what is new this week" was unaskable: an August meeting indexed
--    yesterday is August to them. `first_seen_at` answers it.
--
--    HONESTY NOTE, which the tool repeats to the caller: 23,667 of 23,990 rows carry a
--    first_seen_at backfilled from `updated_at`, so today a window reaching back before
--    2026-09-09 counts rows that were merely re-written by a sweep as newly learned. This
--    self-corrects as rows are rewritten with a true value; until then the tool says so
--    rather than presenting the number bare.
--
-- The return type gains columns, so the function must be DROPPED first: CREATE OR REPLACE
-- cannot change a return type, and a DEFAULT argument added to the old signature would
-- leave the old function in place as an overload rather than replacing it.

DROP FUNCTION IF EXISTS public.brain_count(text, text, text[], text[], date, date, jsonb, integer);
DROP FUNCTION IF EXISTS public.brain_count(text, text, text[], text[], date, date, jsonb, integer, timestamptz);

CREATE FUNCTION public.brain_count(
  group_by text DEFAULT NULL::text,
  q text DEFAULT NULL::text,
  sources text[] DEFAULT NULL::text[],
  exclude_sources text[] DEFAULT NULL::text[],
  since date DEFAULT NULL::date,
  until date DEFAULT NULL::date,
  meta_filter jsonb DEFAULT NULL::jsonb,
  bucket_limit integer DEFAULT 50,
  learned_since timestamptz DEFAULT NULL::timestamptz
)
 RETURNS TABLE(bucket text, n bigint, docs bigint, total bigint, total_docs bigint)
 LANGUAGE sql
 STABLE
AS $function$
  WITH matched AS (
    SELECT c.id, c.source, c.period_end, c.meta,
           -- Both conventions. Omitting either undercounts a whole source.
           (c.meta->>'part' IS NULL OR c.meta->>'part' = '1') AS is_first
      FROM public.brain_chunk c
     WHERE (q               IS NULL OR c.fts @@ plainto_tsquery('english', left(q, 1000)))
       AND (sources         IS NULL OR c.source = ANY(sources))
       AND (exclude_sources IS NULL OR NOT (c.source = ANY(exclude_sources)))
       AND (since           IS NULL OR c.period_end >= since)
       AND (until           IS NULL OR c.period_end <= until)
       AND (meta_filter     IS NULL OR c.meta @> meta_filter)
       AND (learned_since   IS NULL OR c.first_seen_at >= learned_since)
  ),
  labelled AS (
    SELECT m.id, m.is_first,
           CASE WHEN group_by IS NULL      THEN '(all)'
                WHEN group_by = 'source'   THEN m.source
                ELSE to_char(m.period_end, 'YYYY-MM')
           END AS b
      FROM matched m
     WHERE group_by IS NULL OR group_by IN ('source', 'month')
    UNION ALL
    -- Any metadata key. An array value expands, so a chunk naming three people counts
    -- under each of them -- which is what "how many chunks per person" has to mean.
    SELECT m.id, m.is_first,
           CASE WHEN jsonb_typeof(m.meta -> group_by) = 'array' THEN v.val
                ELSE m.meta ->> group_by END
      FROM matched m
      LEFT JOIN LATERAL jsonb_array_elements_text(
                 CASE WHEN jsonb_typeof(m.meta -> group_by) = 'array'
                      THEN m.meta -> group_by END
               ) AS v(val) ON true
     WHERE group_by IS NOT NULL AND group_by NOT IN ('source', 'month')
  )
  SELECT coalesce(l.b, '(none)')                                   AS bucket,
         count(*)                                                  AS n,
         count(*) FILTER (WHERE l.is_first)                        AS docs,
         (SELECT count(*) FROM matched)                            AS total,
         (SELECT count(*) FROM matched WHERE is_first)             AS total_docs
    FROM labelled l
   GROUP BY 1
   ORDER BY 3 DESC, 2 DESC, 1
   LIMIT greatest(1, least(200, coalesce(bucket_limit, 50)));
$function$;

COMMENT ON FUNCTION public.brain_count IS
  'Counts brain_chunk under brain_search''s filters plus learned_since (first_seen_at), grouped by source, month, or any meta key. n counts stored chunks, docs counts documents (first chunk only); a long document is many chunks. Bucket sums may exceed the totals when grouping by an array field.';
