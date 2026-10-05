-- The price chart was counting our own test purchases as conversions.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IT LOOKED LIKE. On 2026-09-07 `get_bucket_performance` returned, for
-- price bucket A:
--
--     shown: 2      purchases: 32
--
-- Thirty-two sales from two people who were shown the price. That is the
-- device-matrix test run — 34 test-mode unlocks redeemed with a 100%-off code
-- on a single day, the same spike that put 35 purchases into GA4 and was
-- guarded there on 2026-09-09. Nothing guarded it here.
--
-- Drawn as a rate it clamps to 100%, and because the chart shares one y-scale
-- across rows it then set the scale for the price beside it — a real 6.7%
-- squashed onto the baseline by a week of our own testing.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- THREE DEFECTS, all in the `purch` CTE.
--
-- 1. NO is_test FILTER. `WHERE p.status='succeeded'` and nothing else, so every
--    staff test unlock counted. The sibling RPC `get_landing_arm_funnel_daily`
--    has excluded these since 2026-09-15; this one was missed.
--
-- 2. EUR 0 COMPS COUNTED AS SALES. Same rule as the decision recorded
--    2026-09-19: a coupon unlock is a report and is not a sale. `amount > 0` is
--    the discriminator, and revenue is summed over the same filter so the two
--    cannot disagree.
--
-- 3. PAYMENT ROWS AGAINST A DENOMINATOR OF PEOPLE. `shown` counts
--    `COUNT(DISTINCT survey_submission_id)`; `purch` counted `COUNT(*)` of
--    payment rows. One person with two payment rows made the rate exceed 100%
--    without any test data at all — which is how 2026-08-30 produced
--    `shown: 0, purchases: 2`. Now both sides count distinct submissions.
--
-- And the day bounds: `since_ts::date` resolves against the SESSION TimeZone
-- (UTC on the pooler) while every caller passes Berlin midnight, so the window
-- landed a day early — the same defect fixed in the sparkline RPCs by
-- 20260919180000. Fixed here for the same reason.
--
-- `search_path` is pinned while the body is being rewritten anyway; this
-- function is one of the 23 in 20260919190000.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT DOES NOT CHANGE: `shown` still counts `price_shown` analytics events,
-- which are client-posted and therefore consent-gated. So this rate has a
-- complete-ish numerator over a consent-gated denominator, which biases it
-- UPWARD. That is a different problem, it cannot be fixed in this query, and
-- the chart's caption is where it belongs.

CREATE OR REPLACE FUNCTION public.get_bucket_performance(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  result JSON;
  -- Berlin, not the session TimeZone. See the note above.
  since_day DATE := (since_ts AT TIME ZONE 'Europe/Berlin')::date;
  until_day DATE := (until_ts AT TIME ZONE 'Europe/Berlin')::date;
BEGIN
  WITH days AS (
    SELECT d::date AS day
      FROM generate_series(since_day, until_day - INTERVAL '1 day', INTERVAL '1 day') AS d
  ),
  shown AS (
    SELECT (event_time AT TIME ZONE 'Europe/Berlin')::date AS day,
           LOWER(TRIM(metadata->>'bucket')) AS bucket,
           COUNT(DISTINCT survey_submission_id)::int AS n
      FROM analytics_event
     WHERE event_type = 'price_shown'
       AND event_time >= since_ts
       AND event_time <  until_ts
       AND metadata ? 'bucket'
       AND NULLIF(TRIM(metadata->>'bucket'), '') IS NOT NULL
     GROUP BY 1, 2
  ),
  purch AS (
    SELECT (p.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day,
           LOWER(TRIM(rpq.base_price_bucket)) AS bucket,
           -- DISTINCT SUBMISSIONS, matching `shown`'s unit. COUNT(*) of payment
           -- rows against a denominator of people is how a rate passes 100%.
           COUNT(DISTINCT rpq.survey_submission_id)::int AS purchases,
           COALESCE(SUM(p.amount), 0)::numeric(12, 2) AS revenue
      FROM payment p
      JOIN report_price_quote rpq ON rpq.id = p.pricing_quote_id
     WHERE p.status = 'succeeded'
       -- Our own testing is not a conversion.
       AND NOT p.is_test
       -- A EUR 0 coupon unlock is a report and is not a sale.
       AND p.amount > 0
       AND p.created_date_time >= since_ts
       AND p.created_date_time <  until_ts
       AND NULLIF(TRIM(rpq.base_price_bucket), '') IS NOT NULL
     GROUP BY 1, 2
  ),
  per_bucket_day AS (
    SELECT day, bucket, SUM(shown_n) AS shown, SUM(purch_n) AS purchases, SUM(rev) AS revenue
      FROM (
        SELECT day, bucket, n AS shown_n, 0 AS purch_n, 0::numeric AS rev FROM shown
        UNION ALL
        SELECT day, bucket, 0, purchases, revenue FROM purch
      ) u
     GROUP BY day, bucket
  )
  SELECT json_build_object('days', COALESCE((
    SELECT json_agg(json_build_object(
             'day', to_char(days.day, 'YYYY-MM-DD'),
             'buckets', COALESCE((
               SELECT json_object_agg(
                        bucket,
                        json_build_object('shown', shown, 'purchases', purchases, 'revenue', revenue)
                      )
                 FROM per_bucket_day pbd
                WHERE pbd.day = days.day
             ), '{}'::json)
           ) ORDER BY days.day)
      FROM days
  ), '[]'::json)) INTO result;

  RETURN result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_bucket_performance(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_bucket_performance(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_bucket_performance(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.get_bucket_performance(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Per-price-bucket shown/purchases/revenue by BERLIN day. `purchases` is '
  'distinct submissions with a succeeded, non-test payment above zero — our own '
  'test unlocks and EUR 0 comps are excluded. `shown` comes from client-posted '
  'price_shown events and is therefore consent-gated, so the rate is biased '
  'upward; say so wherever it is charted.';
