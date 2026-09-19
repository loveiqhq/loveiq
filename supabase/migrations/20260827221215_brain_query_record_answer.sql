-- Record what the brain actually SAID, not just that it said something.
--
-- Matches the version already stamped in the ledger (20260827221215); applied
-- live before this file existed. Idempotent.
--
-- WHY. `brain_query` held question, latency, source_count and error — everything
-- except the answer. So when the brain reported May's revenue for a question
-- about August (a real, measured failure: "how are we doing this month" returned
-- monthly:2026-05/06/07 and omitted 2026-08 entirely), there was no record of
-- what the reader was told, no way for them to flag it, and no way to find out
-- afterwards how many answers had been wrong.
--
-- For a tool whose own code comments say people "quote these numbers into
-- decisions", that is the difference between a diagnosable mistake and an
-- invisible one. Nullable, so nothing existing breaks and a failed answer simply
-- leaves it null.

ALTER TABLE public.brain_query ADD COLUMN IF NOT EXISTS answer TEXT;

COMMENT ON COLUMN public.brain_query.answer IS
  'The answer text posted to Slack, truncated. Written by finishQuestion so a
   wrong answer can be found again later. Null when the question never produced
   one (quota, outage, model error).';
