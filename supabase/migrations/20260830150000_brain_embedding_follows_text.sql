-- An embedding must describe the text it sits next to.
--
-- `embedMissing` is driven by `embedding IS NULL`, which makes it restartable and
-- source-agnostic -- but it means a chunk whose TEXT CHANGES keeps its old vector
-- forever. Nothing looks broken: the row has an embedding, so it is never picked
-- up again, and semantic search quietly matches it on what it used to say.
--
-- This is not hypothetical. The Notion crawl fix added 51.6% more text to existing
-- pages, and the Gmail List-Unsubscribe change re-walks every thread. Any builder
-- change that alters body or title has this shape.
--
-- Doing it in a trigger rather than in the ingesters is deliberate: there are six
-- writers (four cron lanes, a GitHub Action and the push-based Slack route) and
-- more will be added. A rule each writer has to remember is a rule that gets
-- forgotten by the seventh one.
--
-- Cost is nil on the common path: ingest re-writes the same text every run, and
-- `IS DISTINCT FROM` is false, so the embedding is untouched and no re-embedding
-- is triggered by a no-op touch.
CREATE OR REPLACE FUNCTION public.brain_chunk_clear_stale_embedding()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.body IS DISTINCT FROM OLD.body
     OR NEW.title IS DISTINCT FROM OLD.title THEN
    NEW.embedding := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS brain_chunk_embedding_follows_text ON public.brain_chunk;
CREATE TRIGGER brain_chunk_embedding_follows_text
  BEFORE UPDATE ON public.brain_chunk
  FOR EACH ROW
  EXECUTE FUNCTION public.brain_chunk_clear_stale_embedding();
