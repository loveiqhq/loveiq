-- The company-brain corpus: one searchable chunk per doc section, commit, Jira
-- issue or DB row, plus the log of what people asked it.
--
-- WHY A TABLE AND NOT A VECTOR STORE. The whole indexable corpus is ~5-15 MB
-- (107 LoveIQ markdown docs, 1,476 commit messages, 1,034 Jira issues), which is
-- roughly 15k chunks. At that size Postgres full-text search plus pg_trgm is not
-- a compromise, it is the correct tool: both are already installed, neither needs
-- an embedding pipeline, and there is no model-version coupling to maintain. If
-- recall turns out to be the limit, `embedding halfvec(384)` and an HNSW index
-- drop onto this same table without reshaping anything -- which is why `meta` is
-- jsonb and the natural key is (source, source_id).
--
-- WHY (source, source_id) IS UNIQUE. Every ingester is re-run from scratch on a
-- schedule (nightly cron) or on every push (GitHub Action). Upsert-on-conflict
-- against a stable natural key -- doc path + heading slug, commit sha, issue key
-- -- makes re-ingestion idempotent, so a partial run is safe to simply repeat.
-- Without it the corpus would silently double on every run.
--
-- WHY `fts` IS GENERATED. Keeping the tsvector in the row, maintained by
-- Postgres, means an ingester cannot forget to refresh it after an edit. A
-- trigger or an app-side update would be one more thing to get wrong on the
-- path that matters least (bulk insert) and hurt most (stale search).
--
-- brain_query DOES TWO JOBS, which is why it exists at this stage rather than
-- later. It answers "what does the team actually ask this thing" -- the only
-- signal for what to ingest next -- and its UNIQUE slack_event_id is the
-- idempotency key for the Slack events route. Slack retries an un-acked event
-- aggressively, so without a claim here one question gets answered three times.
--
-- NO PII BEYOND WHAT SLACK ALREADY HAS. brain_query stores the Slack user id,
-- not a name or email. brain_chunk holds company documents, not user records.

BEGIN;

CREATE TABLE IF NOT EXISTS public.brain_chunk (
  id         BIGSERIAL PRIMARY KEY,
  -- 'doc' | 'commit' | 'jira' | 'db'. Kept as free text rather than an enum so
  -- adding an ingester is a code change, not a migration.
  source     TEXT NOT NULL,
  -- Stable natural key within the source. Doc: "<path>#<heading-slug>".
  -- Commit: the sha. Jira: the issue key. DB: "<table>:<pk>".
  source_id  TEXT NOT NULL,
  title      TEXT,
  -- Deep link back to the real thing, so every answer can be checked at source.
  -- Nullable: DB rows have no canonical URL.
  url        TEXT,
  body       TEXT NOT NULL,
  meta       JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fts        TSVECTOR GENERATED ALWAYS AS (
               to_tsvector('english', coalesce(title, '') || ' ' || body)
             ) STORED,
  CONSTRAINT brain_chunk_source_key UNIQUE (source, source_id)
);

COMMENT ON TABLE public.brain_chunk IS
  'Company-brain corpus. One row per retrievable chunk. Re-ingested idempotently on (source, source_id).';
COMMENT ON COLUMN public.brain_chunk.source_id IS
  'Stable natural key within the source, so re-ingestion upserts instead of duplicating.';
COMMENT ON COLUMN public.brain_chunk.url IS
  'Deep link to the source of truth. Answers cite this so a reader can verify a claim.';
COMMENT ON COLUMN public.brain_chunk.fts IS
  'Generated tsvector. Maintained by Postgres so an ingester cannot leave search stale.';

CREATE TABLE IF NOT EXISTS public.brain_query (
  id               BIGSERIAL PRIMARY KEY,
  -- Slack's event id. UNIQUE makes this the dedupe claim for the events route.
  slack_event_id   TEXT,
  slack_user_id    TEXT,
  slack_channel_id TEXT,
  question         TEXT NOT NULL,
  -- Populated after the answer is posted. Null means in-flight or failed, which
  -- is what makes a stuck question visible.
  answered_at      TIMESTAMPTZ,
  source_count     INTEGER,
  latency_ms       INTEGER,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT brain_query_slack_event_key UNIQUE (slack_event_id)
);

COMMENT ON TABLE public.brain_query IS
  'What the team asked the brain. Doubles as the Slack event_id dedupe claim so a retried event is not answered twice.';

-- Service-role only, matching every other operational table here.
ALTER TABLE public.brain_chunk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brain_query ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'brain_chunk'
       AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY service_role_only ON public.brain_chunk FOR ALL USING (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'brain_query'
       AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY service_role_only ON public.brain_query FOR ALL USING (false);
  END IF;
END $$;

-- Hybrid retrieval: full-text as the indexed workhorse, trigram word-similarity
-- as the arm that survives typos and partial words.
--
-- `per_source` EXISTS BECAUSE DIVERSITY MUST HAPPEN BEFORE TRUNCATION. Sources
-- are wildly uneven in size and in how templated their titles are, so one can
-- swamp the candidate set entirely. Measured: "how much did we spend on google
-- ads in august and what did we earn" put 30 of the top 32 in `ga4` -- every GA4
-- chunk carries "Google Analytics" in its title and they scored 0.92-1.03 as a
-- block -- so the row holding revenue was never a candidate, and the model
-- answered only the spend half. Capping per source with a window function fixes
-- it here; no amount of re-ranking downstream can, because the row never arrived.
--
-- DELIBERATELY NOT `SECURITY DEFINER`. Every other analytics RPC here is, and
-- 20260825140000 had to sweep pg_proc to revoke 20 of them that were anon
-- callable by default. This reads a service-role-only table and has exactly one
-- server-side caller, so leaving it security-invoker keeps RLS in force and
-- leaves nothing to lock down later.
--
-- THE TSQUERY IS OR-ED, NOT AND-ED, AND THAT IS THE WHOLE TRICK. Both
-- `plainto_tsquery` and `websearch_to_tsquery` combine terms with `&`, which
-- requires a document to contain EVERY word of the question. Measured against
-- this corpus: "why were the logos broken in our emails" parses to
-- `logo & broken & email` and returns ZERO rows -- the commit it should find says
-- "failed", not "broken". Re-joining the lexemes with `|` returns it correctly,
-- and `ts_rank` still ranks documents matching more terms above those matching
-- one. Questions arrive as prose from Slack, so AND semantics is simply the wrong
-- model.
--
-- `coalesce(ts_rank(...), 0)` IS LOAD-BEARING. A question made entirely of
-- stopwords yields an empty tsvector, so `string_agg` is NULL, so the tsquery is
-- NULL, so `ts_rank` is NULL -- and NULL poisons the whole arithmetic score,
-- which then sorts NULLS FIRST under `ORDER BY score DESC` and puts the worst
-- rows on top. Without the coalesce, "what about that then" returned every row
-- in the table, unranked.
--
-- THE TRIGRAM WORD LIST USES RAW SPELLING BUT FILTERS THROUGH THE DICTIONARY.
-- These two requirements pull apart, and each naive choice breaks one:
--   * Raw split alone leaks stopwords -- "that" scores 0.6+ against any document
--     containing "that", so a stopword question matched everything.
--   * Stemmed lexemes fix that but destroy the typo case: stemming truncates
--     "colapsed" (word_similarity 0.727 against the body, over the 0.6 threshold)
--     down to "colaps" (0.556, under it), so the typo stopped matching.
-- Keeping the raw word and using `to_tsvector(w) <> ''` purely as a stopword
-- test satisfies both: full spelling for the trigram comparison, dictionary for
-- the filter.
--
-- ponytail: the per-word EXISTS arm is a sequential scan in the worst case
-- (unmatched words cannot use the GIN index inside EXISTS). Fine at ~15k rows;
-- if the corpus grows past a few hundred thousand chunks, hoist the word list
-- into a lateral join or add the embedding column and let vector search carry
-- fuzzy recall instead.
CREATE OR REPLACE FUNCTION public.brain_search(
  query_text  TEXT,
  k           INT DEFAULT 30,
  -- Max candidates from any ONE source before the global ordering. 0 disables it.
  -- This is load-bearing, not a nicety: see the note above.
  per_source  INT DEFAULT 0
)
RETURNS TABLE (
  id         BIGINT,
  source     TEXT,
  source_id  TEXT,
  title      TEXT,
  url        TEXT,
  body       TEXT,
  meta       JSONB,
  updated_at TIMESTAMPTZ,
  score      REAL
)
LANGUAGE sql
STABLE
AS $$
  WITH parsed AS (
    SELECT (
      SELECT string_agg(lexeme, ' | ')
        FROM unnest(to_tsvector('english', query_text))
    )::tsquery AS tsq
  ),
  words AS (
    SELECT DISTINCT w
      FROM regexp_split_to_table(lower(query_text), '\W+') AS w
     WHERE length(w) > 3
       AND to_tsvector('english', w) <> ''::tsvector
  ),
  scored AS (
    SELECT c.id, c.source, c.source_id, c.title, c.url, c.body, c.meta, c.updated_at,
           (
             -- Weights: a full-text hit is the strong signal; a title match beats
             -- a body match because chunk titles are headings, commit subjects and
             -- issue summaries -- already human-written summaries.
             coalesce(ts_rank(c.fts, p.tsq), 0) * 4.0
             + word_similarity(query_text, coalesce(c.title, '')) * 2.0
             + word_similarity(query_text, c.body)
           )::REAL AS score
      FROM public.brain_chunk c
      CROSS JOIN parsed p
     WHERE c.fts @@ p.tsq
        -- `<%` is the indexable word_similarity operator, so the whole-question
        -- arms below use the gin_trgm_ops indexes rather than forcing a scan.
        OR query_text <% coalesce(c.title, '')
        OR query_text <% c.body
        OR EXISTS (SELECT 1 FROM words w
                    WHERE w.w <% coalesce(c.title, '') OR w.w <% c.body)
  ),
  ranked AS (
    SELECT s.*,
           row_number() OVER (PARTITION BY s.source ORDER BY s.score DESC, s.updated_at DESC)
             AS rn_in_source
      FROM scored s
  )
  SELECT r.id, r.source, r.source_id, r.title, r.url, r.body, r.meta, r.updated_at, r.score
    FROM ranked r
   WHERE per_source <= 0 OR r.rn_in_source <= per_source
   ORDER BY r.score DESC, r.updated_at DESC
   LIMIT least(greatest(k, 1), 200);
$$;

COMMENT ON FUNCTION public.brain_search(TEXT, INT, INT) IS
  'Hybrid full-text + trigram retrieval over brain_chunk. Security-invoker by design; service role only.';

REVOKE EXECUTE ON FUNCTION public.brain_search(TEXT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.brain_search(TEXT, INT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_search(TEXT, INT, INT) TO service_role;

COMMIT;

-- Indexes created CONCURRENTLY outside the transaction (Postgres requirement +
-- the pattern our migration lint enforces). Tables are brand new, so the cost
-- is identical to a plain CREATE INDEX.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brain_chunk_fts
  ON public.brain_chunk USING gin (fts);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brain_chunk_title_trgm
  ON public.brain_chunk USING gin (title gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brain_chunk_body_trgm
  ON public.brain_chunk USING gin (body gin_trgm_ops);
-- Lets an ingester sweep or delete one source's rows without scanning the table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brain_chunk_source
  ON public.brain_chunk (source, updated_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brain_query_created_at
  ON public.brain_query (created_at DESC);
