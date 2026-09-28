-- The book library (20260928010000) is opt-in in brain_search. Two places did not know it.
--
-- 1. `brain_count` (count_context) filters sources in the same shape but had no book
--    condition, so count_context({q:"desire"}) counted every book part while
--    search_company_context could return none of them. Its description promises the
--    filters "mean exactly what they mean in search_company_context", and a count is read
--    as a floor for the search, so it gains the same condition.
-- 2. "Book:" opens every book part's title: 11.5% of all titles, measured 2026-09-28,
--    against the 4% line above which a title word needs a ruling in brain_title_stopword.
--    It is a label our own loader prepends, like "Drive:" and "Email:", so it is skipped
--    by the per-word title recall arm, and a question with "book" in it no longer pulls
--    3,265 titles into the candidate pool only for the opt-in to drop them.
--
-- Substituted against the LIVE definition, refusing unless the anchor appears once.
DO $mig$
DECLARE
  def text;
  anchor CONSTANT text := 'AND (exclude_sources IS NULL OR NOT (c.source = ANY(exclude_sources)))';
  addition CONSTANT text := E'\n       AND (c.source <> ''book'' OR ''book'' = ANY(sources))';
  found integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'brain_count';

  IF def IS NULL THEN
    RAISE EXCEPTION 'brain_count not found';
  END IF;

  IF position('''book'' = ANY(sources)' in def) = 0 THEN
    found := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
    IF found <> 1 THEN
      RAISE EXCEPTION 'expected the source filter once in brain_count, found % — refusing', found;
    END IF;
    EXECUTE replace(def, anchor, anchor || addition);
  END IF;
END
$mig$;

INSERT INTO public.brain_title_stopword (word, matched_pct, noted, skip) VALUES
  ('book', 11.5, '"Book:" prefix on every part of the opt-in book library', true)
ON CONFLICT (word) DO UPDATE
  SET matched_pct = EXCLUDED.matched_pct, noted = EXCLUDED.noted, skip = EXCLUDED.skip;
