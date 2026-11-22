-- Mira: signing a device out in Settings also ends its login at Supabase (round-2 audit SEC-L1 /
-- COR-9). Additive only: one function.
-- Rollback: supabase/rollbacks/20261122130000_mira_end_auth_sessions_down.sql
--
-- Settings › Sign-in & security deletes a device's mira_session row, so Mira refuses that session
-- from its next request (features/mira/server/session.ts getMiraAccount). Its Supabase session and
-- refresh token stayed valid until the device next called Mira, and for a login shared with the
-- admin panel or Jarvis, "Sign out everywhere" signs out only locally on purpose (their own
-- sessions aren't Mira's to end), so a stolen Mira session of such a login stayed usable there.
--
-- mira_end_auth_sessions(p_user, p_sessions): ends exactly these sessions of this user, as a
--   Supabase sign-out of one session does (the auth.sessions row goes, and its refresh tokens with
--   it); never another user's, never one the caller didn't name. The app passes only the ids of
--   the mira_session rows it has just deleted (features/mira/server/devices.ts endAuthSessions).
--   Their access tokens run out within the hour, and Mira refuses them at once anyway.
--
-- SECURITY DEFINER with an empty search_path, as the auth schema belongs to Supabase's own roles;
-- callable by the service role only, like every Mira object. The code calls it best effort, so it
-- may be deployed before this is applied (until then a sign-out only logs a warning).

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.mira_end_auth_sessions(p_user uuid, p_sessions uuid[])
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ended AS (
    DELETE FROM auth.sessions
    WHERE user_id = p_user
      AND id = ANY (p_sessions)
    RETURNING 1
  )
  SELECT count(*)::integer FROM ended;
$$;

REVOKE ALL ON FUNCTION public.mira_end_auth_sessions(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mira_end_auth_sessions(uuid, uuid[]) TO service_role;

COMMENT ON FUNCTION public.mira_end_auth_sessions(uuid, uuid[]) IS
  'Ends the named Supabase sessions of one user (auth.sessions, refresh tokens with them), for Mira''s Settings › Sign-in & security sign-outs. Service role only.';

COMMIT;
