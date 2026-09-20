-- A DOCUMENT THAT CALLS ITSELF OLD SHOULD NOT BE THE FIRST THING PEOPLE READ.
--
-- The team marks retired work in the title -- "[OLD] ...", "Copy of ...", "Copy of Copy
-- of ..." -- and 308 chunks carry one of those marks against 100 marked "[WIP]".
-- Measured 2026-09-09, "what is in the Spark Seeker report" returned `Copy of [OLD]` at
-- ranks 1, 2, 3 AND 4, across drive and gmail both, with the live [WIP] template at 5.
-- Even "what is the CURRENT report template" led with `Copy of [OLD]`. Anyone asking
-- about report copy was reading superseded content first, with the only warning being
-- three characters inside a truncated title.
--
-- DEMOTED, NOT EXCLUDED, exactly like bulk mail. The old drafts are real history and
-- "what did the old template say" is a fair question; they simply stop outranking the
-- document that replaced them. 0.6 is sized from the gap it has to close (0.48 measured
-- between the top superseded copy and the [WIP] original), not chosen.
--
-- The title, not a metadata flag, because the mark is a human convention applied by
-- whoever renamed the file, it reaches gmail's Google-Docs share notifications for free
-- -- four of the eight worst hits were those -- and no ingester has to be re-run.
--
-- Applied as a substitution against the live definition so the deployed body is exactly
-- the previous one plus this clause. Guarded by the battery probe
-- `superseded-copies-do-not-outrank-the-live-document`, which was verified to FAIL with
-- the weight set to 0 and pass at 0.6.
DO $mig$
DECLARE d text; nd text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'brain_search';

  nd := replace(d, $old$            -- ANY GRAIN THAT IS NOT THE ONE ASKED FOR, not just a finer one.$old$,
$new$            -- SUPERSEDED BY ITS OWN TITLE. See the migration comment for the measurement;
            -- in short, "[OLD]" and "Copy of" are how this team marks retired work, and
            -- retired copies were taking the top four slots away from the live document.
            - CASE WHEN c.title ~* '\[OLD\]|Copy of ' THEN 0.6 ELSE 0 END
            -- ANY GRAIN THAT IS NOT THE ONE ASKED FOR, not just a finer one.$new$);

  IF nd = d THEN
    RAISE EXCEPTION 'brain_search: the grain-penalty anchor was not found, so nothing was changed';
  END IF;
  EXECUTE nd;
END
$mig$;
