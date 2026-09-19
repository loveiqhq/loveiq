-- Record the score the weak-match warning is judged on, not only the one ranking sorts by.
--
-- `brain_query.top_score` stores `chunks[0].score` — content PLUS recency and every other
-- bonus. The warning a reader sees ("WEAK MATCH — worth a second look") is judged on
-- `contentScore`, bonuses stripped, because that is the only part that says how well the
-- CORPUS matched the QUESTION rather than how the list happened to sort.
--
-- The consequence of storing only the bonused figure: across 6,991 logged calls the one
-- signal this system trusts enough to warn a reader about was thrown away, and "which
-- questions can the corpus not answer" — the direct input to what to index next — could not
-- be asked of its own log.
--
-- Nullable and unbackfilled on purpose. Rows written before this migration genuinely do not
-- have the figure, and inventing one from `top_score` would put a bonused number in a column
-- that everything downstream will read as un-bonused. A NULL says "not recorded"; a wrong
-- number says nothing at all, loudly.
ALTER TABLE public.brain_query
  ADD COLUMN IF NOT EXISTS content_score double precision;

COMMENT ON COLUMN public.brain_query.content_score IS
  'Best content-only match for the query, bonuses stripped — the figure RELEVANCE_FLOOR (1.85) is compared against. NULL for rows written before 2026-09-16.';
