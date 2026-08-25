-- Per-day, per-arm conversion funnel for EVERY live A/B axis, so the daily Slack
-- digest can draw one trend chart per experiment instead of one for the landing
-- test only.
--
-- WHY A NEW RPC RATHER THAN EXTENDING WHAT EXISTS.
--   * get_landing_arm_funnel_daily (20260824190000) is per-day but LANDING ONLY.
--   * get_arm_cohorts covers all three axes but returns WINDOW TOTALS, so it
--     cannot draw a trend.
-- This is the intersection neither provides. It deliberately does NOT replace
-- either: the landing RPC also returns raw funnel_event visitor rows and the
-- revenue columns, which no chart needs.
--
-- ARM DERIVATION IS SHARED, NOT COPIED — with one honest exception.
--
-- The landing and survey arms come from tracker_arm(), the same function
-- get_arm_cohorts calls, so those two cannot drift apart on what an arm is. A
-- copy-pasted CASE would agree today and diverge on the next edit.
--
-- The PRICING arm is not a tracker value at all: it is a column on
-- report_price_quote, so "shared function" does not apply. Instead it uses the
-- identical expression get_arm_cohorts uses — COALESCE(experiment_group,
-- base_price_bucket) — so the two still cannot disagree. experiment_group is
-- authoritative and base_price_bucket is only a fallback: the two columns
-- disagree on 40 of the 331 submissions in the last 30 days, and the pricing
-- resyncs (20260727130000, 20260824120000) both key on experiment_group.
-- Measured 2026-08-25: experiment_group is populated for ALL 331, so the
-- fallback never fires today and the two RPCs return identical pricing totals.
--
-- Verified by hand on 2026-08-25 rather than by a test: asserting cross-RPC
-- parity needs a live database, and the integration suite is opt-in via
-- SUPABASE_TEST_URL. Re-run this if either RPC's arm derivation is edited:
--   SELECT axis, arm, SUM(completions) FROM get_axis_funnel_daily($1,$2)
--    GROUP BY 1,2;  -- must equal get_arm_cohorts($1,$2)'s n per (axis,arm)
--
-- COHORT ATTRIBUTION, NOT EVENT-DAY. Every stage is counted on the day the
-- SURVEY was finished, never the day the checkout or payment happened. That is
-- what makes `checkouts <= completions` true for every single row. Counting a
-- checkout on its own day lets a rate exceed 100% — yesterday's checkouts
-- against yesterday's completions are largely different people — and a funnel
-- that reads over 100% looks like a product bug rather than a measurement one.
--
-- THE DISTINCT TRAP. report_price_quote holds ONE ROW PER PLAN, so joining it
-- straight into the output grain multiplies every submission by its plan count:
-- measured, that turned 330 submissions into 1223. The `quote` CTE collapses to
-- one row per submission FIRST, which makes the outer COUNT(*) distinct by
-- construction — there is no DISTINCT keyword left for a future edit to forget.
--
-- `paid` reads report_price_quote.purchased_at, the same source as
-- get_landing_arm_funnel_daily's cohort paid count and as the numbers the
-- captions quote. Consent-free throughout: submissions, quotes and trackers are
-- all first-party server-side writes. analytics_event is deliberately untouched
-- (its report_viewed undercounts by ~31% behind the consent gate).
--
-- Arms are returned RAW, including tracker_arm's 'unknown'. The caller already
-- has an arm whitelist (isKnownArm) and relabelling here would hide the size of
-- the unattributable bucket. `paywall` is structurally absent: the axis list is
-- a literal VALUES clause, so no caller can chart a concluded experiment.
--
-- Half-open [since_ts, until_ts), and observed (axis, arm, day) triples only —
-- no generate_series spine, matching every other longitudinal RPC here. The
-- caller fills absent days as null gaps, which is what draws a break in the line
-- rather than a false zero.

CREATE OR REPLACE FUNCTION public.get_axis_funnel_daily(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS TABLE (
  axis        TEXT,
  arm         TEXT,
  day         DATE,
  completions INTEGER,
  checkouts   INTEGER,
  paid        INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  WITH cohort AS (
    SELECT ss.id,
           ss.created_date_time::date                    AS day,
           tracker_arm(ss.utm_tracker, 'landing_variant') AS landing_arm,
           tracker_arm(ss.utm_tracker, 'survey_variant')  AS survey_arm
      FROM survey_submission ss
     WHERE ss.status = 'completed'
       AND ss.created_date_time >= since_ts
       AND ss.created_date_time <  until_ts
  ),
  quote AS (
    SELECT q.survey_submission_id                     AS id,
           -- Same expression as get_arm_cohorts, so the two cannot disagree.
           MIN(COALESCE(q.experiment_group, q.base_price_bucket)) AS pricing_arm,
           COUNT(DISTINCT COALESCE(q.experiment_group, q.base_price_bucket)) AS arm_variants,
           bool_or(q.checkout_started_at IS NOT NULL) AS reached_checkout,
           bool_or(q.purchased_at IS NOT NULL)        AS reached_paid
      FROM report_price_quote q
     WHERE q.survey_submission_id IN (SELECT id FROM cohort)
     GROUP BY q.survey_submission_id
  ),
  tagged AS (
    SELECT c.id,
           c.day,
           v.axis,
           v.arm,
           COALESCE(q.reached_checkout, FALSE) AS reached_checkout,
           COALESCE(q.reached_paid, FALSE)     AS is_paid
      FROM cohort c
      LEFT JOIN quote q ON q.id = c.id
      CROSS JOIN LATERAL (
        VALUES
          ('landing', c.landing_arm),
          ('survey',  c.survey_arm),
          -- arm_variants > 1 would mean one submission's plans disagree on the
          -- pricing arm. It should be impossible; discarding it is honest,
          -- whereas MIN() would silently pick a side.
          ('pricing', CASE WHEN q.arm_variants = 1 THEN q.pricing_arm END)
      ) AS v(axis, arm)
     -- A submission with no arm on an axis is not IN that experiment, so it must
     -- not pad that axis's denominator. Pricing has none until the reader first
     -- opens their report and a quote is minted.
     WHERE v.arm IS NOT NULL
  )
  SELECT t.axis,
         t.arm,
         t.day,
         COUNT(*)::int                                    AS completions,
         COUNT(*) FILTER (WHERE t.reached_checkout)::int   AS checkouts,
         COUNT(*) FILTER (WHERE t.is_paid)::int            AS paid
    FROM tagged t
   GROUP BY t.axis, t.arm, t.day
   ORDER BY t.axis, t.arm, t.day;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, and SECURITY DEFINER
-- bypasses RLS. Twenty analytics RPCs were anon-callable until
-- 20260825130000 closed them; this one must not reopen the hole.
-- `authenticated` is revoked as well as `anon`: it is a real Supabase role that
-- any signed-in holder of the browser anon key carries, so leaving it callable
-- would have made this the one analytics RPC still reachable from a browser.
-- Matching 20260825130000 exactly, which revokes `FROM anon, authenticated`.
REVOKE EXECUTE ON FUNCTION public.get_axis_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_axis_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_axis_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
