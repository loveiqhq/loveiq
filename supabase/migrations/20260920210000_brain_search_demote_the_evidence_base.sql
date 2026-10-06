-- Published literature is third-party, and it contends on questions it does not answer.
--
-- The evidence base went live on 2026-09-17 and is 70 chunks of peer-reviewed abstracts.
-- The plan that approved it said, in as many words, to expect a demotion and to measure
-- it with the battery before and after. It shipped without one, and by 2026-09-20 the
-- battery had fallen from 222/222 to 218/222.
--
-- ONE of those four is this: `cm-marcus-line` ("explain a recent change in plain
-- english") wants the commit-convention section of our own runbook, and "Research on
-- Evolutionary Mismatch — published literature" was taking its place in the top twelve.
-- Re-running the same probe with `exclude_sources: ["evidence"]` passed, which is what
-- identified the contender rather than assuming it. The other three have nothing to do
-- with evidence -- measured, zero evidence chunks in their top twelve -- and are left
-- alone here rather than swept at until they move.
--
-- A PAPER IS NOT OUR CLAIM. That is the same reason `domain` and `report` carry 0.5:
-- undated reference material matches the vocabulary of almost any question, so without a
-- penalty it contends everywhere instead of only where it answers.
--
-- THE SWEEP. Battery at each value, live:
--
--   0      218/222  cm-marcus-line fails — the state this migration fixes
--   0.10   219/222
--   0.25   219/222
--   0.50   219/222  <- chosen
--   1.00   (not run against the battery; rejected on reach, below)
--
-- THE BATTERY CANNOT SEE THE OTHER EDGE, and that is the part worth reading twice. Not
-- one of its 222 probes asserts on the `evidence` source, so a penalty large enough to
-- bury the literature entirely would score exactly as well as a good one. Picking the
-- value that maximised the battery would have been measuring the wrong thing.
--
-- So the upper edge was measured separately, against five questions the evidence base
-- exists to answer ("what does the published research say about sexual desire
-- discrepancy", "which studies support our attachment style dimension", and so on),
-- asking where an evidence chunk placed:
--
--   0.25   first on 4 of 5, in the top 3 on 5 of 5
--   0.50   first on 4 of 5, in the top 3 on 5 of 5   <- chosen
--   1.00   first on 2 of 5, in the top 3 on 3 of 5   — rejected
--
-- 0.5 is therefore inside a window that runs from below 0.10 to at least 0.5 on one
-- side and breaks before 1.0 on the other. It is chosen over the gentler values that
-- measured identically because it states a rule rather than a number: third-party,
-- undated reference material is demoted 0.5, our own repo docs 0.25. A probe for the
-- reach measurement is added to the battery in the same commit, so the next person to
-- sweep this can see both edges. Those probes are a THIN guard: mutation-tested at 1.0,
-- only one of the three objects, because the other two questions have almost no
-- competition in the corpus. A future sweep above 0.5 should re-take the reach
-- measurement rather than trust them.
--
-- Substituted against the LIVE definition, and refuses rather than guesses if the anchor
-- has moved — a substitution that quietly matches nothing is indistinguishable from one
-- that worked.
DO $mig$
DECLARE
  def text;
  anchor CONSTANT text :=
    'CASE WHEN c.source IN (''domain'', ''report'') THEN 0.5 WHEN c.source = ''doc'' THEN 0.25 ELSE 0 END';
  replacement CONSTANT text :=
    'CASE WHEN c.source IN (''domain'', ''report'') THEN 0.5 WHEN c.source = ''doc'' THEN 0.25 WHEN c.source = ''evidence'' THEN 0.5 ELSE 0 END';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'brain_search';

  IF def IS NULL THEN
    RAISE EXCEPTION 'brain_search not found';
  END IF;

  IF position(anchor in def) = 0 THEN
    IF position('c.source = ''evidence''' in def) > 0 THEN
      RAISE NOTICE 'evidence demotion already present; nothing to do';
      RETURN;
    END IF;
    RAISE EXCEPTION 'anchor not found — the demotion expression has moved; refusing to guess';
  END IF;

  EXECUTE replace(def, anchor, replacement);
END
$mig$;
