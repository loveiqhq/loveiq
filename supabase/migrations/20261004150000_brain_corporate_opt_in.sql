-- The corporate website (source `corporate`, loaded nightly by brain-ingest) is searchable ONLY
-- when asked for, exactly like the books (20260928010000, 20260928020000) and the papers
-- (20260930210000).
--
-- appliedpsychometrics.org is the website of Applied Psychometrics UG, the company that operates
-- LoveIQ. Its rows are daily, weekly and monthly visits and Google searches, written in the same
-- words as LoveIQ's own `ga4` and `gsc` rows, so an unnamed "how many visitors did we have" would
-- rank the wrong site's numbers beside LoveIQ's. With `sources: ['corporate']` they are searched
-- like any other source; without it a corporate row is never a candidate, in search (both arms)
-- and in count_context alike.
--
-- 'corporate' = ANY(NULL) is NULL, so with no `sources` a corporate row reads `false OR NULL`,
-- which filters it out, and every other row reads `true OR NULL`, which keeps it.
--
-- "appliedpsychometrics" is in every corporate row's title (the site name our ingester writes),
-- so it is ruled out of the per-word title recall arm, like "Book:" and "Paper:". Measured when
-- written: 0% of titles, because the source is empty.
--
-- Substituted against the LIVE definitions, refusing rather than guessing if an anchor has moved,
-- and a no-op when a function already has the clause.
DO $mig$
DECLARE
  def text;
  anchor CONSTANT text := 'AND (exclude_sources IS NULL OR NOT (c.source = ANY(exclude_sources)))';
  addition CONSTANT text := E'\n       AND (c.source <> ''corporate'' OR ''corporate'' = ANY(sources))';
  found integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'brain_search';
  IF def IS NULL THEN
    RAISE EXCEPTION 'brain_search not found';
  END IF;
  IF position('''corporate'' = ANY(sources)' in def) = 0 THEN
    found := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
    IF found <> 2 THEN
      RAISE EXCEPTION 'expected the source filter twice in brain_search, found % — refusing', found;
    END IF;
    EXECUTE replace(def, anchor, anchor || addition);
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'brain_count';
  IF def IS NULL THEN
    RAISE EXCEPTION 'brain_count not found';
  END IF;
  IF position('''corporate'' = ANY(sources)' in def) = 0 THEN
    found := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
    IF found <> 1 THEN
      RAISE EXCEPTION 'expected the source filter once in brain_count, found % — refusing', found;
    END IF;
    EXECUTE replace(def, anchor, anchor || addition);
  END IF;
END
$mig$;

INSERT INTO public.brain_title_stopword (word, matched_pct, noted, skip) VALUES
  ('appliedpsychometrics', 0, 'site name in every title of the opt-in corporate-website source', true)
ON CONFLICT (word) DO UPDATE
  SET matched_pct = EXCLUDED.matched_pct, noted = EXCLUDED.noted, skip = EXCLUDED.skip;
