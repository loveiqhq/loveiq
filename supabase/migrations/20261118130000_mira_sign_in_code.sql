-- Mira's sign-in codes: one row per address with a code Mira emailed, and how many guesses
-- that code has had. Additive only. Rollback:
-- supabase/rollbacks/20261118130000_mira_sign_in_code_down.sql
--
-- Mira shares the Supabase project with the admin panel and Jarvis, so its verify route must
-- not become a way to guess anyone's one-time code. A code is checked only when (1) Mira
-- issued it to that address (this row, written when the email went out), (2) within the
-- hour, and (3) fewer than the allowed guesses were used. The guess is reserved atomically
-- BEFORE the code is checked (mira_claim_code_attempt), so parallel guesses cannot race past
-- the cap. A new code resets the count, so a stranger burning guesses never locks the real
-- person out: they ask for a new code. A used code's row is deleted.
--
-- Address and counts only. Service role only, like every other table.

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.mira_sign_in_code (
  email     text PRIMARY KEY CHECK (email = lower(email) AND char_length(email) <= 320),
  issued_at timestamptz NOT NULL DEFAULT now(),
  attempts  integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

ALTER TABLE public.mira_sign_in_code ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mira_sign_in_code FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mira_sign_in_code TO service_role;
DROP POLICY IF EXISTS "Service role only" ON public.mira_sign_in_code;
CREATE POLICY "Service role only" ON public.mira_sign_in_code
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- One guess reserved for the address's current code, or false: no code from Mira, too old, or
-- out of guesses. A single UPDATE, so concurrent calls are serialised on the row.
CREATE OR REPLACE FUNCTION public.mira_claim_code_attempt(
  p_email text,
  p_max integer,
  p_ttl_seconds integer
) RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH claimed AS (
    UPDATE public.mira_sign_in_code
       SET attempts = attempts + 1
     WHERE email = lower(p_email)
       AND issued_at > now() - make_interval(secs => p_ttl_seconds)
       AND attempts < p_max
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;

REVOKE ALL ON FUNCTION public.mira_claim_code_attempt(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mira_claim_code_attempt(text, integer, integer) TO service_role;

COMMENT ON TABLE public.mira_sign_in_code IS
  'An address with a sign-in code Mira emailed, and the guesses that code has had (features/mira/server/store.ts). Reset by a new code, deleted when used.';

COMMIT;
