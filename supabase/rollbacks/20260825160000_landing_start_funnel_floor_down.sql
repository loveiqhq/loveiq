-- Rollback for 20260825160000_landing_start_funnel_floor.
--
-- Restores the 2026-08-26 floor by re-applying the previous definition. Apply:
--   psql "$DATABASE_URL" -f supabase/rollbacks/20260825160000_landing_start_funnel_floor_down.sql
--
-- Effect: 2026-08-25 disappears from the series again, which delays the
-- landing -> survey-start chart by one run. Nothing else changes.

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
