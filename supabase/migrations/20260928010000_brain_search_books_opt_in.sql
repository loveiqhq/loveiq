-- Eleven third-party books on love, desire and sex become searchable, ONLY when asked for.
--
-- They sat in Drive and were excluded from the walk on 2026-09-06 because "a 2,400-character
-- book page matches almost any vocabulary": measured then, they surfaced as top hits on
-- questions they could not answer. Asked on 2026-09-28 to index the relevant ones, the
-- question was how, not whether. These books share the product's OWN vocabulary (desire,
-- attachment, arousal, love), about 3,200 parts of it, and a demotion only reorders what
-- is already a candidate: the semantic arm takes a top-120 over the whole corpus, and
-- 3,200 on-topic book pages would fill it before any demotion is applied.
--
-- So `book` is OPT-IN: a row of it is a candidate only when the caller names the source
-- (`sources` contains 'book'). A default search cannot return one, so it cannot reorder
-- anything; with `sources: ['book']` the books are searched like any other source. The
-- two places `brain_search` filters by source (the semantic top-120 and the final pool)
-- carry the same exclude line, and both gain the condition.
--
-- `'book' = ANY(NULL)` is NULL, so with no `sources` a book row reads `false OR NULL`,
-- which filters it out; every other row reads `true OR NULL`, which keeps it.
--
-- Substituted against the LIVE definition, and refuses rather than guesses if the anchor
-- has moved or no longer appears exactly twice.
DO $mig$
DECLARE
  def text;
  anchor CONSTANT text := 'AND (exclude_sources IS NULL OR NOT (c.source = ANY(exclude_sources)))';
  addition CONSTANT text := E'\n       AND (c.source <> ''book'' OR ''book'' = ANY(sources))';
  found integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'brain_search';

  IF def IS NULL THEN
    RAISE EXCEPTION 'brain_search not found';
  END IF;

  IF position('''book'' = ANY(sources)' in def) > 0 THEN
    RAISE NOTICE 'books are already opt-in; nothing to do';
    RETURN;
  END IF;

  found := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
  IF found <> 2 THEN
    RAISE EXCEPTION 'expected the source filter twice, found % — refusing to guess', found;
  END IF;

  EXECUTE replace(def, anchor, anchor || addition);
END
$mig$;
