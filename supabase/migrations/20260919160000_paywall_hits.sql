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
    'hits', (
      SELECT COUNT(DISTINCT q.survey_submission_id)::int
        FROM report_price_quote q
        JOIN survey_submission s ON s.id = q.survey_submission_id
       WHERE q.paywall_reached_at IS NOT NULL
         AND s.created_date_time >= since_ts
         AND s.created_date_time <  until_ts
    ),
    -- First day the instrument ever wrote anything, so the caller can say how
    -- much of its window this step actually covers.
    'firstRowDay', (
      SELECT to_char(MIN(paywall_reached_at) AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD')
        FROM report_price_quote
       WHERE paywall_reached_at IS NOT NULL
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
  'Paywall Hits in PEOPLE, cohort-scoped on the submission date. report_price_quote '
  'holds one row per plan (4 per person), so a row count over-reports by 4x.';
