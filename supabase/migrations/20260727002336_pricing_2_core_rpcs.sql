-- Pricing 2.0: teach two RPCs about the new "core" plan.
--
-- 1. create_report_share() hard-rejected any plan not in the old 3-plan list, so
--    a `core` buyer (who CAN share — seat limit 2) got 'plan_not_shareable'. Add
--    'core' to the shareable set.
-- 2. find_stuck_payments() (ops monitor for paid-but-not-fulfilled) skipped core
--    payments entirely. Add core with the right fulfilment check: a fulfilled
--    core report has the buyer's top-3 archetypes at full_report tier, so it's
--    stuck if it has fewer than 3 full_report entries.
--
-- Both are CREATE OR REPLACE of the existing definitions with only the plan set
-- widened — no signature/behaviour change otherwise.

CREATE OR REPLACE FUNCTION public.create_report_share(
  p_personal_report_id bigint, p_recipient_email text, p_shared_by_user_id bigint,
  p_plan text, p_seat_limit integer, p_share_token text,
  p_personal_message text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_active integer;
  v_row    public.report_share%ROWTYPE;
BEGIN
  IF p_seat_limit IS NULL OR p_seat_limit < 1 THEN
    RETURN json_build_object('error', 'no_seats');
  END IF;

  IF p_plan NOT IN ('essentials', 'full_report', 'core', 'all_reports') THEN
    RETURN json_build_object('error', 'plan_not_shareable');
  END IF;

  PERFORM pg_advisory_xact_lock(p_personal_report_id);

  SELECT count(*) INTO v_active
    FROM public.report_share
   WHERE personal_report_id = p_personal_report_id
     AND revoked_at IS NULL;

  IF v_active >= p_seat_limit THEN
    RETURN json_build_object('error', 'seat_limit_reached', 'active', v_active, 'limit', p_seat_limit);
  END IF;

  BEGIN
    INSERT INTO public.report_share (
      personal_report_id, recipient_email, share_token, shared_by_user_id,
      plan_at_share, personal_message
    )
    VALUES (
      p_personal_report_id, lower(p_recipient_email), p_share_token, p_shared_by_user_id,
      p_plan, nullif(btrim(coalesce(p_personal_message, '')), '')
    )
    RETURNING * INTO v_row;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN json_build_object('error', 'duplicate_recipient');
  END;

  RETURN json_build_object('ok', true, 'row', row_to_json(v_row));
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_stuck_payments(p_limit integer DEFAULT 50)
 RETURNS TABLE(payment_id bigint, personal_report_id bigint, plan text, archetype text, primary_archetype text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    AND (p.metadata->>'plan') IN ('essentials', 'full_report', 'core', 'all_reports')
    AND (
      ((p.metadata->>'plan') = 'all_reports'
       AND (pr.archetype_tiers IS NULL OR jsonb_typeof(pr.archetype_tiers) <> 'object'
            OR (SELECT COUNT(*) FROM jsonb_object_keys(pr.archetype_tiers)) < 14))
      OR
      -- core unlocks the buyer's top-3 archetypes at full_report tier
      ((p.metadata->>'plan') = 'core'
       AND (pr.archetype_tiers IS NULL OR jsonb_typeof(pr.archetype_tiers) <> 'object'
            OR (SELECT COUNT(*) FROM jsonb_each_text(pr.archetype_tiers) e WHERE e.value = 'full_report') < 3))
      OR
      ((p.metadata->>'plan') IN ('essentials', 'full_report')
       AND NULLIF(p.metadata->>'archetype', '') IS NOT NULL
       AND (pr.archetype_tiers IS NULL
            OR (pr.archetype_tiers->>(p.metadata->>'archetype')) IS NULL
            OR ((p.metadata->>'plan') = 'full_report'
                AND pr.archetype_tiers->>(p.metadata->>'archetype') <> 'full_report')))
      OR
      ((p.metadata->>'plan') IN ('essentials', 'full_report')
       AND NULLIF(p.metadata->>'archetype', '') IS NULL
       AND COALESCE(sr.v5_primary_archetype, sr.primary_archetype) IS NOT NULL
       AND (pr.archetype_tiers IS NULL
            OR (pr.archetype_tiers->>COALESCE(sr.v5_primary_archetype, sr.primary_archetype)) IS NULL))
    )
  ORDER BY p.payment_date_time DESC
  LIMIT p_limit;
$function$;
