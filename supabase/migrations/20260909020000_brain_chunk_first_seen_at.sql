-- When the brain LEARNED something, as distinct from when the thing happened.
--
-- Two dates existed and neither answers "what is new". `period_end` is the date a record
-- DESCRIBES -- an August meeting is dated August however long ago it was indexed.
-- `updated_at` is the date a row was last WRITTEN, which conflates three different
-- events: newly discovered, re-written because the source changed, and re-written because
-- a batch re-ingest touched it. Measured 2026-09-09, one day held 5,525 rows across three
-- sources; that is a re-ingest, not 5,525 new facts. A "what changed since Friday" built
-- on it would confidently report a batch job as news.
--
-- NO INGESTER CHANGE IS NEEDED, and that is why this is a column rather than a table.
-- Every writer upserts with `resolution=merge-duplicates`, which builds its SET list from
-- the columns in the payload -- so a column no payload mentions keeps its existing value
-- on conflict and takes the default on insert. Verified against PostgREST, not assumed.
--
-- BACKFILLED FROM `updated_at`, WHICH IS AN ESTIMATE AND IS WRONG FOR OLDER ROWS: a
-- document ingested in June and re-written by the September sweep will claim it was first
-- seen in September. Nothing better exists retroactively. It self-corrects -- every row
-- written from here on carries a true first-seen -- and the tools that read it say so
-- rather than presenting a backfilled guess as a fact.

-- `now()` is STABLE rather than volatile, so Postgres stores this as a fast default and
-- adding the column does not rewrite the table. The UPDATE below does touch every row;
-- at 24k rows that is milliseconds, and it is worth knowing before repeating this shape
-- on a table that has grown.
ALTER TABLE public.brain_chunk
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now();

UPDATE public.brain_chunk SET first_seen_at = updated_at WHERE first_seen_at > updated_at;

-- Supports "what has the brain learned since X", newest first, which is the only way
-- this column is ever read.
--
-- CONCURRENTLY per the house rule and per the sibling index on this same table
-- (20260830100000_brain_search_semantic.sql). `brain_chunk` is read by every question
-- anyone asks, so an ACCESS EXCLUSIVE lock here is a short outage of the whole brain
-- rather than a slow statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS brain_chunk_first_seen_at_idx
  ON public.brain_chunk (first_seen_at DESC);

COMMENT ON COLUMN public.brain_chunk.first_seen_at IS
  'When this record first entered the corpus. Set once on insert and never updated, unlike updated_at which every re-ingest rewrites. Rows predating 2026-09-09 are backfilled from updated_at and are therefore an upper bound, not a fact.';
