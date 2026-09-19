-- "Started the survey" — count it in Berlin days, and only when they answered.
--
-- TWO DEFECTS IN ONE CTE, both in `get_funnel_cvr_sparklines`, which supplies
-- the funnel table's Started row and the weekly visitor-to-start chart.
--
-- 1. THE DAY BUCKETS ARE IN THE SESSION TIMEZONE, NOT BERLIN. The function
--    carefully pins its window with `AT TIME ZONE 'Europe/Berlin'` and then
--    buckets the starts with a bare `started_at::date`, which resolves against
--    whatever `TimeZone` the session happens to carry. On the pooler that is
--    UTC. Measured 2026-09-19 over 30 days: 108 of 1,025 starts — 10.5% — fall
--    on a different calendar day in Berlin than in UTC, so a tenth of the
--    series is attributed to the wrong point. The WINDOW total is unaffected
--    (its bounds are timestamps), which is why this survived: the headline is
--    right and only the line is wrong, and a line that is wrong by one day in
--    10% of its mass still looks like a plausible line.
--
--    Every sibling CTE in this same function already buckets on `funnel_event.day`,
--    which is a DATE column written in Berlin by the middleware. This one reads a
--    timestamptz and had to do the conversion itself.
--
-- 2. IT COUNTS DRAFTS WHERE NOBODY ANSWERED ANYTHING. `survey_partial_save` gets
--    a row when the survey page saves, which happens before the first answer.
--    1,025 drafts, 977 of them past question one: 48 people are counted as
--    having started a survey they never began. `current_index >= 1` is the plain
--    reading of "started" and matches the decision recorded 2026-09-19.
--
-- NOT FIXED HERE, AND DELIBERATELY: the numerator and denominator live in
-- different id spaces. `visitors` counts DISTINCT visitor_id from funnel_event,
-- which is a VISITOR-DAY — the cookie behind it holds only a date, with no
-- identifier and no cross-day linkage, which is what lets it be set without
-- analytics consent — while `starts` counts survey session ids. The two cannot
-- be reconciled by a query.
--
-- The same-id-space alternative exists: `funnel_event.survey_engine_mount`, 637
-- distinct visitors against the same 11,331. It was rejected because it is
-- CLIENT-inserted and therefore ad-blockable, and 637 against a server-side 977
-- is a 35% undercount. A third of the starts missing is a worse error than a
-- denominator that counts visit-days, so the fix is the LABEL, not the source:
-- the digest names the denominator "visit-days" on the message, and the rate is
-- starts per visit-day rather than per person.
--
-- Rewritten by substitution against the live definition rather than restated in
-- full: the function is ~120 lines and re-pasting it is how a sibling CTE gets
-- silently reverted to an older body.

DO $migration$
DECLARE
  src  TEXT;
  next TEXT;
  old_cte CONSTANT TEXT :=
    '    SELECT started_at::date AS day, COUNT(DISTINCT session_id)::int AS n' || E'\n' ||
    '    FROM survey_partial_save' || E'\n' ||
    '    WHERE started_at >= since_ts AND started_at < until_ts' || E'\n' ||
    '    GROUP BY started_at::date';
  new_cte CONSTANT TEXT :=
    '    -- Berlin, like every sibling CTE here. A bare ::date resolves against' || E'\n' ||
    '    -- the session TimeZone (UTC on the pooler) and put 10.5% of starts on' || E'\n' ||
    '    -- the wrong day. current_index >= 1 because a draft with no answer in' || E'\n' ||
    '    -- it is not a survey anyone started.' || E'\n' ||
    '    SELECT (started_at AT TIME ZONE ''Europe/Berlin'')::date AS day,' || E'\n' ||
    '           COUNT(DISTINCT session_id)::int AS n' || E'\n' ||
    '    FROM survey_partial_save' || E'\n' ||
    '    WHERE started_at >= since_ts AND started_at < until_ts' || E'\n' ||
    '      AND current_index >= 1' || E'\n' ||
    '    GROUP BY 1';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'get_funnel_cvr_sparklines'
   LIMIT 1;

  IF src IS NULL THEN
    RAISE EXCEPTION 'get_funnel_cvr_sparklines not found — refusing to guess at its body';
  END IF;

  -- Idempotent: a re-run finds the new text already in place and stops.
  IF position(new_cte IN src) > 0 THEN
    RAISE NOTICE 'get_funnel_cvr_sparklines already buckets starts in Berlin — nothing to do';
    RETURN;
  END IF;

  -- RAISE rather than silently produce an unchanged function. A substitution
  -- whose anchor has drifted is the failure mode that ships a migration which
  -- runs clean and changes nothing.
  IF position(old_cte IN src) = 0 THEN
    RAISE EXCEPTION
      'the starts CTE in get_funnel_cvr_sparklines does not match the expected text — it has been edited since this migration was written; re-read it before re-running';
  END IF;

  next := replace(src, old_cte, new_cte);

  IF next = src THEN
    RAISE EXCEPTION 'substitution produced an identical body — refusing to run a no-op migration';
  END IF;

  EXECUTE next;
END
$migration$;

COMMENT ON FUNCTION public.get_funnel_cvr_sparklines(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Daily visitors/starts/completions/paid for the funnel sparklines. `visitors` is '
  'VISITOR-DAYS from funnel_event, not people; `starts` is survey sessions past '
  'question one, bucketed in Berlin. The two are different id spaces — the rate is '
  'starts per visit-day and the digest labels it that way.';
