-- Count a funnel day in Berlin, because that is the day GA4 already counts.
--
-- WHY. The conversion digest prints ad spend next to conversions for the same
-- date. Ad spend comes from GA4, whose property time zone is Europe/Berlin
-- (confirmed against the Admin API, not assumed), so "spend on the 14th" has
-- always been a Berlin day. The funnel counted a UTC day. The cost-per-
-- conversion line was therefore a Berlin numerator over a UTC denominator.
--
-- HOW MUCH IT MOVES, measured on the 30 days to 2026-09-14:
--   * 30-day totals are IDENTICAL either way (424 submissions) — only the
--     assignment of events to days changes, never the count.
--   * 24 of 31 individual days differ, by 1.4 submissions on average against a
--     13.7/day base; worst single day 5.
--   * The last reported day went 12 -> 13.
-- So daily figures restate slightly and every window total stands. Historic
-- digests were not wrong about the period, only about where two hours of it sat.
--
-- This also matches everything else that already reports in Berlin
-- (`reportingDay()`, used by the ux-review cron and recordVisit) and the clock
-- the team actually reads.
--
-- Depends on 20260915140628, which made these boundaries explicit; the anchor
-- below is the UTC conversion that migration introduced.
DO $migration$
DECLARE
  target RECORD;
  body   TEXT;
  before TEXT;
  code   TEXT;
BEGIN
  FOR target IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_axis_funnel_daily','get_landing_arm_funnel_daily','get_landing_start_funnel_daily')
  LOOP
    body   := pg_get_functiondef(target.oid);
    before := body;
    body   := replace(body, 'AT TIME ZONE ''UTC''', 'AT TIME ZONE ''Europe/Berlin''');

    -- No anchor means the function was rewritten since this was authored.
    -- Fail loudly rather than report success having changed nothing.
    IF body = before THEN
      RAISE EXCEPTION 'migration anchor missing: % has no explicit UTC day boundary', target.proname;
    END IF;

    EXECUTE body;
  END LOOP;

  FOR target IN
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_axis_funnel_daily','get_landing_arm_funnel_daily','get_landing_start_funnel_daily')
  LOOP
    -- Strip line comments before counting. One of these functions carries a
    -- comment containing "::date", and counting prose as code failed this
    -- migration's first run.
    code := regexp_replace(target.def, '--[^\n]*', '', 'g');

    IF (SELECT count(*) FROM regexp_matches(code, '::date', 'g'))
       <> (SELECT count(*) FROM regexp_matches(code, 'AT TIME ZONE ''Europe/Berlin''\)::date', 'g')) THEN
      RAISE EXCEPTION 'a day boundary in % is not Europe/Berlin', target.proname;
    END IF;
  END LOOP;
END
$migration$;
