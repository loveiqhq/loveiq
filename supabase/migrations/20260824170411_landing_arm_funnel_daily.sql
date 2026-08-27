-- Per-day, per-ARM conversion funnel for the landing A/B test, for the daily
-- Slack conversion digest.
--
-- WHY A NEW RPC. The existing per-variant source, get_funnel_cvr_sparklines
-- (20260614160000), cannot answer this:
--   * It splits on `landing_variant = 'white'` vs everything-else-as-'control',
--     which was round 1 (dark vs white). Round 2 is white vs white_prev, so its
--     "control" series silently became white_prev wearing a retired arm's name.
--   * Its white_checkout / white_paid series read prepaid_report_access — the
--     pay-first flow removed 2026-06-16 — so they are permanently zero.
-- Reviving anything built on it would post confidently wrong numbers daily.
--
-- WHAT THIS RETURNS, and why it is three arrays rather than one.
--
--   visitors[] {day, arm, n}
--     From funnel_event. This is the ONLY stage whose arm does not come from the
--     submission, and its history is not trustworthy: until the recordVisit.ts
--     fix shipped alongside this migration, white_prev was WRITTEN as 'control'.
--     Rows are returned RAW so the caller can see 'control' for what it is —
--     ambiguous (genuine June dark traffic OR post-2026-08-21 white_prev) — and
--     exclude it from arm comparison. Never relabel it.
--
--   daily[] {day, arm, completions, report_opens, checkout, paid, charges,
--            free_unlocks, revenue}
--     Event-day counts for the trend chart and the "yesterday" block: each stage
--     counted on the day it happened. Arm comes from the submission's utm_tracker
--     and is EXACT, including historically.
--
--   cohort[] {arm, completions, report_opens, checkout, paid, charges,
--             free_unlocks, revenue}
--     Submission-COHORT totals: of the people who completed inside the window,
--     how many ever went on to open / check out / pay, with NO upper bound on the
--     downstream date. This is the input to the significance test — an event-day
--     "paid" count would compare yesterday's payments against yesterday's
--     completions, which are mostly different people. Same reasoning as the quote
--     id-range join in app/api/admin/ab-overview/route.ts.
--
-- Consent-free throughout. Every stage is a first-party aggregate or a
-- server-side write: funnel_event, survey_submission, report_session,
-- report_price_quote, payment. analytics_event is deliberately NOT used — its
-- report_viewed undercounts report_session by ~31% (consent gate), which would
-- render as a drop-off that is really missing data.
--
-- Half-open [since_ts, until_ts), matching every other longitudinal RPC here.
-- Only observed (day, arm) pairs are emitted — no generate_series spine, because
-- the arm set is data-driven, not a fixed list. Callers fill gaps with zero.

-- The SQL mirror of readStampedArms (features/attribution/server/traffic.ts):
-- read the RAW stored arm, collapse nothing. Returns 'unknown' only when there is
-- genuinely no value — never a real arm's name.
CREATE OR REPLACE FUNCTION landing_arm_from_tracker(tracker TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
    NULLIF(
      TRIM(
        CASE
          -- pg_input_is_valid + jsonb_typeof rather than a bare ::jsonb cast: a
          -- malformed tracker would otherwise throw and take the whole digest
          -- down. classifyTraffic() tolerates malformed trackers, so they are a
          -- real possibility, and get_landing_variant_funnel's unguarded cast is
          -- a latent outage.
          WHEN tracker IS NULL OR tracker = '' THEN NULL
          WHEN NOT pg_input_is_valid(tracker, 'jsonb') THEN NULL
          WHEN jsonb_typeof(tracker::jsonb) <> 'object' THEN NULL
          ELSE (tracker::jsonb) ->> 'landing_variant'
        END
      ),
      ''
    ),
    'unknown'
  );
$$;

CREATE OR REPLACE FUNCTION get_landing_arm_funnel_daily(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  result JSON;
  since_day DATE := since_ts::date;
  until_day DATE := until_ts::date;
BEGIN
  WITH
  -- Stage 1: visitors. Arm is raw and, pre-fix, ambiguous. See header.
  visitors AS (
    SELECT day,
           COALESCE(landing_variant, 'unknown') AS arm,
           COUNT(DISTINCT visitor_id)::int      AS n
      FROM funnel_event
     WHERE event_type = 'unique_visitor'
       AND day >= since_day AND day < until_day
     GROUP BY 1, 2
  ),
  -- Submissions completed in the window, with their exact arm. The spine for
  -- every downstream stage, so a stage can never exceed its own cohort.
  subs AS (
    SELECT ss.id,
           ss.created_date_time::date              AS day,
           landing_arm_from_tracker(ss.utm_tracker) AS arm
      FROM survey_submission ss
     WHERE ss.status = 'completed'
       AND ss.created_date_time >= since_ts
       AND ss.created_date_time < until_ts
  ),
  -- Report opens, counted from report_session (server-side), on the open's day.
  opens AS (
    SELECT rs.started_at::date AS day,
           landing_arm_from_tracker(ss.utm_tracker) AS arm,
           COUNT(DISTINCT rs.personal_report_id)::int AS n
      FROM report_session rs
      JOIN personal_report pr  ON pr.id = rs.personal_report_id
      JOIN survey_submission ss ON ss.id = pr.survey_submission_id
     WHERE rs.started_at >= since_ts AND rs.started_at < until_ts
     GROUP BY 1, 2
  ),
  checkout AS (
    SELECT q.checkout_started_at::date AS day,
           landing_arm_from_tracker(ss.utm_tracker) AS arm,
           COUNT(DISTINCT q.survey_submission_id)::int AS n
      FROM report_price_quote q
      JOIN survey_submission ss ON ss.id = q.survey_submission_id
     WHERE q.checkout_started_at >= since_ts AND q.checkout_started_at < until_ts
     GROUP BY 1, 2
  ),
  paid AS (
    SELECT q.purchased_at::date AS day,
           landing_arm_from_tracker(ss.utm_tracker) AS arm,
           COUNT(DISTINCT q.survey_submission_id)::int AS n
      FROM report_price_quote q
      JOIN survey_submission ss ON ss.id = q.survey_submission_id
     WHERE q.purchased_at >= since_ts AND q.purchased_at < until_ts
     GROUP BY 1, 2
  ),
  -- Money. amount>0 vs amount=0 kept apart: EUR 0 rows are 100%-off coupons and
  -- post-call grants, and Stripe records no charge for them. Reporting them
  -- together implies paying customers who paid nothing.
  money AS (
    SELECT p.created_date_time::date AS day,
           landing_arm_from_tracker(ss.utm_tracker) AS arm,
           COUNT(*) FILTER (WHERE p.amount > 0)::int  AS charges,
           COUNT(*) FILTER (WHERE COALESCE(p.amount, 0) = 0)::int AS free_unlocks,
           COALESCE(SUM(p.amount) FILTER (WHERE p.amount > 0), 0)::numeric AS revenue
      FROM payment p
      JOIN personal_report pr   ON pr.id = p.personal_report_id
      JOIN survey_submission ss ON ss.id = pr.survey_submission_id
     WHERE p.status = 'succeeded'
       AND p.created_date_time >= since_ts
       AND p.created_date_time < until_ts
     GROUP BY 1, 2
  ),
  completions AS (
    SELECT day, arm, COUNT(*)::int AS n FROM subs GROUP BY 1, 2
  ),
  -- Every (day, arm) pair observed at ANY stage, so a stage with no completions
  -- that day still appears rather than vanishing from the series.
  day_arm AS (
    SELECT day, arm FROM completions
    UNION SELECT day, arm FROM opens
    UNION SELECT day, arm FROM checkout
    UNION SELECT day, arm FROM paid
    UNION SELECT day, arm FROM money
  ),
  -- COHORT: of the submissions completed in the window, how many EVER reached
  -- each later stage. No upper bound downstream — a purchase two weeks later
  -- still belongs to its cohort.
  cohort AS (
    SELECT s.arm,
           COUNT(*)::int AS completions,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM personal_report pr2
              JOIN report_session rs2 ON rs2.personal_report_id = pr2.id
             WHERE pr2.survey_submission_id = s.id
           ))::int AS report_opens,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM report_price_quote q2
             WHERE q2.survey_submission_id = s.id AND q2.checkout_started_at IS NOT NULL
           ))::int AS checkout,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM report_price_quote q2
             WHERE q2.survey_submission_id = s.id AND q2.purchased_at IS NOT NULL
           ))::int AS paid,
           COALESCE(SUM((
             SELECT COALESCE(SUM(p2.amount) FILTER (WHERE p2.amount > 0), 0)
               FROM personal_report pr3
               JOIN payment p2 ON p2.personal_report_id = pr3.id
              WHERE pr3.survey_submission_id = s.id AND p2.status = 'succeeded'
           )), 0)::numeric AS revenue
      FROM subs s
     GROUP BY s.arm
  )
  SELECT json_build_object(
    'visitors', COALESCE((
      SELECT json_agg(json_build_object(
               'day', to_char(v.day, 'YYYY-MM-DD'), 'arm', v.arm, 'n', v.n
             ) ORDER BY v.day, v.arm)
        FROM visitors v
    ), '[]'::json),
    'daily', COALESCE((
      SELECT json_agg(json_build_object(
               'day',          to_char(da.day, 'YYYY-MM-DD'),
               'arm',          da.arm,
               'completions',  COALESCE(c.n, 0),
               'report_opens', COALESCE(o.n, 0),
               'checkout',     COALESCE(ck.n, 0),
               'paid',         COALESCE(pd.n, 0),
               'charges',      COALESCE(m.charges, 0),
               'free_unlocks', COALESCE(m.free_unlocks, 0),
               'revenue',      COALESCE(m.revenue, 0)
             ) ORDER BY da.day, da.arm)
        FROM day_arm da
        LEFT JOIN completions c ON c.day = da.day AND c.arm = da.arm
        LEFT JOIN opens o       ON o.day  = da.day AND o.arm  = da.arm
        LEFT JOIN checkout ck   ON ck.day = da.day AND ck.arm = da.arm
        LEFT JOIN paid pd       ON pd.day = da.day AND pd.arm = da.arm
        LEFT JOIN money m       ON m.day  = da.day AND m.arm  = da.arm
    ), '[]'::json),
    'cohort', COALESCE((
      SELECT json_agg(json_build_object(
               'arm',          ch.arm,
               'completions',  ch.completions,
               'report_opens', ch.report_opens,
               'checkout',     ch.checkout,
               'paid',         ch.paid,
               'revenue',      ch.revenue
             ) ORDER BY ch.completions DESC, ch.arm)
        FROM cohort ch
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION landing_arm_from_tracker(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_landing_arm_funnel_daily(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ---------------------------------------------------------------------------
-- Per-AXIS arm cohorts, for the digest's verdict block.
--
-- The funnel above is landing-only (that is what "conversion funnels for landing
-- pages" asked for), but a verdict is far more useful across every live axis, so
-- this returns the two numbers a significance test needs — the arm's denominator
-- and its conversions — for landing, survey and pricing at once.
--
-- COHORT semantics again: `paid` is "of the people who completed in this window,
-- how many ever paid", with no upper bound on the payment date. Comparing
-- yesterday's payments against yesterday's completions would compare two mostly
-- disjoint sets of people.
--
-- Arms are RAW. `landing_arm_from_tracker` / `tracker_arm` collapse nothing, so a
-- retired arm arrives as itself and the caller drops it via armLabel().retired
-- rather than having it silently folded into a live arm.
-- ---------------------------------------------------------------------------

-- Generic form of the tracker reader; `landing_arm_from_tracker` now delegates to
-- it so the JSON-safety guards live in exactly one place.
CREATE OR REPLACE FUNCTION tracker_arm(tracker TEXT, field TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
    NULLIF(
      TRIM(
        CASE
          WHEN tracker IS NULL OR tracker = '' THEN NULL
          WHEN NOT pg_input_is_valid(tracker, 'jsonb') THEN NULL
          WHEN jsonb_typeof(tracker::jsonb) <> 'object' THEN NULL
          ELSE (tracker::jsonb) ->> field
        END
      ),
      ''
    ),
    'unknown'
  );
$$;

CREATE OR REPLACE FUNCTION landing_arm_from_tracker(tracker TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT tracker_arm(tracker, 'landing_variant');
$$;

CREATE OR REPLACE FUNCTION get_arm_cohorts(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  result JSON;
BEGIN
  WITH subs AS (
    SELECT ss.id,
           tracker_arm(ss.utm_tracker, 'landing_variant') AS landing_arm,
           tracker_arm(ss.utm_tracker, 'survey_variant')  AS survey_arm,
           -- experiment_group is frozen per reader, not per plan, so any quote
           -- carries it. COALESCE to the legacy bucket for pre-2.0 rows, matching
           -- ab-overview's `experiment_group ?? base_price_bucket`.
           COALESCE(
             (SELECT COALESCE(q.experiment_group, q.base_price_bucket)
                FROM report_price_quote q
               WHERE q.survey_submission_id = ss.id
                 AND COALESCE(q.experiment_group, q.base_price_bucket) IS NOT NULL
               ORDER BY q.created_date_time ASC
               LIMIT 1),
             'unknown'
           ) AS pricing_arm,
           EXISTS (
             SELECT 1 FROM report_price_quote q2
             WHERE q2.survey_submission_id = ss.id AND q2.purchased_at IS NOT NULL
           ) AS ever_paid
      FROM survey_submission ss
     WHERE ss.status = 'completed'
       AND ss.created_date_time >= since_ts
       AND ss.created_date_time < until_ts
  ),
  unpivoted AS (
    SELECT 'landing'::text AS axis, landing_arm AS arm, ever_paid FROM subs
    UNION ALL
    SELECT 'survey', survey_arm, ever_paid FROM subs
    UNION ALL
    SELECT 'pricing', pricing_arm, ever_paid FROM subs
  )
  SELECT COALESCE(json_agg(json_build_object(
           'axis', axis,
           'arm',  arm,
           'n',    n,
           'conversions', conversions
         ) ORDER BY axis, conversions DESC, arm), '[]'::json)
    INTO result
    FROM (
      SELECT axis, arm,
             COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE ever_paid)::int AS conversions
        FROM unpivoted
       GROUP BY axis, arm
    ) g;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION tracker_arm(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_arm_cohorts(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
