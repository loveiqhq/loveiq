-- The embedding queue, as an index of exactly the rows that are in it.
--
-- `embedMissing` drains the chunks with no embedding NEWEST WRITTEN FIRST
-- (`order=updated_at.desc,id.desc`). It used `id.desc`, which serves rows INSERTED
-- fresh but not the totals that are UPDATED in place every fifteen minutes (all time,
-- this month, today): they keep their old id and waited behind any backlog. Measured
-- 2026-09-27, after 70 evidence cards were rebuilt: "alltime" and "monthly:2026-09"
-- sat unembedded behind them and four funnel questions failed the battery.
--
-- No existing index serves `WHERE embedding IS NULL ORDER BY updated_at DESC`: the only
-- updated_at index leads with `source`. A partial index holds only the unembedded rows
-- (a few dozen at a time, against ~25,000), so it is tiny and the queue read stays an
-- index scan however large the table grows.
--
-- CONCURRENTLY, so writes to brain_chunk are never blocked while it builds. It cannot run
-- inside a transaction; apply it as a single statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_brain_chunk_unembedded
  ON public.brain_chunk (updated_at DESC, id DESC)
  WHERE embedding IS NULL;
