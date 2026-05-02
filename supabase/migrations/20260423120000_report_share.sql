-- Report sharing: let a paying owner (Full Report / All Reports) grant read access to up to 2 other people.
-- Seat enforcement is DB-native: partial unique index on (personal_report_id, lower(email)) WHERE revoked_at IS NULL
-- prevents duplicate active shares, and create_report_share() is the only atomic count+insert path so two
-- concurrent POSTs cannot exceed p_seat_limit.

CREATE TABLE IF NOT EXISTS public.report_share (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  personal_report_id  bigint NOT NULL REFERENCES public.personal_report(id) ON DELETE CASCADE,
  recipient_email     text   NOT NULL,
  share_token         text   NOT NULL UNIQUE,
  shared_by_user_id   bigint REFERENCES public.app_user(id),
  plan_at_share       text   NOT NULL CHECK (plan_at_share IN ('full_report', 'all_reports')),
  last_viewed_at      timestamptz,
  view_count          integer NOT NULL DEFAULT 0,
  revoked_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS report_share_active_recipient_idx
  ON public.report_share (personal_report_id, lower(recipient_email))
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS report_share_token_idx
  ON public.report_share (share_token);

CREATE INDEX IF NOT EXISTS report_share_personal_report_idx
  ON public.report_share (personal_report_id);

ALTER TABLE public.report_share ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.report_share;
CREATE POLICY service_role_only ON public.report_share USING (false);

-- Atomic seat enforcement. Returns { ok, row } on success, or { error, ... } on refusal.
-- seat_limit is passed in by the caller (API) so the DB doesn't need to know about plan tiers.
CREATE OR REPLACE FUNCTION public.create_report_share(
  p_personal_report_id bigint,
  p_recipient_email    text,
  p_shared_by_user_id  bigint,
  p_plan               text,
  p_seat_limit         integer,
  p_share_token        text
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
      plan_at_share
    )
    VALUES (
      p_personal_report_id,
      lower(p_recipient_email),
      p_share_token,
      p_shared_by_user_id,
      p_plan
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

REVOKE ALL ON FUNCTION public.create_report_share(bigint, text, bigint, text, integer, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_report_share(bigint, text, bigint, text, integer, text) TO service_role;

-- Atomic view counter for shared-report opens. Used as fire-and-forget from the API.
CREATE OR REPLACE FUNCTION public.increment_report_share_view(p_share_id bigint)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.report_share
     SET view_count     = view_count + 1,
         last_viewed_at = now()
   WHERE id = p_share_id
     AND revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.increment_report_share_view(bigint) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_report_share_view(bigint) TO service_role;
