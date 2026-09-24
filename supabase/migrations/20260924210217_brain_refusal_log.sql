-- Documents an ingester READ and deliberately did not index, with the version it read.
--
-- WHY. A gmail thread that `threadToRows` refuses (a notification stub, a job application,
-- a legal instrument) stores nothing in brain_chunk, so the next run had no historyId to
-- compare the listing with and fetched it again: about a hundred threads every hourly run,
-- each a full thread fetch plus its attachments, spent re-making a decision already made.
-- This remembers the decision and the version it was made at, so an unchanged thread costs
-- one listing entry like any indexed one, and a thread that changes (a new message moves
-- its historyId) or a change to the rules (a builder bump) gets it read again.
--
-- NOT A CHUNK, for the reason brain_mine_log gives: anything in brain_chunk is searchable,
-- and a log of what was refused has no retrieval value. Ids and a version only, never
-- content, and nothing reads this to delete anything.

CREATE TABLE IF NOT EXISTS public.brain_refusal_log (
  source      text NOT NULL,
  -- e.g. `thread:19b6e580f090ce20`
  source_id   text NOT NULL,
  -- What the refusal was made against, e.g. `9:4211978` (builder version : historyId).
  version     text NOT NULL,
  refused_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, source_id)
);

COMMENT ON TABLE public.brain_refusal_log IS
  'Documents an ingester read and deliberately did not index, with the version refused, so '
  'an unchanged one is not fetched again every run. Bookkeeping only: ids, never content.';

ALTER TABLE public.brain_refusal_log ENABLE ROW LEVEL SECURITY;
-- Service role only, like every other operational table here. No policy is created, so
-- anon and authenticated reach nothing.
