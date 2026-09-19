-- "Midway Progress" — the funnel step that was agreed in words and never measured.
--
-- WHY THIS EXISTS. The 2026-09-16 sync settled the funnel language as
--   Landing Page Visits -> Survey Started -> MIDWAY PROGRESS -> Survey Completed
--   -> Report Opened -> Paywall Hits -> Purchase
-- and the KPI framework marked Midway Progress "needs building — the only funnel
-- step with no instrument at all".
--
-- That turned out to be half true, and the wrong half. The PROGRESS was already
-- recorded: `survey_partial_save.current_index` covered 1,044 sessions in the 30
-- days to 2026-09-19, against 656 starts and 411 completions, reaching index 59.
-- What was missing was the ARM. `utm_tracker` on that table carried marketing
-- UTMs only — utm_source, utm_medium, utm_campaign, utm_term, gclid, gbraid,
-- matchtype, network — on all 941 non-null rows, and no `landing_variant` on a
-- single one, because the arm was stamped at SUBMIT only. Submitting is the one
-- thing the mid-funnel population did not do, so the arm existed for everyone who
-- finished and nobody who dropped out. The stamp moved to the partial-save route
-- in the same change as this migration.
--
-- WHAT current_index ACTUALLY MEANS, and it is not quite "furthest reached".
-- `survey_partial_save` is upserted on `session_id`, so one row survives per
-- session: `current_index` is the position at the LAST save and `saved_at` is
-- when that save happened. A respondent who walks back a few questions before
-- abandoning therefore reports the lower index. Read it as WHERE THEY LEFT OFF,
-- which is the more useful fact for a drop-out question anyway, and as a slight
-- UNDER-count of how far they ever got. The over-count does not happen.
--
-- Because the row is upserted, a session started on Monday and abandoned on
-- Tuesday is counted on TUESDAY. The daily series is "sessions last seen that
-- day", not "sessions that began that day".
--
-- WHAT THE THRESHOLD IS. `midway_index` is a PARAMETER with no default, on
-- purpose. Where "midway" sits is a definition somebody has to choose, not a
-- constant, and a default would let it be chosen by accident and then quoted in a
-- meeting as though it had been decided. The survey ran ~59 questions on
-- 2026-09-19, so the literal midpoint is 30; at that threshold 583 of 1,044
-- sessions qualified, against 697 at index 10. Mark owns the choice.
--
-- TWO SHAPES, DELIBERATELY. `overall` is the whole population over the full
-- window and needs no arm, so it works from today and is what the digest's funnel
-- TABLE row uses. `daily`/`totals` are per-arm and are floored at the day the arm
-- stamp shipped, because before it every row would read 'unknown' and draw a
-- single enormous unknown arm that looks like data. Same situation, and the same
-- answer, as get_landing_start_funnel_daily: there is no history to recover,
-- because the history was never recorded.
--
-- Half-open [since_ts, until_ts), matching every other longitudinal RPC here.
-- Only observed (day, arm) pairs are emitted; callers fill gaps with ABSENT.

CREATE OR REPLACE FUNCTION get_midway_progress_daily(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ,
  midway_index INT
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  result JSON;
  -- The day the partial-save arm stamp shipped. Per-arm rows before it carry no
  -- landing_variant at all, so they are excluded rather than bucketed 'unknown'.
  first_arm_day CONSTANT DATE := DATE '2026-09-19';
  -- ::date on a timestamptz uses the SESSION TimeZone, so every boundary is
  -- pinned explicitly. EUROPE/BERLIN, not UTC, for two reasons.
  --
  -- First, the caller's window is Berlin midnight (`reportingDayStart`). Bucketed
  -- in UTC, `until_ts` of 2026-09-18T22:00Z becomes until_day 2026-09-18, and
  -- every row saved between 00:00Z and 22:00Z that same day passes the timestamp
  -- filter and then fails `day < until_day` — silently discarding the most recent
  -- TWENTY-TWO HOURS. The "Reached question N" row would be measured over 29d2h
  -- while Visits, Started and Finished beside it cover the full 30 days, which is
  -- exactly the different-windows failure the hasStarts guard exists to prevent.
  --
  -- Second, 20260915162358 moved get_axis_funnel_daily, get_landing_arm_funnel_daily
  -- and get_landing_start_funnel_daily from UTC to Berlin precisely because the
  -- digest prints them beside GA4 ad spend, whose property time zone is Berlin.
  -- This series is rendered in the same message on the same x-axis; a UTC day here
  -- would label a different 24 hours than the chart above it.
  --
  -- That migration verifies the invariant, but against a HARDCODED list of three
  -- function names, so it could never have caught this one.
  since_day DATE := (since_ts AT TIME ZONE 'Europe/Berlin')::date;
  until_day DATE := (until_ts AT TIME ZONE 'Europe/Berlin')::date;
  arm_since_day DATE := GREATEST((since_ts AT TIME ZONE 'Europe/Berlin')::date, first_arm_day);
BEGIN
  -- A threshold outside the survey is a caller bug, not a measurement. At 0 every
  -- draft "reaches midway" and the label reads "Reached question 0"; past the last
  -- question none do, and the funnel row is dropped while the per-arm block still
  -- prints "0 of 300 (0%)" — two surfaces disagreeing about the same number.
  IF midway_index IS NULL OR midway_index < 1 OR midway_index > 500 THEN
    RAISE EXCEPTION 'midway_index must be between 1 and 500, got %', midway_index;
  END IF;

  WITH in_window AS (
    SELECT
      (saved_at AT TIME ZONE 'Europe/Berlin')::date AS day,
      session_id,
      current_index,
      -- Reuses the repo's IMMUTABLE safe-parse rather than casting inline: a bare
      -- `utm_tracker::jsonb` throws on the first malformed blob and takes the whole
      -- report down with it, and the column is free text written from a browser.
      -- All three arguments passed explicitly, never relying on the DEFAULT.
      -- An arm-less row post-stamp is a real observation (no cookie: a crawler, a
      -- direct hit, a consent refusal) and is reported as 'unknown' rather than
      -- dropped, so the arms never silently fail to sum to the total. Coalesced
      -- HERE so nothing downstream has to group on an expression.
      COALESCE(
        admin_extract_utm_value(utm_tracker, 'landing_variant', false),
        'unknown'
      ) AS arm
    FROM survey_partial_save
    WHERE saved_at >= since_ts AND saved_at < until_ts
  ),
  per_arm_named AS (
    SELECT day,
           arm,
           COUNT(DISTINCT session_id)::int AS sessions,
           COUNT(DISTINCT session_id) FILTER (WHERE current_index >= midway_index)::int
             AS reached
      FROM in_window
     WHERE day >= arm_since_day AND day < until_day
     GROUP BY day, arm
  )
  SELECT json_build_object(
    -- Whole population, full window, no arm and no floor. This is the funnel
    -- TABLE row, and it is correct from the day this ships.
    'overall', (
      SELECT json_build_object(
               'sessions', COALESCE(COUNT(DISTINCT session_id), 0)::int,
               'reached',  COALESCE(
                             COUNT(DISTINCT session_id)
                               FILTER (WHERE current_index >= midway_index), 0)::int
             )
        FROM in_window
       WHERE day >= since_day AND day < until_day
    ),
    'daily', COALESCE((
      SELECT json_agg(json_build_object(
               'day',      to_char(p.day, 'YYYY-MM-DD'),
               'arm',      p.arm,
               'sessions', p.sessions,
               'reached',  p.reached
             ) ORDER BY p.day, p.arm)
        FROM per_arm_named p
    ), '[]'::json),
    'totals', COALESCE((
      SELECT json_agg(json_build_object(
               'arm',      t.arm,
               'sessions', t.sessions,
               'reached',  t.reached
             ) ORDER BY t.sessions DESC, t.arm)
        FROM (
          SELECT arm, SUM(sessions)::int AS sessions, SUM(reached)::int AS reached
            FROM per_arm_named
           GROUP BY arm
        ) t
    ), '[]'::json),
    -- Echoed back so a caller can never render a chart whose threshold differs
    -- from the one it asked for, and so the number is visible in the caption.
    'midwayIndex', midway_index,
    -- Callers render days before this as ABSENT, never as zero.
    'firstArmDay', to_char(first_arm_day, 'YYYY-MM-DD')
  ) INTO result;

  RETURN result;
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC, and SECURITY DEFINER bypasses
-- survey_partial_save's RLS (service_role_only, with EXECUTE revoked from anon
-- and authenticated) — so without these REVOKEs the daily draft volume and the
-- live landing A/B split are readable by anyone holding the published anon key.
-- Every sibling analytics RPC carries these three lines; this one shipped without
-- them, which is why they are worth restating rather than assuming.
REVOKE EXECUTE ON FUNCTION get_midway_progress_daily(TIMESTAMPTZ, TIMESTAMPTZ, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_midway_progress_daily(TIMESTAMPTZ, TIMESTAMPTZ, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_midway_progress_daily(TIMESTAMPTZ, TIMESTAMPTZ, INT) TO service_role;

COMMENT ON FUNCTION get_midway_progress_daily(TIMESTAMPTZ, TIMESTAMPTZ, INT) IS
  'Midway Progress for the conversion digest. overall = whole population, works '
  'today. daily/totals = per landing arm, floored at 2026-09-19 when the arm '
  'stamp reached survey_partial_save. midway_index has no default on purpose: it '
  'is a definition somebody chooses, not a constant.';
