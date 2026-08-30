-- Semantic recall for the brain.
--
-- Lexical search can only match words that are present. Ask "why are people
-- dropping at checkout" and tsvector finds documents containing those words — not
-- the one about "cart abandonment" or "friction in the payment step", which is the
-- document you wanted. That gap is the ceiling on answer quality.
--
-- `gte-small` produces 384 dimensions and ships inside Supabase's edge runtime: no
-- API key, no per-token bill, and — the reason it is not an embedding API — no
-- third party ever sees a corpus that now holds revenue, ad spend, every internal
-- document and the company's email.
--
-- halfvec, not vector: 2 bytes per dimension instead of 4, so 768 bytes a row
-- rather than 1,536. At ~25,000 chunks that is ~19 MB instead of ~38 MB, against a
-- 500 MB ceiling. Recall loss at 384 dimensions is negligible.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.brain_chunk ADD COLUMN IF NOT EXISTS embedding halfvec(384);

-- ONE ROUND TRIP PER BATCH. PostgREST cannot update many rows with differing
-- values, so backfilling ~25,000 chunks would otherwise mean ~25,000 PATCHes.
CREATE OR REPLACE FUNCTION public.brain_set_embeddings(ids bigint[], vecs text[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated integer;
BEGIN
  IF array_length(ids, 1) IS DISTINCT FROM array_length(vecs, 1) THEN
    RAISE EXCEPTION 'ids and vecs must be the same length';
  END IF;
  WITH pairs AS (SELECT unnest(ids) AS id, unnest(vecs) AS vec)
  UPDATE public.brain_chunk c
     SET embedding = p.vec::halfvec(384)
    FROM pairs p
   WHERE c.id = p.id;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

REVOKE ALL ON FUNCTION public.brain_set_embeddings(bigint[], text[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_set_embeddings(bigint[], text[]) TO service_role;
