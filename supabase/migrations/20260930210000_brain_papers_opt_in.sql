-- Full-text open-access papers (source `paper`, loaded by the brain-papers cron) are
-- searchable ONLY when asked for, exactly like the books (20260928010000, 20260928020000).
--
-- A paper is 20 or 30 parts written in the product's own vocabulary (desire, attachment,
-- intimacy), so a few hundred of them would fill the candidate pool on almost any company
-- question. With `sources: ['paper']` they are searched like any other source; without it
-- a paper row is never a candidate, in search (both arms) and in count_context alike.
--
-- 'paper' = ANY(NULL) is NULL, so with no `sources` a paper row reads `false OR NULL`, which
-- filters it out, and every other row reads `true OR NULL`, which keeps it.
--
-- "Paper:" opens every paper part's title, a label our loader prepends like "Book:", so it
-- is ruled out of the per-word title recall arm before it can pull thousands of titles into
-- the pool only for the opt-in to drop them. Measured when written: 0% of titles, because
-- the source is empty; it is every part's prefix once it fills.
--
-- Substituted against the LIVE definitions, refusing rather than guessing if an anchor has
-- moved, and a no-op when a function already has the clause.
DO $mig$
DECLARE
  def text;
  anchor CONSTANT text := 'AND (exclude_sources IS NULL OR NOT (c.source = ANY(exclude_sources)))';
  addition CONSTANT text := E'\n       AND (c.source <> ''paper'' OR ''paper'' = ANY(sources))';
  found integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'brain_search';
  IF def IS NULL THEN
    RAISE EXCEPTION 'brain_search not found';
  END IF;
  IF position('''paper'' = ANY(sources)' in def) = 0 THEN
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
  IF position('''paper'' = ANY(sources)' in def) = 0 THEN
    found := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
    IF found <> 1 THEN
      RAISE EXCEPTION 'expected the source filter once in brain_count, found % — refusing', found;
    END IF;
    EXECUTE replace(def, anchor, anchor || addition);
  END IF;
END
$mig$;

INSERT INTO public.brain_title_stopword (word, matched_pct, noted, skip) VALUES
  ('paper', 0, '"Paper:" prefix on every part of the opt-in paper library', true)
ON CONFLICT (word) DO UPDATE
  SET matched_pct = EXCLUDED.matched_pct, noted = EXCLUDED.noted, skip = EXCLUDED.skip;
