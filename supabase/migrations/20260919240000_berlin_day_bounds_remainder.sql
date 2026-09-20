-- The three Berlin-day bugs the allow-list pass could not reach.
--
-- 20260919230000 rewrote every `<timestamptz column>::date` by matching on a list
-- of COLUMN names. Three sites are neither a column nor written so the pattern
-- could see them, so all three survived it — and the audit that enumerated the
-- survivors missed two of them as well, because it extracted a bare identifier
-- immediately followed by `::date` and `(effective_since)::date` has a paren in
-- between. Re-running that audit against 46 characters of context is what found
-- them. Noted because the failure was in the CHECK, not the fix.
--
-- 1. get_conversion_funnel — `fe.day >= effective_since::date`, twice.
--    `effective_since` is a TIMESTAMPTZ local, and `funnel_event.day` is a DATE
--    already written in Berlin. So a Berlin day column was being compared against
--    a UTC-derived day: the window opened on the wrong date for any `since_ts`
--    between 00:00 and 02:00 Berlin — which is exactly what every caller passes,
--    since they all pass Berlin midnight. Same defect as 20260919180000, in a
--    function that migration did not cover. Live on /api/admin/funnels/conversion
--    AND exposed to the company brain as a queryable table, so it answers
--    "where do people drop off" for anyone who asks.
--
-- 2. get_conversion_pipeline — `generate_series((effective_since)::date, …)`.
--    The previous pass converted this function's three per-day BUCKETS to Berlin
--    but not the day axis they are joined to, so the axis started on the UTC day
--    while the buckets landed on Berlin days. Half-converted is worse than either
--    end state: the first day of the series could find no bucket at all. Feeds
--    /api/admin/pipeline, product-experience-health, metric-library, and
--    features/admin/server/strategy.ts — the strategy digest that posts to Slack.
--
-- 3. get_segment_metrics_snapshot — `p_since::date::timestamptz`.
--    A different shape of the same bug: this one is a DATE being widened to a
--    timestamptz, which resolves midnight in the SESSION zone. An admin who types
--    "2026-09-19" got 00:00 UTC = 02:00 Berlin, so the first two hours of the day
--    were cut off the near side and two hours of the previous day pulled in at the
--    far side. `timestamp AT TIME ZONE 'Europe/Berlin'` is the correct widening:
--    it reads the naive timestamp AS Berlin local and returns the right instant.
--    (`timestamptz AT TIME ZONE z` is the opposite direction and would be wrong
--    here — the two are spelled identically and differ only by operand type.)
--
-- Substitution rather than a rewrite, because these bodies are long and untouched
-- otherwise; each anchor is checked and RAISEs if absent, so a body that has moved
-- underneath us fails loudly instead of silently not applying.

DO $migration$
DECLARE
  src TEXT;
  next TEXT;
  n INT;
BEGIN
  ---------------------------------------------------------------- 1
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.proname = 'get_conversion_funnel' AND p.prokind = 'f';
  IF src IS NULL THEN RAISE EXCEPTION 'get_conversion_funnel not found'; END IF;

  SELECT count(*) INTO n FROM regexp_matches(src, 'fe\.day >= effective_since::date', 'g');
  IF n <> 2 THEN
    RAISE EXCEPTION 'get_conversion_funnel: expected 2 bare day bounds, found %', n;
  END IF;
  next := replace(src,
    'fe.day >= effective_since::date',
    'fe.day >= (effective_since AT TIME ZONE ''Europe/Berlin'')::date');
  EXECUTE next;
  RAISE NOTICE 'get_conversion_funnel — 2 day bounds now Berlin';

  ---------------------------------------------------------------- 2
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.proname = 'get_conversion_pipeline' AND p.prokind = 'f';
  IF src IS NULL THEN RAISE EXCEPTION 'get_conversion_pipeline not found'; END IF;

  SELECT count(*) INTO n FROM regexp_matches(src, '\(effective_since\)::date', 'g');
  IF n = 0
     AND position('(effective_since AT TIME ZONE ''Europe/Berlin'')::date' in src) > 0 THEN
    -- Already Berlin. On a REPLAY this function is created by
    -- 20260307095959_objects_that_predate_the_migration_history.sql, which
    -- captured production AFTER this migration had run — so the patch it is
    -- about to apply is already present and there are 0 bare sites to find.
    -- That is success, not a missing anchor. Raising here aborted the first
    -- rebuild of this database (2026-09-20).
    RAISE NOTICE 'get_conversion_pipeline — already on Berlin days, nothing to do';
  ELSE
    IF n <> 1 THEN
      RAISE EXCEPTION 'get_conversion_pipeline: expected 1 bare series start, found %', n;
    END IF;
    next := replace(src,
      '(effective_since)::date',
      '(effective_since AT TIME ZONE ''Europe/Berlin'')::date');
    EXECUTE next;
    RAISE NOTICE 'get_conversion_pipeline — day axis now matches its Berlin buckets';
  END IF;

  ---------------------------------------------------------------- 3
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.proname = 'get_segment_metrics_snapshot' AND p.prokind = 'f';
  IF src IS NULL THEN RAISE EXCEPTION 'get_segment_metrics_snapshot not found'; END IF;

  IF position('p_since::date::timestamptz' IN src) = 0
     OR position('(p_until::date + interval ''1 day'')::timestamptz' IN src) = 0 THEN
    RAISE EXCEPTION 'get_segment_metrics_snapshot: date-only bounds not where expected';
  END IF;
  next := replace(src,
    'p_since::date::timestamptz',
    '(p_since::date::timestamp AT TIME ZONE ''Europe/Berlin'')');
  next := replace(next,
    '(p_until::date + interval ''1 day'')::timestamptz',
    '((p_until::date + interval ''1 day'')::timestamp AT TIME ZONE ''Europe/Berlin'')');
  EXECUTE next;
  RAISE NOTICE 'get_segment_metrics_snapshot — date-only filters now mean Berlin midnight';
END
$migration$;
