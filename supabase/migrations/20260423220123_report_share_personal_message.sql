-- Phase 2 Figma alignment: owners now write a personal message alongside each share invite.
-- The message is stored on the share row and embedded into the recipient email.

ALTER TABLE public.report_share
  ADD COLUMN IF NOT EXISTS personal_message text;

ALTER TABLE public.report_share
  DROP CONSTRAINT IF EXISTS report_share_personal_message_length_chk;

ALTER TABLE public.report_share
  ADD CONSTRAINT report_share_personal_message_length_chk
  CHECK (personal_message IS NULL OR char_length(personal_message) <= 2000);

-- Recreate create_report_share with a new optional parameter. PG cannot overload across
-- default args cleanly, so drop the 6-arg variant first.
DROP FUNCTION IF EXISTS public.create_report_share(bigint, text, bigint, text, integer, text);

CREATE OR REPLACE FUNCTION public.create_report_share(
  p_personal_report_id bigint,
  p_recipient_email    text,
  p_shared_by_user_id  bigint,
  p_plan               text,
  p_seat_limit         integer,
  p_share_token        text,
  p_personal_message   text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active integer;
  v_row    public.report_share%ROWTYPE;
BEGIN
  IF p_seat_limit IS NULL OR p_seat_limit < 1 THEN
    RETURN json_build_object('error', 'no_seats');
  END IF;

  IF p_plan NOT IN ('full_report', 'all_reports') THEN
    RETURN json_build_object('error', 'plan_not_shareable');
  END IF;

  -- Per-report transactional lock: prevents TOCTOU where two concurrent
  -- POSTs both read active<limit and both insert, exceeding the seat cap.
  PERFORM pg_advisory_xact_lock(p_personal_report_id);

  SELECT count(*) INTO v_active
    FROM public.report_share
   WHERE personal_report_id = p_personal_report_id
     AND revoked_at IS NULL;

  IF v_active >= p_seat_limit THEN
    RETURN json_build_object(
      'error', 'seat_limit_reached',
      'active', v_active,
      'limit',  p_seat_limit
    );
  END IF;

  BEGIN
    INSERT INTO public.report_share (
      personal_report_id,
      recipient_email,
      share_token,
      shared_by_user_id,
      plan_at_share,
      personal_message
    )
    VALUES (
      p_personal_report_id,
      lower(p_recipient_email),
      p_share_token,
      p_shared_by_user_id,
      p_plan,
      nullif(btrim(coalesce(p_personal_message, '')), '')
    )
    RETURNING * INTO v_row;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN json_build_object('error', 'duplicate_recipient');
  END;

  RETURN json_build_object(
    'ok', true,
    'row', row_to_json(v_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_report_share(bigint, text, bigint, text, integer, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_report_share(bigint, text, bigint, text, integer, text, text) TO service_role;
