-- Free sharing (Marcus, LoveIQ WhatsApp group, 2026-10-05, agreed by Eman): every reader may
-- share their report with up to two people, paid or not, and a recipient sees it as its owner
-- does — locked where the owner has not paid, because /api/report gives a shared viewer the
-- owner's own access plan. A share made before any purchase is recorded as 'free'.
--
-- Two changes: report_share.plan_at_share accepts 'free', and create_report_share() lets it
-- through. The function body is otherwise the live one, unchanged (same on staging and
-- production on this date, whitespace aside).
--
-- APPLY BEFORE THE CODE DEPLOYS: the new code sends 'free' for an unpaid owner, and the old
-- function answers that with 'plan_not_shareable'. The old code never sends it, so applying
-- this first is safe.

ALTER TABLE public.report_share
  DROP CONSTRAINT report_share_plan_at_share_check,
  ADD CONSTRAINT report_share_plan_at_share_check
    CHECK (plan_at_share = ANY (ARRAY['free'::text, 'essentials'::text, 'full_report'::text, 'core'::text, 'all_reports'::text]));

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

  IF p_plan NOT IN ('free', 'essentials', 'full_report', 'core', 'all_reports') THEN
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
