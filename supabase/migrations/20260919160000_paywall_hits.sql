-- Paywall Hits — Mark's sixth funnel step, counted in PEOPLE.
--
-- WHY THIS REPLACES A HEAD COUNT. The first version of this step counted rows:
--   HEAD /rest/v1/report_price_quote?paywall_reached_at=gte.X&...
-- which returned 500 for a 30-day window and was printed as "500 people hit the
-- paywall". It is not 500 people. `report_price_quote` writes ONE ROW PER PLAN,
-- so the same person appears four times — measured 2026-09-19, avg 4.00 quotes
-- per submission and max 4. The real figure for that window is 109.
--
-- The inflated number then exceeded the row above it (412 report opens), so the
-- funnel's monotonic clamp pulled it back down to 412 and the table printed
-- "412 · 100%" — a fabricated "every single person who opened their report hit
-- the paywall", derived from a number that was 4x too big in the first place.
-- That is exactly the unsourceable figure the 2026-09-16 sync was called about.
-- PostgREST has no COUNT(DISTINCT), which is why avoiding a migration produced
-- the bug: the shortcut could only count rows.
--
-- COHORT-SCOPED, like every row below "Finished the survey". Those rows are
-- labelled "…of those" and follow the people who finished IN the window forward
-- with no end date, so the paywall step filters on the SUBMISSION's date, not on
-- when the paywall was reached. Counting paywall events by their own timestamp
-- instead mixes in people who finished the survey last month, which is the same
-- period-vs-cohort mismatch that makes report opens read 117.7%.
--
-- The instrument only began writing on 2026-09-05, so `first_row_day` comes back
-- with the count: over a 30-day window this step covers far less than 30 days,
-- and a caller that presents it as a full-window figure is quietly wrong in the
-- flattering direction.

CREATE OR REPLACE FUNCTION get_paywall_hits(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    -- DISTINCT submission: one person, however many plan quotes they were shown.
    -- BOTH signals, like every other paywall stage in this schema.
    --
    -- 20260905182829 and 20260905190406 rewrote the production funnel RPCs to
    -- count this step as a UNION of `report_price_quote.paywall_reached_at` (the
    -- newer server-side signal) and `analytics_event.paywall_initiated` (the
    -- older client one), precisely because one source alone was insufficient.
    -- The first version of this function used the quote signal only and
    -- under-reported by 22 people in 128 — 17% — against every other paywall
    -- number the team can pull. `conversion-digest.ts` opens by naming that exact
    -- failure: two surfaces computing the same metric differently.
    'hits', (
      SELECT COUNT(*)::int FROM (
        SELECT DISTINCT s.id
          FROM survey_submission s
         WHERE s.created_date_time >= since_ts
           AND s.created_date_time <  until_ts
           AND (
             EXISTS (SELECT 1 FROM report_price_quote q
                      WHERE q.survey_submission_id = s.id
                        AND q.paywall_reached_at IS NOT NULL)
             OR
             EXISTS (SELECT 1 FROM analytics_event a
                      WHERE a.survey_submission_id = s.id
                        AND a.event_type = 'paywall_initiated')
           )
      ) reached
    ),
    -- The earliest day EITHER signal wrote anything. The caller needs it to say
    -- how much of its window this step actually covers — the quote signal only
    -- began on 2026-09-05, so a 30-day window is really a 12-day one.
    'firstRowDay', (
      SELECT to_char(MIN(t) AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD')
        FROM (
          SELECT MIN(paywall_reached_at) AS t FROM report_price_quote
           WHERE paywall_reached_at IS NOT NULL
          UNION ALL
          SELECT MIN(event_time) FROM analytics_event WHERE event_type = 'paywall_initiated'
        ) f
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC, and SECURITY DEFINER bypasses the
-- RLS on report_price_quote and survey_submission — so without these REVOKEs the
-- paywall funnel is readable by anyone holding the published anon key.
REVOKE EXECUTE ON FUNCTION get_paywall_hits(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_paywall_hits(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION get_paywall_hits(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION get_paywall_hits(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Paywall Hits in PEOPLE, cohort-scoped on the submission date, counting BOTH the '
  'quote signal and analytics_event.paywall_initiated — the same union the production '
  'funnel RPCs use. report_price_quote holds one row per plan, so a row count is 4x.';
