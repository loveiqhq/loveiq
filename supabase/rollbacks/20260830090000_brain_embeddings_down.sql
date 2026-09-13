-- Drops semantic recall. The column holds ~19 MB of vectors that would have to be
-- recomputed (~90 minutes against the local model, far longer via the edge
-- function), so revert only deliberately.
DROP FUNCTION IF EXISTS public.brain_set_embeddings(bigint[], text[]);
ALTER TABLE public.brain_chunk DROP COLUMN IF EXISTS embedding;
-- `vector` is left installed: dropping an extension other objects may come to rely
-- on is a bigger blast radius than the few kilobytes it costs.
