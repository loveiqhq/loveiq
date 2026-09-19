-- `brain_query` was built Slack-shaped, and the MCP door -- which is now the
-- PRIMARY interface -- records nothing at all. A successful `tools/call` writes no
-- row and logs no line, so the table's own first stated job ("what does the team
-- actually ask this thing") is answered from ONE row in its entire history, from
-- 2026-08-28, from the door almost nobody uses.
--
-- That gap is the reason this is the first change in the company-brain work rather
-- than the last: every ranking, filter and corpus change after it is a claim about
-- retrieval quality, and there is currently no instrument that could confirm or
-- refute one.
--
-- Two properties make this safe to apply to a live table with no backfill:
--
-- * `surface` DEFAULTS to 'slack', so the pre-existing row and every in-flight
--   Slack write are correctly labelled without touching `claimQuestion`.
-- * `slack_event_id` stays UNIQUE and nullable. Postgres does not conflict NULLs,
--   so MCP rows insert freely alongside it and Slack's idempotency claim -- the
--   thing that stops a retried event being answered twice -- is untouched.

ALTER TABLE public.brain_query
  ADD COLUMN IF NOT EXISTS surface   TEXT NOT NULL DEFAULT 'slack',
  ADD COLUMN IF NOT EXISTS tool      TEXT,
  ADD COLUMN IF NOT EXISTS args      JSONB,
  ADD COLUMN IF NOT EXISTS top_score REAL;

COMMENT ON COLUMN public.brain_query.surface IS
  'Which door asked: ''slack'' or ''mcp''. Defaults to slack so every pre-existing row is correctly labelled with no backfill.';
COMMENT ON COLUMN public.brain_query.tool IS
  'MCP tool name. Null on the Slack path, which has one implicit tool.';
COMMENT ON COLUMN public.brain_query.args IS
  'The tool arguments, capped at 2000 characters. Without them a slow or empty call cannot be reproduced: "search_company_context returned nothing" is unfixable without knowing the filters it was given.';
COMMENT ON COLUMN public.brain_query.top_score IS
  'brain_search score of the best hit. The cheapest signal that retrieval is degrading -- twelve hits all scoring 0.2 is a miss dressed as a hit, and source_count alone cannot see the difference.';

-- Queried as "how is the MCP door doing lately", which is a surface filter and a
-- time order. The existing created_at index cannot serve that without a scan.
--
-- CONCURRENTLY per the house rule (scripts/check-migrations.ts, and the same form
-- as idx_brain_chunk_embedding). It was not needed at the moment of writing --
-- brain_query held one row -- but this table is about to become the busiest write
-- path in the brain, and the next person to add an index here should copy a safe
-- example rather than an excused one.
CREATE INDEX CONCURRENTLY IF NOT EXISTS brain_query_surface_created_idx
  ON public.brain_query (surface, created_at DESC);
