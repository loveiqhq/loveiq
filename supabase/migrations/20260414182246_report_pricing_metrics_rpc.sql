CREATE OR REPLACE FUNCTION public.get_report_pricing_metrics(
  since_ts timestamptz DEFAULT NULL,
  plan_filter text DEFAULT NULL
)
RETURNS TABLE (
  plan text,
  experiment_group text,
  pricing_cluster_id text,
  base_price_bucket text,
  country_tier text,
  device_type text,
  traffic_source text,
  behavioral_bucket text,
  engagement_band text,
  discount_step integer,
  quoted_count bigint,
  checkout_started_count bigint,
  purchased_count bigint,
  conversion_rate numeric,
  revenue_eur numeric,
  rpcs_eur numeric,
  avg_initial_price_eur numeric,
  avg_current_price_eur numeric,
  avg_discount_multiplier numeric,
  first_quote_at timestamptz,
  last_quote_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered_quotes AS (
    SELECT *
    FROM public.report_price_quote
    WHERE (since_ts IS NULL OR created_date_time >= since_ts)
      AND (plan_filter IS NULL OR plan = plan_filter)
  ),
  successful_payments AS (
    SELECT
      pricing_quote_id,
      SUM(COALESCE(amount, 0)) AS revenue_eur
    FROM public.payment
    WHERE status = 'succeeded'
      AND pricing_quote_id IS NOT NULL
    GROUP BY pricing_quote_id
  )
  SELECT
    quote.plan,
    quote.experiment_group,
    quote.pricing_cluster_id,
    quote.base_price_bucket,
    quote.country_tier,
    quote.device_type,
    quote.traffic_source,
    quote.behavioral_bucket,
    CASE
      WHEN quote.engagement_score >= 40 THEN 'engaged'
      ELSE 'standard'
    END AS engagement_band,
    quote.discount_step,
    COUNT(*)::bigint AS quoted_count,
    COUNT(*) FILTER (WHERE quote.checkout_started_at IS NOT NULL)::bigint AS checkout_started_count,
    COUNT(payment.pricing_quote_id)::bigint AS purchased_count,
    ROUND(
      CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE (COUNT(payment.pricing_quote_id)::numeric / COUNT(*)::numeric) * 100
      END,
      2
    ) AS conversion_rate,
    ROUND(COALESCE(SUM(payment.revenue_eur), 0)::numeric, 2) AS revenue_eur,
    ROUND(
      CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE COALESCE(SUM(payment.revenue_eur), 0)::numeric / COUNT(*)::numeric
      END,
      2
    ) AS rpcs_eur,
    ROUND(AVG(quote.initial_price)::numeric, 2) AS avg_initial_price_eur,
    ROUND(AVG(quote.current_price)::numeric, 2) AS avg_current_price_eur,
    ROUND(AVG(quote.discount_multiplier)::numeric, 4) AS avg_discount_multiplier,
    MIN(quote.created_date_time) AS first_quote_at,
    MAX(quote.created_date_time) AS last_quote_at
  FROM filtered_quotes AS quote
  LEFT JOIN successful_payments AS payment
    ON payment.pricing_quote_id = quote.id
  GROUP BY
    quote.plan,
    quote.experiment_group,
    quote.pricing_cluster_id,
    quote.base_price_bucket,
    quote.country_tier,
    quote.device_type,
    quote.traffic_source,
    quote.behavioral_bucket,
    CASE
      WHEN quote.engagement_score >= 40 THEN 'engaged'
      ELSE 'standard'
    END,
    quote.discount_step
  ORDER BY revenue_eur DESC, quoted_count DESC, pricing_cluster_id ASC;
$$;
