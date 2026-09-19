-- ═══════════════════════════════════════════════════════════════════════════
-- get_landing_variant_funnel — white-vs-control landing A/B conversion comparison
-- for the admin Funnels dashboard ("Landing A/B" tab).
--
-- Per landing variant ("white" = new pay-first white landing, "control" = the
-- original dark landing) it returns:
--   • completed — completed survey submissions
--   • paid      — succeeded payments
--   • revenue   — sum of paid amounts (major currency units, e.g. EUR)
--
-- Variant source of truth is the SUBMISSION's utm_tracker JSON (stamped on submit
-- in app/api/survey/route.ts); paid joins payment → personal_report →
-- survey_submission so revenue is attributed to the landing the buyer first saw.
-- Anything not explicitly "white" (null / missing / pre-feature) folds into
-- "control" — the original dark experience.
--
-- Raw visitor/traffic counts are intentionally NOT here: landing-page exposures
-- are never persisted server-side (persistAnalyticsEvent requires a submission
-- context, which the landing page lacks), so GA4 holds the full traffic split
-- (segment by the `landing_variant` user property). The A/B is ~50/50, so
-- completed VOLUME is a fair top-funnel proxy and paid RATE is the monetisation
-- signal.
--
-- SECURITY DEFINER + locked search_path, granted to service_role (admin reads run
-- through the service role), mirroring the other admin analytics RPCs.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_landing_variant_funnel(since_ts timestamptz)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH bounds AS (
    SELECT COALESCE(since_ts, '2000-01-01'::timestamptz) AS since
  ),
  variants(variant) AS (VALUES ('white'), ('control')),
  comp AS (
    SELECT
      CASE WHEN (NULLIF(ss.utm_tracker, '')::jsonb)->>'landing_variant' = 'white'
           THEN 'white' ELSE 'control' END AS variant,
      COUNT(*)::int AS completed
    FROM survey_submission ss
    CROSS JOIN bounds
    WHERE ss.status = 'completed'
      AND ss.created_date_time >= bounds.since
    GROUP BY 1
  ),
  pay AS (
    SELECT
      CASE WHEN (NULLIF(ss.utm_tracker, '')::jsonb)->>'landing_variant' = 'white'
           THEN 'white' ELSE 'control' END AS variant,
      COUNT(*)::int AS paid,
      COALESCE(SUM(p.amount), 0)::numeric AS revenue
    FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
    JOIN survey_submission ss ON ss.id = pr.survey_submission_id
    CROSS JOIN bounds
    WHERE p.status = 'succeeded'
      AND p.created_date_time >= bounds.since
    GROUP BY 1
  )
  SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.variant), '[]'::json)
  FROM (
    SELECT
      v.variant,
      COALESCE(comp.completed, 0) AS completed,
      COALESCE(pay.paid, 0) AS paid,
      ROUND(COALESCE(pay.revenue, 0), 2)::float8 AS revenue
    FROM variants v
    LEFT JOIN comp ON comp.variant = v.variant
    LEFT JOIN pay ON pay.variant = v.variant
  ) r;
$$;

GRANT EXECUTE ON FUNCTION get_landing_variant_funnel(timestamptz) TO service_role;
