-- Forced-paywall A/B experiment — one-call per-arm analysis RPC
--
-- The coupled 50/50 split ("report-forced-paywall") is keyed on the report
-- token. Treatment = swapped wizard final slide + non-closable flip-card
-- paywall; control = closable scroll modal. Every behavioral analytics_event
-- row self-tags the arm in metadata->>'forced_paywall_arm' (set client-side via
-- setForcedPaywallArm); every payment row carries it in
-- metadata->>'forcedPaywallArm' (stamped server-side at checkout-session
-- creation — consent-independent).
--
-- This RPC returns BOTH arms in one JSON object so the strategy lead can pull
-- the full funnel + revenue comparison with a single call:
--   select get_forced_paywall_ab('2026-06-01T00:00:00Z', '2026-07-01T00:00:00Z');
--
-- Conventions match the existing strategy-funnel RPCs
-- (20260527130000_strategy_funnel_rpcs.sql): half-open [since, until) window,
-- SECURITY DEFINER + GRANT EXECUTE TO service_role, COALESCE so the shape is
-- always present (zeros, never NULL), read-only, never throws.
--
-- CAVEATS (for whoever reads the numbers):
--   * Behavioral counts (wizard_exposed … paywall_unlocked) come from
--     analytics_event, which is analytics-consent-gated — consent-decliners are
--     absent. The ARM RATIO stays valid (assignment is consent-independent);
--     absolute behavioral counts undercount.
--   * Purchase/revenue come from `payment` and are NOT consent-gated.
--   * `revenue` is gross of 100%-coupon / admin test rows; `paid_purchases`
--     (amount > 0) is the de-noised purchase count for true conversion.
--   * Behavioral stages are COUNT(DISTINCT survey_submission_id); purchase
--     stages are row counts on `payment`.

CREATE OR REPLACE FUNCTION get_forced_paywall_ab(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER
-- Pin search_path so this SECURITY DEFINER function can't be hijacked by a
-- caller-controlled schema shadowing analytics_event / payment (Supabase
-- linter 0011; stricter than the older strategy-funnel RPCs).
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  WITH ev AS (
    SELECT
      metadata->>'forced_paywall_arm' AS arm,
      event_type,
      metadata->>'surface'            AS surface,
      survey_submission_id
    FROM analytics_event
    WHERE event_time >= since_ts
      AND event_time <  until_ts
      AND survey_submission_id IS NOT NULL
      AND metadata->>'forced_paywall_arm' IN ('treatment', 'control')
  ),
  beh AS (
    SELECT
      arm,
      COUNT(DISTINCT survey_submission_id) FILTER (
        WHERE event_type = 'experiment_exposure' AND surface = 'pre_report_wizard'
      ) AS wizard_exposed,
      COUNT(DISTINCT survey_submission_id) FILTER (
        WHERE event_type = 'experiment_exposure' AND surface = 'report_scroll_paywall'
      ) AS report_exposed,
      COUNT(DISTINCT survey_submission_id) FILTER (WHERE event_type = 'report_viewed')           AS report_viewed,
      COUNT(DISTINCT survey_submission_id) FILTER (WHERE event_type = 'scroll_paywall_shown')     AS paywall_shown,
      COUNT(DISTINCT survey_submission_id) FILTER (WHERE event_type = 'experiment_card_flipped')  AS card_flipped,
      COUNT(DISTINCT survey_submission_id) FILTER (WHERE event_type = 'scroll_paywall_dismissed') AS paywall_dismissed,
      COUNT(DISTINCT survey_submission_id) FILTER (WHERE event_type = 'begin_checkout')           AS begin_checkout,
      COUNT(DISTINCT survey_submission_id) FILTER (WHERE event_type = 'paywall_unlocked')         AS paywall_unlocked
    FROM ev
    GROUP BY arm
  ),
  pay AS (
    SELECT
      metadata->>'forcedPaywallArm' AS arm,
      COUNT(*) FILTER (WHERE status = 'succeeded')                            AS purchases,
      COUNT(*) FILTER (WHERE status = 'succeeded' AND amount > 0)             AS paid_purchases,
      COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded'), 0)            AS revenue,
      -- A "refund" is ANY row with money returned: a full refund (the app sets
      -- status='refunded') OR a partial refund (the app KEEPS status='succeeded'
      -- and writes a non-zero refund_amount — see fulfillment.ts). Keying both
      -- the count and the $ total on refund_amount > 0 keeps them consistent and
      -- captures the partial buyer's-remorse refunds a forced paywall can induce.
      COUNT(*) FILTER (WHERE refund_amount > 0)                              AS refunds,
      COALESCE(SUM(refund_amount) FILTER (WHERE refund_amount > 0), 0)        AS refund_amount,
      COUNT(*) FILTER (WHERE status = 'disputed')                            AS disputes
    FROM payment
    WHERE created_date_time >= since_ts
      AND created_date_time <  until_ts
      AND metadata->>'forcedPaywallArm' IN ('treatment', 'control')
    GROUP BY metadata->>'forcedPaywallArm'
  ),
  asn AS (
    -- Consent-independent denominator: report_price_quote is created server-side
    -- per report (no analytics-consent gate), one row per plan → DISTINCT the
    -- submission. This is "assigned to arm X" = the unbiased CVR denominator
    -- (analyst computes CVR = paid_purchases / assigned).
    -- Windowed by the quote's created_date_time (when the user first reached
    -- pricing). Set [since,until) to start at experiment launch: the
    -- forced_paywall_arm column was added at launch, so no in-experiment quote
    -- predates the window, and `assigned` and `paid_purchases` cohort cleanly.
    SELECT
      forced_paywall_arm AS arm,
      COUNT(DISTINCT survey_submission_id) AS assigned
    FROM report_price_quote
    WHERE created_date_time >= since_ts
      AND created_date_time <  until_ts
      AND forced_paywall_arm IN ('treatment', 'control')
    GROUP BY forced_paywall_arm
  ),
  arms AS (
    SELECT unnest(ARRAY['treatment', 'control']) AS arm
  )
  SELECT json_object_agg(
    a.arm,
    json_build_object(
      'assigned',          COALESCE(s.assigned, 0),
      'wizard_exposed',    COALESCE(b.wizard_exposed, 0),
      'report_exposed',    COALESCE(b.report_exposed, 0),
      'report_viewed',     COALESCE(b.report_viewed, 0),
      'paywall_shown',     COALESCE(b.paywall_shown, 0),
      'card_flipped',      COALESCE(b.card_flipped, 0),
      'paywall_dismissed', COALESCE(b.paywall_dismissed, 0),
      'begin_checkout',    COALESCE(b.begin_checkout, 0),
      'paywall_unlocked',  COALESCE(b.paywall_unlocked, 0),
      'purchases',         COALESCE(p.purchases, 0),
      'paid_purchases',    COALESCE(p.paid_purchases, 0),
      'revenue',           ROUND(COALESCE(p.revenue, 0), 2),
      'refunds',           COALESCE(p.refunds, 0),
      'refund_amount',     ROUND(COALESCE(p.refund_amount, 0), 2),
      'disputes',          COALESCE(p.disputes, 0)
    )
  )
  INTO result
  FROM arms a
  LEFT JOIN beh b ON b.arm = a.arm
  LEFT JOIN pay p ON p.arm = a.arm
  LEFT JOIN asn s ON s.arm = a.arm;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_forced_paywall_ab(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
