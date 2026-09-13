-- Reverts to embeddings that can outlive the text they describe. Search keeps
-- working; chunks whose text is rewritten afterwards will match on their previous
-- contents until something nulls them by hand.
DROP TRIGGER IF EXISTS brain_chunk_embedding_follows_text ON public.brain_chunk;
DROP FUNCTION IF EXISTS public.brain_chunk_clear_stale_embedding();
