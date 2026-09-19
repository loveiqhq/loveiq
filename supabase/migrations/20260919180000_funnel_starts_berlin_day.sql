-- The funnel sparkline RPCs: Berlin days, a real start definition, and a pinned
-- search_path.
--
-- FOUR DEFECTS, found while settling the "what counts as a survey start"
-- decision. Three of them are in all four get_funnel*sparklines* functions,
-- which between them feed the daily funnel table, the site-wide visits chart,
-- the weekly rail and the admin dashboard.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE WINDOW IS A DAY EARLY, IN ALL FOUR.
--
--    Each one opens with `since_day DATE := since_ts::date`. A cast from
--    timestamptz to date resolves against the SESSION TimeZone, which is UTC on
--    the pooler — and every caller passes Berlin midnight, which is 22:00Z the
--    day before in summer. So the bound lands on the previous calendar day.
--
--    Measured 2026-09-19 for the 30-day window the digest asks for:
--      asked for   2026-08-21 .. 2026-09-19  ->  11,339 visitor-days
--      counted     2026-08-20 .. 2026-09-18  ->  11,624 visitor-days
--
--    Still 30 days wide, so nothing looked wrong: it silently includes a day
--    before the stated start and drops the most recent day entirely. The
--    message's own header says "30-day window ending 2026-09-17 Berlin time"
--    over a row counting a window that ends a day earlier than that.
--
--    Worse inside `get_funnel_cvr_sparklines` specifically: its `visitors` CTE
--    filters on these day bounds while its `starts` CTE filters on the raw
--    timestamps. The two halves of the same rate were measuring different 30
--    days.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE START BUCKETS WERE ALSO IN THE SESSION TIMEZONE (cvr only).
--
--    `GROUP BY started_at::date`, the same cast, this time on the per-day
--    buckets rather than the bounds. 108 of 1,025 starts — 10.5% — fall on a
--    different calendar day in Berlin than in UTC, so a tenth of the series sat
--    on the wrong point. The window TOTAL was unaffected, which is why it
--    survived: the headline was right and only the line was wrong, and a line
--    misplaced by a day in a tenth of its mass still looks plausible.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. IT COUNTED DRAFTS NOBODY HAD ANSWERED (cvr only).
--
--    A `survey_partial_save` row appears when the page saves, before the first
--    answer: 1,025 drafts, 977 of them past question one. 48 people were
--    counted as having started a survey they never began. `current_index >= 1`
--    is the plain reading of "started" and matches the decision recorded
--    2026-09-19.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 4. SECURITY DEFINER WITH NO PINNED search_path, IN ALL FOUR.
--
--    `proconfig` is null on every one of them, while every sibling RPC in this
--    repo pins `search_path` explicitly. A SECURITY DEFINER function runs as its
--    owner (postgres) with the CALLER's search_path, so a caller able to create
--    objects in an earlier schema can shadow a name and have it executed as the
--    owner. EXECUTE is granted only to postgres and service_role today, which
--    limits the practical reach, but this is the finding Supabase's own linter
--    raises as `function_search_path_mutable` and there is no reason to carry it.
--
--    SCOPE: the linter reports 23 functions with this warning, not 4. The other
--    19 are pinned here only in the sense that they are NOT — they are outside
--    this change and are left alone deliberately. `ALTER FUNCTION ... SET
--    search_path` does not touch a body and is idempotent, so doing all 23 in
--    one loop is tempting; it is also 19 functions whose behaviour nobody in
--    this change has tested, and at least one (`brain_search`) depends on
--    extensions that happen to live in `public` today. That is its own reviewed
--    piece of work, not a rider on a charts fix. The full list is in the
--    security advisor output under `function_search_path_mutable`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- NOT FIXED, DELIBERATELY: in `get_funnel_cvr_sparklines` the numerator and
-- denominator live in different id spaces. `visitors` counts DISTINCT
-- visitor_id from funnel_event, which is a VISITOR-DAY — the cookie behind it
-- holds only a date, with no identifier and no cross-day linkage, which is what
-- lets it be set without analytics consent — while `starts` counts survey
-- session ids. No query can reconcile that.
--
-- The same-id-space alternative exists (`funnel_event.survey_engine_mount`, 637
-- distinct visitors against the same 11,339) and was rejected: it is
-- CLIENT-inserted and so ad-blockable, and 637 against a server-side 977 is a
-- 35% undercount. A third of the starts going missing is a worse error than a
-- denominator counting visit-days, so the fix is the LABEL — the digest names
-- the denominator "visit-days" on the message.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Applied by substitution against each live definition, with a RAISE when an
-- anchor is missing, rather than re-pasting four ~120-line bodies. Re-pasting is
-- how a sibling CTE gets silently reverted to an older version.

DO $migration$
DECLARE
  fn      TEXT;
  src     TEXT;
  next    TEXT;
  changed INT;

  old_bounds CONSTANT TEXT :=
    '  since_day DATE := since_ts::date;' || E'\n' ||
    '  until_day DATE := until_ts::date;';
  new_bounds CONSTANT TEXT :=
    '  -- Berlin, not the session TimeZone. A bare ::date on a timestamptz' || E'\n' ||
    '  -- resolves against TimeZone (UTC on the pooler) and every caller passes' || E'\n' ||
    '  -- Berlin midnight, which is 22:00Z the day before in summer — so these' || E'\n' ||
    '  -- bounds landed a full day early while still spanning the right width.' || E'\n' ||
    '  since_day DATE := (since_ts AT TIME ZONE ''Europe/Berlin'')::date;' || E'\n' ||
    '  until_day DATE := (until_ts AT TIME ZONE ''Europe/Berlin'')::date;';

  old_starts CONSTANT TEXT :=
    '    SELECT started_at::date AS day, COUNT(DISTINCT session_id)::int AS n' || E'\n' ||
    '    FROM survey_partial_save' || E'\n' ||
    '    WHERE started_at >= since_ts AND started_at < until_ts' || E'\n' ||
    '    GROUP BY started_at::date';
  new_starts CONSTANT TEXT :=
    '    -- Berlin, like the bounds above. And current_index >= 1, because a' || E'\n' ||
    '    -- draft with no answer in it is not a survey anyone started.' || E'\n' ||
    '    SELECT (started_at AT TIME ZONE ''Europe/Berlin'')::date AS day,' || E'\n' ||
    '           COUNT(DISTINCT session_id)::int AS n' || E'\n' ||
    '    FROM survey_partial_save' || E'\n' ||
    '    WHERE started_at >= since_ts AND started_at < until_ts' || E'\n' ||
    '      AND current_index >= 1' || E'\n' ||
    '    GROUP BY 1';
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'get_funnel_cvr_sparklines',
    'get_funnel_sparklines',
    'get_funnel_sparklines_v2',
    'get_funnel_sparklines_v3'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = fn
       AND pg_get_function_identity_arguments(p.oid)
           = 'since_ts timestamp with time zone, until_ts timestamp with time zone'
     LIMIT 1;

    IF src IS NULL THEN
      RAISE EXCEPTION '% (since_ts, until_ts) not found — refusing to guess at its body', fn;
    END IF;

    next := src;
    changed := 0;

    -- (1) the window bounds. Idempotent: already-Berlin bodies skip.
    IF position(new_bounds IN next) = 0 THEN
      IF position(old_bounds IN next) = 0 THEN
        RAISE EXCEPTION
          'the day bounds in % do not match the expected text — the body has been edited since this migration was written; re-read it before re-running', fn;
      END IF;
      next := replace(next, old_bounds, new_bounds);
      changed := changed + 1;
    END IF;

    -- (2) + (3) the starts CTE, which only get_funnel_cvr_sparklines has.
    IF position(old_starts IN next) > 0 THEN
      next := replace(next, old_starts, new_starts);
      changed := changed + 1;
    ELSIF fn = 'get_funnel_cvr_sparklines' AND position(new_starts IN next) = 0 THEN
      RAISE EXCEPTION
        'the starts CTE in % does not match the expected text and is not already fixed — re-read it before re-running', fn;
    END IF;

    IF changed > 0 THEN
      IF next = src THEN
        RAISE EXCEPTION 'substitution on % produced an identical body — refusing a silent no-op', fn;
      END IF;
      EXECUTE next;
      RAISE NOTICE '% — % substitution(s) applied', fn, changed;
    ELSE
      RAISE NOTICE '% — already up to date', fn;
    END IF;

    -- (4) pin search_path. Separate from the body so it cannot disturb it, and
    -- unconditional because ALTER ... SET is idempotent.
    EXECUTE format(
      'ALTER FUNCTION public.%I(TIMESTAMPTZ, TIMESTAMPTZ) SET search_path = public, pg_temp', fn
    );
  END LOOP;
END
$migration$;

COMMENT ON FUNCTION public.get_funnel_cvr_sparklines(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Daily visitors/starts/completions/paid for the funnel sparklines, in BERLIN days. '
  '`visitors` is VISITOR-DAYS from funnel_event, not people; `starts` is survey '
  'sessions past question one. The two are different id spaces — the rate is starts '
  'per visit-day, and the digest labels it that way.';
