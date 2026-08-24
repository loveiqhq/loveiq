-- Per-day, per-ARM landing -> survey-start, for the daily conversion digest.
--
-- WHY THIS EXISTS. A homepage decides whether a visitor STARTS a survey. It
-- barely touches whether someone who already finished a 60-question assessment
-- later buys — that is the report, the price and the paywall. The digest's only
-- per-arm chart was finished-survey -> paid, which is downstream of the homepage,
-- contaminated by the independently-randomised pricing test, and so low-powered
-- that a newly launched arm reads "too early" for weeks. This is the metric the
-- homepage actually controls.
--
-- WHAT IT COULD NOT MEASURE BEFORE. Two write-path defects, both fixed in the
-- same commit as this migration:
--   * the DENOMINATOR credited every unattributable visit to `white`. The arm is
--     resolved only on "/", but a visit is counted on any public page, so a first
--     entry via /survey, an invite link or an email deep-link — and every
--     cookieless client — was recorded as white. It now records `unknown`.
--   * the NUMERATOR had no arm at all. `survey_engine_mount` rows are written by
--     the client route, which never stored `landing_variant`. It does now.
--
-- CONSEQUENCE, AND IT MATTERS: per-arm data starts at this migration. There is no
-- history to recover, because the history was never recorded correctly. Callers
-- must render days before the fix as ABSENT, not as zero.
--
-- WHAT THE RATIO IS, EXACTLY. Numerator and denominator come from different id
-- spaces and cannot be joined:
--   * `unique_visitor` rows are written server-side with a throwaway random UUID
--     per visit, deduped per browser per day by a short-lived cookie. So the
--     denominator counts VISIT-DAYS.
--   * `survey_engine_mount` rows are written client-side keyed on the durable
--     visitor cookie. So the numerator counts BROWSERS that reached the survey.
-- The result is starts per visit-day, not a per-person conversion rate, and the
-- digest says so. This is the same shape the existing conversion funnel uses.
--
-- Consent-free: both event types are first-party aggregates written regardless of
-- analytics consent.
--
-- Half-open [since_ts, until_ts), matching every other longitudinal RPC here.
-- Only observed (day, arm) pairs are emitted; callers fill gaps with ABSENT.

CREATE OR REPLACE FUNCTION get_landing_start_funnel_daily(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  result JSON;
  -- ::date on a timestamptz uses the SESSION TimeZone. Pin it so the visit-day
  -- buckets cannot drift a day relative to the window on a non-UTC session.
  since_day DATE := (since_ts AT TIME ZONE 'UTC')::date;
  until_day DATE := (until_ts AT TIME ZONE 'UTC')::date;
BEGIN
  WITH visits AS (
    SELECT day,
           COALESCE(landing_variant, 'unknown') AS arm,
           COUNT(DISTINCT visitor_id)::int      AS n
      FROM funnel_event
     WHERE event_type = 'unique_visitor'
       AND day >= since_day AND day < until_day
     GROUP BY 1, 2
  ),
  starts AS (
    SELECT day,
           COALESCE(landing_variant, 'unknown') AS arm,
           COUNT(DISTINCT visitor_id)::int      AS n
      FROM funnel_event
     WHERE event_type = 'survey_engine_mount'
       AND day >= since_day AND day < until_day
     GROUP BY 1, 2
  ),
  day_arm AS (
    SELECT day, arm FROM visits
    UNION SELECT day, arm FROM starts
  )
  SELECT json_build_object(
    'daily', COALESCE((
      SELECT json_agg(json_build_object(
               'day',    to_char(da.day, 'YYYY-MM-DD'),
               'arm',    da.arm,
               'visits', COALESCE(v.n, 0),
               'starts', COALESCE(s.n, 0)
             ) ORDER BY da.day, da.arm)
        FROM day_arm da
        LEFT JOIN visits v ON v.day = da.day AND v.arm = da.arm
        LEFT JOIN starts s ON s.day = da.day AND s.arm = da.arm
    ), '[]'::json),
    -- Window totals per arm, for the chart's headline. Deliberately NOT a
    -- significance input: see the id-space note in the header — these are not
    -- two measurements of the same population.
    'totals', COALESCE((
      SELECT json_agg(json_build_object(
               'arm',    t.arm,
               'visits', t.visits,
               'starts', t.starts
             ) ORDER BY t.visits DESC, t.arm)
        FROM (
          -- Stacked then summed, rather than joined: an outer join on (arm, day)
          -- is correct here but only after reasoning about which side is null on
          -- an arm that has visits on one day and starts on another. This form
          -- cannot get that wrong.
          SELECT arm,
                 SUM(visits)::int AS visits,
                 SUM(starts)::int AS starts
            FROM (
              SELECT arm, n AS visits, 0 AS starts FROM visits
              UNION ALL
              SELECT arm, 0 AS visits, n AS starts FROM starts
            ) u
           GROUP BY arm
        ) t
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_landing_start_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
