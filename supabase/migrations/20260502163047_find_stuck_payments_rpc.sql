-- Helper for /api/cron/payment-fulfillment-sweep. Returns succeeded payments
-- whose archetype tier write never landed on the linked personal_report — the
-- "paid but locked" failure mode.
--
-- Expressed as an RPC because the join logic (per-plan tier check against a
-- jsonb column) doesn't fit cleanly into a single PostgREST query. Marked
-- STABLE — read-only, no side effects, safe to call repeatedly.
CREATE OR REPLACE FUNCTION public.find_stuck_payments(p_limit integer DEFAULT 50)
RETURNS TABLE(
  payment_id bigint,
  personal_report_id bigint,
  plan text,
  archetype text,
  primary_archetype text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id AS payment_id,
    pr.id AS personal_report_id,
    (p.metadata->>'plan')::text AS plan,
    NULLIF(p.metadata->>'archetype', '') AS archetype,
    COALESCE(sr.v5_primary_archetype, sr.primary_archetype) AS primary_archetype
  FROM public.payment p
  JOIN public.personal_report pr ON pr.id = p.personal_report_id
  LEFT JOIN public.scoring_result sr ON sr.survey_submission_id = pr.survey_submission_id
  WHERE p.status = 'succeeded'
    AND (p.metadata->>'plan') IN ('essentials', 'full_report', 'all_reports')
    AND (
      -- all_reports: archetype_tiers should have all 14 entries at full_report tier
      ((p.metadata->>'plan') = 'all_reports'
       AND (
         pr.archetype_tiers IS NULL
         OR jsonb_typeof(pr.archetype_tiers) <> 'object'
         OR (SELECT COUNT(*) FROM jsonb_object_keys(pr.archetype_tiers)) < 14
       ))
      OR
      -- per-archetype plan with a known archetype: matching tier should be present
      ((p.metadata->>'plan') IN ('essentials', 'full_report')
       AND NULLIF(p.metadata->>'archetype', '') IS NOT NULL
       AND (
         pr.archetype_tiers IS NULL
         OR (pr.archetype_tiers->>(p.metadata->>'archetype')) IS NULL
         -- essentials is satisfied by either tier; full_report demands full_report
         OR ((p.metadata->>'plan') = 'full_report'
             AND pr.archetype_tiers->>(p.metadata->>'archetype') <> 'full_report')
       ))
      OR
      -- per-archetype plan with no metadata.archetype — fall back to primary
      ((p.metadata->>'plan') IN ('essentials', 'full_report')
       AND NULLIF(p.metadata->>'archetype', '') IS NULL
       AND COALESCE(sr.v5_primary_archetype, sr.primary_archetype) IS NOT NULL
       AND (
         pr.archetype_tiers IS NULL
         OR (pr.archetype_tiers->>COALESCE(sr.v5_primary_archetype, sr.primary_archetype)) IS NULL
       ))
    )
  ORDER BY p.payment_date_time DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.find_stuck_payments(integer) TO service_role;
