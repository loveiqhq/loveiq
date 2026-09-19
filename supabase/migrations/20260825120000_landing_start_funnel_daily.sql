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
-- CONSENT IS ASYMMETRIC, and this is a known limitation rather than a property.
-- The denominator (`unique_visitor`) is written server-side with a throwaway id
-- and no consent check. The numerator (`survey_engine_mount`) is written by the
-- client only when `__liq_vid` exists, and proxy.ts mints that cookie only under
-- analytics consent — so the numerator is gated and the denominator is not, and
-- the ratio is understated by roughly the consent-refusal rate. It need not even
-- cancel between arms, because the cookie banner is part of the landing
-- experience and the two arms are different landings. The chart says so in its
-- caption; the fix is to write the survey-reached signal server-side too.
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
  -- Floored at the first day BOTH sides were instrumented.
  --
  -- Without this the chart draws a solid measured 0% across almost the whole
  -- window instead of a gap, and the caller cannot detect it: `unique_visitor`
  -- rows have carried `landing_variant` since 2026-06-14, so the DENOMINATOR
  -- exists for every past day, while the numerator (`survey_engine_mount`) only
  -- began carrying an arm at this deploy. The caller gaps a day only when its
  -- visits are missing, so it sees visits>0, starts=0 and plots a real zero. The
  -- headline is worse: it sums a post-deploy numerator over a 30-day
  -- denominator, understating the rate by roughly the window length.
  --
  -- 08-26, not 08-25: on the deploy day itself, a browser that pinged with the
  -- old bundle wrote an arm-less row, and the client insert uses
  -- `resolution=ignore-duplicates` against a (visitor_id, day, event_type) key —
  -- so that arm-less row wins for the rest of that UTC day. It self-heals the
  -- next day, because `day` is part of the key.
  first_instrumented_day CONSTANT DATE := DATE '2026-08-26';
  since_day DATE := GREATEST((since_ts AT TIME ZONE 'UTC')::date, first_instrumented_day);
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

-- CREATE FUNCTION grants EXECUTE to PUBLIC, and SECURITY DEFINER bypasses
-- funnel_event's RLS — so without these REVOKEs the daily traffic volume and the
-- live A/B split are readable by anyone holding the published anon key.
REVOKE EXECUTE ON FUNCTION get_landing_start_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_landing_start_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_landing_start_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
