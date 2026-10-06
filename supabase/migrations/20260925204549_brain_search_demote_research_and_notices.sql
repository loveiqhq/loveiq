-- The brain's own derived records contend on questions they do not answer.
--
-- Two sources arrived with the proactive layer on 2026-09-24: `research` (a Night Shift
-- answer, a synthesis of published literature and our records) and `notice` (a line the
-- brain writes on its own, often restating another record: "Night Shift answered: ...").
-- Neither carried a demotion. On 2026-09-25 the weekly battery went from 224 to 223:
-- `funnel-wording-7` ("show me the stages people go through before paying") lost its
-- analytics record from the top five to the Night Shift's answer about survey progress
-- bars (2.18) and the notice announcing it (2.16), the same text twice.
--
-- A SYNTHESIS OF PAPERS IS NOT OUR CLAIM, and a notice is a pointer to a record, not the
-- record. That is the reasoning `evidence` carries at 0.5, so both join that tier rather
-- than inventing a new number.
--
-- THE SWEEP, measured live through temporary copies of this function, never on the one
-- in use:
--
--   battery (229 probes):
--     0      223/229  funnel-wording-7 fails — the state this fixes
--     0.25   224/229, 0 regressions   (the first 0.25 run was lost to a connection outage
--                                      and re-run; the battery now waits one out)
--     0.50   224/229, 0 regressions   <- chosen
--
--   reach (six questions these two sources exist to answer, e.g. "what did the Night
--   Shift find out about progress bars", "what was unusual in our numbers on
--   24 September"), best position of the expected record:
--     0.25   #1 on 5, #2 on 1
--     0.50   #1 on 5, #2 on 1          <- chosen
--     1.00   #1 on 5, #4 on 1          — rejected
--
-- As with the evidence base, the battery cannot see the upper edge (no probe asserts on
-- these sources), so the reach questions are what bound it.
--
-- Substituted against the LIVE definition, and refuses rather than guesses if the anchor
-- has moved.
DO $mig$
DECLARE
  def text;
  anchor CONSTANT text := 'WHEN c.source = ''evidence'' THEN 0.5';
  replacement CONSTANT text := 'WHEN c.source IN (''evidence'', ''research'', ''notice'') THEN 0.5';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'brain_search';

  IF def IS NULL THEN
    RAISE EXCEPTION 'brain_search not found';
  END IF;

  IF position(anchor in def) = 0 THEN
    IF position(replacement in def) > 0 THEN
      RAISE NOTICE 'research and notice demotion already present; nothing to do';
      RETURN;
    END IF;
    RAISE EXCEPTION 'anchor not found — the demotion expression has moved; refusing to guess';
  END IF;

  EXECUTE replace(def, anchor, replacement);
END
$mig$;
