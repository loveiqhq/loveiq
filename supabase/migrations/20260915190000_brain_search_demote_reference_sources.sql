-- Reference sources sit below dated records when the scores are close.
--
-- WHY. On 2026-09-15 the corpus gained 682 chunks of shipped report copy and 341 of
-- glossary/survey/scoring vocabulary. Both are REFERENCE: undated, always current, and
-- therefore in contention on every question rather than only on the ones they answer. The
-- retrieval battery fell from 222/222 to 220/222 and stayed there across repeated runs —
-- reproducible, not flake — on two questions that both turn on a word collision:
--
--   "show me the stages people go through before paying"
--       -> "Report copy as shipped — Sexual Stage" @2.56 above the funnel analytics
--   "what did we decide about micro assessments and the consumer pivot"
--       -> 'What we mean by "Micro Quiz"' @2.73 above the decision record @2.38
--
-- "Stage" and "quiz" are genuinely OUR words now. The definitions are not wrong, they are
-- the wrong KIND of answer: a question asking what we decided wants the decision, and one
-- asking about funnel stages wants the funnel. A small, flat demotion settles the tie in
-- favour of the dated record without hiding the definition.
--
-- 0.5 IS MEASURED, NOT CHOSEN. 0.35 was tried first and recovered only one of the two —
-- the decision gap was exactly 0.35, so it tied instead of flipping. At 0.5 the battery
-- returns to 222/222, and definitional questions still rank the reference first:
--   "what does responsive desire mean"  -> the glossary term, rank 1
--   "what do we mean by arousal brakes" -> the glossary term, rank 1
--   "what is the sexual stage"          -> the shipped chapter, rank 1
-- So the penalty costs nothing on the questions these sources exist to answer.
--
-- Substituted against the LIVE definition, like the bulk-mail demotion before it, and
-- refuses rather than guesses if the anchor has moved.

DO $$
DECLARE
  def text;
  anchor text := '                   ELSE 0 END';
  addition text := '                   ELSE 0 END
            -- Reference sources — the shipped report copy and the glossary/survey/scoring
            -- vocabulary — are undated and always current, so they contend on every
            -- question rather than only the ones they answer. 0.5 settles a close tie
            -- towards a dated record; measured 2026-09-15, it returns the battery to
            -- 222/222 while definitional questions still rank the definition first.
            - CASE WHEN c.source IN (''domain'', ''report'') THEN 0.5 ELSE 0 END';
  hits int;
BEGIN
  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE proname = 'brain_search' LIMIT 1;
  IF def IS NULL THEN
    RAISE EXCEPTION 'brain_search not found';
  END IF;

  IF position('c.source IN (''domain'', ''report'')' in def) > 0 THEN
    RAISE NOTICE 'reference demotion already present';
    RETURN;
  END IF;

  hits := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
  IF hits <> 1 THEN
    RAISE EXCEPTION
      'the bulk-penalty tail matched % times, expected exactly 1 — re-read pg_get_functiondef rather than guessing', hits;
  END IF;

  EXECUTE replace(def, anchor, addition);

  SELECT pg_get_functiondef(oid) INTO def FROM pg_proc WHERE proname = 'brain_search' LIMIT 1;
  IF position('c.source IN (''domain'', ''report'')' in def) = 0 THEN
    RAISE EXCEPTION 'the demotion did not take';
  END IF;
END $$;
