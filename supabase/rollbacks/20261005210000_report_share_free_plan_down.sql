-- Rollback for 20261005210000_report_share_free_plan.
--
-- Takes 'free' back out of report_share and create_report_share(). Only possible while no
-- share carries it: a free share made since the forward migration has no paid plan to stand
-- for, so this refuses rather than rewrite what the owner chose. Revoke those first (set
-- revoked_at) or keep the forward migration; revert the code too, or unpaid owners get 403s.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.report_share WHERE plan_at_share = 'free') THEN
    RAISE EXCEPTION 'report_share has free shares; the CHECK cannot be narrowed';
  END IF;
END
$$;

ALTER TABLE public.report_share
  DROP CONSTRAINT report_share_plan_at_share_check,
  ADD CONSTRAINT report_share_plan_at_share_check
    CHECK (plan_at_share = ANY (ARRAY['essentials'::text, 'full_report'::text, 'core'::text, 'all_reports'::text]));

CREATE OR REPLACE FUNCTION public.create_report_share(p_personal_report_id bigint, p_recipient_email text, p_shared_by_user_id bigint, p_plan text, p_seat_limit integer, p_share_token text, p_personal_message text DEFAULT NULL::text)
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
