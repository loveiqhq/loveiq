-- The recall arm was matching the labels WE prepend to titles, not the documents.
--
-- `brain_search` builds its candidate set from four arms UNIONed together. One scans,
-- per word of the question, every chunk whose TITLE is trigram-similar to that word. It
-- is a recall arm and a good idea: it finds documents the full-text arm misses.
--
-- But our titles are not just the document's name. Every ingester prepends what the
-- thing is -- "Email: ...", "Meeting notes: ...", "Notion task: ..." -- so those words
-- sit in thousands of titles for reasons unrelated to the document. MEASURED 2026-09-11
-- against 22,929 chunks, as a share of all titles:
--
--   part 66.2%   drive 37.9%   email 37.6%   loveiq 28.5%   notes 18.9%   2026 17.8%
--   sync 10.4%   meeting 10.3%   gemini 8.7%   summary 5.9%   jira 5.4%   cest 4.8%
--   scrum 4.7%   mentioned 4.3%   docx 4.1%
--
-- Of the 8,505 titles matching "email", 8,483 are gmail chunks -- 99.7%, matching only
-- because of the "Email:" prefix our own ingester wrote. A question containing "email"
-- therefore drags every email the company ever sent into the candidate set, and every
-- one is then scored.
--
-- WHAT IT ACTUALLY BUYS, AND WHAT IT DOES NOT. Candidates collapse:
--
--   "what do we use to send email"                    8,786 -> 412
--   "show me the drive notes from the sync"          11,445 -> 141
--   "what did we decide about pricing ... meeting"    2,545 -> 186
--   "what is our AWS bill"                               41 ->  41   (unchanged)
--
-- The TIME saved is far smaller than that implies: 79ms median on a ~1,000ms query,
-- measured by interleaved A/B toggling this table's contents between calls, with one
-- question 30ms SLOWER. Cutting 95% of candidates buys 8% of the time, so the GIN
-- scans were never the bottleneck -- worth writing down, because the candidate count
-- looks like a 95% win and is not one.
--
-- QUALITY IS UNCHANGED, NOT IMPROVED. 214/214 retrieval probes, 110-question sweep and
-- 25 MCP probes all identical with the list on and off. The justification is the 79ms
-- plus not scoring 8,483 irrelevant chunks for any question with "email" in it; it is
-- NOT a measured ranking gain, and an early reading that claimed one turned out to be
-- a different change entirely.
--
-- NOTHING BECOMES UNFINDABLE. This arm is recall, not ranking: a chunk it stops
-- contributing is still reached by the full-text arm, the whole-question trigram arm
-- and the semantic arm. What goes is candidates that were scored and lost anyway.
--
-- A TABLE, NOT A LIST IN THE FUNCTION, and it holds EVERY word above the threshold with
-- an explicit ruling rather than only the skipped ones. "report" is above the line at
-- 5.6% and is deliberately KEPT, because the product is a report in a way that "docx"
-- is not. The row is the decision; a missing row is an oversight, and the MCP battery
-- tells them apart by re-deriving the frequencies and failing on any word with no row.

CREATE TABLE IF NOT EXISTS public.brain_title_stopword (
  word          text PRIMARY KEY,
  matched_pct   numeric,                     -- share of titles when the ruling was made
  noted         text,                        -- why it is structural, or why it is kept
  skip          boolean NOT NULL DEFAULT true -- false = above the threshold ON PURPOSE
);

COMMENT ON TABLE public.brain_title_stopword IS
  'Every title word above the frequency threshold, with a ruling. Words with skip=true '
  'are ignored by brain_search''s per-word title-trigram RECALL arm because they match so '
  'many titles they discriminate nothing -- mostly labels our own ingesters prepend. '
  'skip=false records a deliberate exception. The MCP battery re-derives the list from '
  'the corpus and fails on any frequent word with no row here.';

INSERT INTO public.brain_title_stopword (word, matched_pct, noted, skip) VALUES
  ('part',      66.2, 'our own chunk-part suffix, e.g. "(2/5)"',                      true),
  ('drive',     37.9, 'source label on every Drive document',                         true),
  ('email',     37.6, '8,483 of 8,505 matches are the "Email:" prefix on gmail',       true),
  ('loveiq',    28.5, 'the company name is in a quarter of all titles',               true),
  ('notes',     18.9, '"Meeting notes:" prefix',                                      true),
  ('2026',      17.8, 'the current year, stamped into dated titles',                  true),
  ('sync',      10.4, 'the name of a recurring meeting',                              true),
  ('meeting',   10.3, '"Meeting:" and "Meeting notes:" prefixes',                     true),
  ('gemini',     8.7, 'the tool that produced the call notes, in their titles',       true),
  ('summary',    5.9, 'section label inside meeting notes',                           true),
  ('your',       5.6, 'common in marketing subject lines; discriminates nothing',     true),
  ('jira',       5.4, 'source label',                                                 true),
  ('cest',       4.8, 'timezone suffix on dated titles',                              true),
  ('scrum',      4.7, 'the name of a recurring meeting',                              true),
  ('mentioned',  4.3, 'Notion notification subject lines',                            true),
  ('docx',       4.1, 'file extension',                                               true),
  ('report',     5.6, 'above the threshold but deliberately KEPT — the product is a report', false)
ON CONFLICT (word) DO UPDATE
  SET matched_pct = EXCLUDED.matched_pct, noted = EXCLUDED.noted, skip = EXCLUDED.skip;

-- How many TITLES each word matches, as a share of the corpus -- measured the way the
-- recall arm pays for it. Read by the battery to catch a word nobody has ruled on.
CREATE OR REPLACE FUNCTION public.brain_title_word_frequency(min_pct numeric DEFAULT 4.0)
RETURNS TABLE (word text, pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH total AS (SELECT count(*)::numeric AS n FROM public.brain_chunk),
  w AS (
    SELECT lower(tok) AS word, count(*)::numeric AS n
      FROM public.brain_chunk c, regexp_split_to_table(coalesce(c.title,''), '\W+') AS tok
     WHERE length(tok) > 3
     GROUP BY 1
  )
  SELECT w.word, round(100.0 * w.n / total.n, 1) AS pct
    FROM w, total
   WHERE 100.0 * w.n / total.n >= min_pct
   ORDER BY w.n DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.brain_title_word_frequency(numeric) TO service_role;

-- Edited by substitution against the live definition rather than pasted: the function is
-- 12KB and re-typing it to change one WHERE clause is how an unrelated line gets lost.
-- The RAISE matters more than the replace -- a missed anchor would otherwise "succeed"
-- and silently leave the function exactly as it was.
DO $do$
DECLARE
  src  text;
  want text := 'WHERE length(w) > 3 AND to_tsvector(''english'', w) <> ''''::tsvector';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'brain_search' AND n.nspname = 'public';

  IF src IS NULL THEN
    RAISE EXCEPTION 'brain_search does not exist; nothing to edit';
  END IF;
  IF position('brain_title_stopword' IN src) > 0 THEN
    RAISE NOTICE 'brain_search already skips stopwords; leaving it alone';
    RETURN;
  END IF;
  IF position(want IN src) = 0 THEN
    RAISE EXCEPTION 'the words-CTE filter was not found — brain_search has changed shape, edit by hand';
  END IF;

  src := replace(src, want, want ||
    E'\n         AND NOT EXISTS (SELECT 1 FROM public.brain_title_stopword s WHERE s.word = w AND s.skip)');
  EXECUTE src;
END
$do$;
