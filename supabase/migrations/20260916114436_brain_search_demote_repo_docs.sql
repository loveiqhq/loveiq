-- Our own runbooks sit below dated records too, at half the reference penalty.
--
-- WHAT WENT WRONG. On 2026-09-15 `20260915190000` demoted `domain` and `report` by 0.5,
-- because undated reference material contends on every question rather than only the ones
-- it answers. That fix was measured against this exact probe:
--
--   "what did we decide about micro assessments and the consumer pivot"
--
-- and it returned the battery to 222/222. One day later the same probe failed again, and
-- the new contender was `doc` -- OUR OWN repo documentation. Commit `6393af04` added a
-- section to COMPANY_BRAIN.md describing the brain's sources; the brain indexes that file;
-- and the enlarged section then out-ranked a real 2026-08-22 meeting record on a question
-- about what was decided. Measured before this migration, the meeting record had the
-- SECOND-HIGHEST content score of the eight hits (2.00) and still placed fourth, because
-- the runbook's bonuses came to +0.60 against its +0.34.
--
-- Writing documentation should not move retrieval. That it does is the same trap as a
-- probe that passes because we documented the gap it was checking for.
--
-- WHY NOT JUST ADD 'doc' TO THE EXISTING 0.5. Tried first, and it traded one failure for
-- another: `decision-by-topic` recovered and `cm-marcus-line` ("explain a recent change in
-- plain english") broke, because that question genuinely wants the runbook's plain-English
-- section. Repo docs are reference, but they are OUR reference and they answer questions
-- about how we work -- so they need a gentler hand than a glossary definition.
--
-- 0.25 IS MEASURED. The whole window was swept against the 222-probe battery:
--
--   0.10  221/222  decision-by-topic still fails -- too small to settle the tie
--   0.15  222/222
--   0.25  222/222  <- chosen: inside the window with margin at both ends
--   0.30  222/222
--   0.40  221/222  cm-marcus-line fails -- the runbook is now buried on a question it owns
--   0.50  221/222  same
--
-- So the usable range is about (0.12, 0.35) and 0.25 sits near its middle. Being more
-- precise than that would be false precision: the edges are known only to the resolution
-- the sweep used.
--
-- Substituted against the LIVE definition, and refuses rather than guesses if the anchor
-- has moved -- a substitution that quietly matches nothing is indistinguishable from one
-- that worked.
DO $mig$
DECLARE
  def text;
  anchor CONSTANT text := 'CASE WHEN c.source IN (''domain'', ''report'') THEN 0.5 ELSE 0 END';
  hits int;
BEGIN
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE proname = 'brain_search' LIMIT 1;
  IF def IS NULL THEN
    RAISE EXCEPTION 'brain_search not found';
  END IF;

  -- Already applied: this migration has run, or the arm was set by hand during the sweep.
  IF position('c.source = ''doc''' in def) > 0 THEN
    RAISE NOTICE 'repo-doc demotion already present';
    RETURN;
  END IF;

  hits := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
  IF hits <> 1 THEN
    RAISE EXCEPTION
      'the reference-demotion arm matched % times, expected exactly 1 — re-read pg_get_functiondef rather than guessing', hits;
  END IF;

  EXECUTE replace(
    def,
    anchor,
    'CASE WHEN c.source IN (''domain'', ''report'') THEN 0.5 WHEN c.source = ''doc'' THEN 0.25 ELSE 0 END'
  );
END
$mig$;

DO $check$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE proname = 'brain_search' LIMIT 1;
  IF position('c.source = ''doc'' THEN 0.25' in def) = 0 THEN
    RAISE EXCEPTION 'repo-doc demotion did not take';
  END IF;
END
$check$;
