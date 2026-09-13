-- Which meetings the decision miner has already read.
--
-- The miner turns meeting notes into decision records. It needs to know which meetings it
-- has already read, INCLUDING the ones that settled nothing -- otherwise every quiet
-- meeting is re-read every night forever, on a rate-limited free tier.
--
-- NOT A CHUNK, and this was the first design. The plan was a tombstone row in
-- `brain_chunk` under a source of its own, on the reasoning that a new source is
-- invisible to everything already written. MEASURED, it is not: `list_sources` was taught
-- to ignore it, but `brain_search` searches every source by default and returned the
-- tombstone happily. 121 rows titled "Scanned for DECISIONS: ..." sitting in the corpus
-- is bookkeeping that surfaces on exactly the word the decision record exists to answer.
--
-- The "keep it in brain_chunk" argument is about DECISIONS -- a mined decision must
-- compete with a recorded one in a single ranking, or the pressure-tester sees half the
-- history. It does not extend to a job's own log, which has no retrieval value at all and
-- every reason not to be retrievable. `cron_run` and `slack_alert_sent` are the precedent.

CREATE TABLE IF NOT EXISTS public.brain_mine_log (
  -- The meeting document, e.g. `drive/doc:1AbC...`. One row per document, updated in
  -- place, so a re-mine after an edit replaces rather than accumulates.
  source_id   text PRIMARY KEY,
  -- Bumped when the prompt or the extraction rules change, which is what makes a
  -- re-mine happen at all.
  miner_v     integer NOT NULL,
  mined_at    timestamptz NOT NULL DEFAULT now(),
  -- How many decisions were kept. Zero is the common and correct case, and it is the
  -- number that says whether the gates are still doing anything: a miner that keeps
  -- something from every meeting has stopped filtering.
  found       integer NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.brain_mine_log IS
  'One row per meeting document the decision miner has read. Bookkeeping only — kept out '
  'of brain_chunk because anything in brain_chunk is searchable, and a log that answers '
  'the word "decisions" would pollute the records it exists to produce.';

ALTER TABLE public.brain_mine_log ENABLE ROW LEVEL SECURITY;
-- Service role only, like every other operational table here. No policy is created, so
-- anon and authenticated reach nothing.
