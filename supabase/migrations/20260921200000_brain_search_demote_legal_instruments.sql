-- A signed contract is authoritative about itself and about nothing else.
--
-- On 2026-09-21 the Drive walk was widened to the whole of every colleague's Drive, and
-- it worked: it brought in the market analyses, the concept papers, the psychometric
-- model landscape. It also brought in the company's legal instruments, and those turn
-- out to be close to a worst case for lexical search. A shareholders agreement is
-- thousands of words of "agree", "price", "terms", "call option" and "notice" — the
-- vocabulary of almost every business question anyone asks.
--
-- MEASURED, not suspected. "what did we agree about pricing in our calls", restricted to
-- drive, ranked like this before:
--
--    1. 2.24  Shareholders Agreement — For Commenting     <- indexed that morning
--    2. 2.13  Shareholders Agreement
--    3. 1.99  Freelancer Agreement Sanjin
--    4. 1.98  LoveIQ Dynamic Pricing Engine — MVP Requirements
--
-- Seven of the top 25 were employment or shareholder contracts. The document that
-- actually answers the question was fourth. After this migration the pricing document is
-- first, meeting summaries take 2, 4, 7, 8 and 10, and the shareholders agreement is
-- 14th.
--
-- WHAT IS SELECTED — 18 documents, 197 chunks, 1.58% of drive. Checked against all 813
-- drive documents rather than written from imagination, because the last title rule
-- written blind would have deleted two research papers:
--
--   * shareholders agreements, freelancer agreements and the freelance contract
--     templates, the VSOP option terms, the per-person confidentiality/DPA agreements.
--
-- TWO EXCLUSIONS, both load-bearing, both verified to select something:
--
--   * `kind <> 'meeting-notes'` spares "Meeting notes: Eman <> Mark - Contract Sync",
--     which is people TALKING about a contract — a discussion, not boilerplate. Exactly
--     one document, but without it that one is buried.
--   * the pattern requires the SINGULAR "agreement"/"contract". "Development
--     Agreements.md" is the development team's working norms ("one clearly responsible
--     leader … 2-week time-boxed sprints") and is real operational knowledge. An earlier
--     draft of this rule demoted it. Plural is a list of norms; singular is an
--     instrument.
--
--   An "analysis/strategy" guard was drafted too, and DROPPED: measured against all 813
--   documents it spared zero of them, because the legal strategy papers
--   (DE_Dating_App_Legal_Compliance_Strategiepapier, Legal_Compliance_Summary_EU_DE) have
--   neither word in their titles and were never at risk. A guard that selects nothing is
--   not protection, it is a comment that looks like protection.
--
-- THE SWEEP, both edges, live:
--
--   weight   battery      contracts on the 5 questions they exist to answer
--   0.00     224/229      (baseline — the state this fixes)
--   0.50     226/229      first on 4 of 5, top-3 on 4 of 5   <- chosen
--   1.00     226/229      first on 4 of 5, top-3 on 4 of 5
--
-- The window is wide and FLAT: 0.5 and 1.0 measure identically on both edges, because
-- contracts have almost no competition on their own questions, so the reach measurement
-- cannot discriminate here and the battery cannot either. 0.5 is chosen for the reason
-- the evidence migration gives — it states the existing rule (reference material 0.5,
-- our own repo docs 0.25) rather than inventing a fourth number — and because when two
-- values measure the same, the gentler one is the one that fails quieter.
--
-- Two of the four regressed probes are fixed here (`limit-is-honoured`,
-- `decision-pricing`). The other two, plus `record-beats-transcript`, were measured with
-- the demotion live and have nothing to do with contracts — no contract appears in their
-- results at all. They are not swept at here.
--
-- Substituted against the LIVE definition and refuses rather than guesses, because a
-- substitution that quietly matches nothing looks exactly like one that worked.
DO $mig$
DECLARE
  def text;
  anchor CONSTANT text := 'WHEN c.source = ''evidence'' THEN 0.5 ELSE 0 END';
  replacement CONSTANT text :=
    'WHEN c.source = ''evidence'' THEN 0.5 '
    'WHEN c.source = ''drive'' AND coalesce(c.meta->>''kind'','''') <> ''meeting-notes'' '
    'AND c.title ~* ''(agreement|contract)([ _.]|$)|vsop|terms[ _]of[ _]options|articles of association'' THEN 0.5 '
    'ELSE 0 END';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'brain_search';

  IF def IS NULL THEN
    RAISE EXCEPTION 'brain_search not found';
  END IF;

  IF position(anchor in def) = 0 THEN
    IF position('articles of association' in def) > 0 THEN
      RAISE NOTICE 'legal-instrument demotion already present; nothing to do';
      RETURN;
    END IF;
    RAISE EXCEPTION 'brain_search anchor has moved - refusing to guess. Re-derive from pg_get_functiondef.';
  END IF;

  EXECUTE replace(def, anchor, replacement);
END $mig$;
