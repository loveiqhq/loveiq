-- Mira's sign-in and security (22 Nov 2026): passkeys, signed-in devices, sign out everywhere,
-- change of email and the Google connection. Additive only. Follows 20261121030000.
-- Rollback: supabase/rollbacks/20261122070000_mira_account_down.sql
--
-- mira_passkey: a passkey (a WebAuthn credential) the person added in Settings or right after a
--   code sign-in: its public key, signature counter and transports, whether it is synced (iCloud
--   Keychain, Google Password Manager), a label (the device it was made on, renamable), when it
--   was made and last used. No biometric data: a face or finger never leaves the device; Mira
--   only ever gets a public key and signatures.
-- mira_webauthn_challenge: the random challenge of one passkey ceremony. Single use (deleted when
--   it is checked), 5 minutes, bound to the browser that asked by an httpOnly cookie holding the
--   row's id; a registration's also to the account that asked.
-- mira_session: one row per sign-in to Mira (a Supabase Auth session, by the access token's
--   session_id): how (email code, Google, passkey), a device label from the user agent
--   ("iPhone · Safari"), the approximate city from Vercel's geo headers at sign-in (never the IP),
--   when it was made and last seen. Mira honours only a session that has a row here
--   (features/mira/server/session.ts), so signing out one device or everywhere deletes rows.
-- mira_email_change: a change of the account's email waiting for its code: the new address, a
--   keyed hash of the 8-digit code sent there, when, and the guesses used, reserved atomically
--   (mira_claim_email_change_attempt). Deleted when used, replaced by a new code.
-- mira_user.google_connected_at: when Google last confirmed the account's address (a Google
--   sign-in, or "Connect Google" in Settings); cleared when the email changes.
--
-- Every row belongs to a mira_user and goes with it (ON DELETE CASCADE): deleting an account
-- deletes its passkeys, devices and pending change. The daily mira-memory job deletes expired
-- challenges, pending changes over a day old and devices not seen for 90 days.
--
-- Service role only, like every other Mira table: the browser never talks to these directly.
-- migration-lint: ignore (the indexes are created on tables created empty in this same file)

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.mira_passkey (
  id           text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{16,1366}$'),
  user_id      uuid NOT NULL REFERENCES public.mira_user (id) ON DELETE CASCADE,
  public_key   text NOT NULL CHECK (public_key ~ '^[A-Za-z0-9_-]{16,4096}$'),
  counter      bigint NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports   text[] NOT NULL DEFAULT '{}' CHECK (cardinality(transports) <= 8),
  backed_up    boolean NOT NULL DEFAULT false,
  label        text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS mira_passkey_user_idx ON public.mira_passkey (user_id, created_at);

CREATE TABLE IF NOT EXISTS public.mira_webauthn_challenge (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge  text NOT NULL CHECK (challenge ~ '^[A-Za-z0-9_-]{16,128}$'),
  purpose    text NOT NULL CHECK (purpose IN ('register', 'sign_in')),
  user_id    uuid REFERENCES public.mira_user (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((purpose = 'register') = (user_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS mira_webauthn_challenge_expires_idx
  ON public.mira_webauthn_challenge (expires_at);

CREATE TABLE IF NOT EXISTS public.mira_session (
  id           uuid PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES public.mira_user (id) ON DELETE CASCADE,
  method       text NOT NULL CHECK (method IN ('email', 'google', 'passkey')),
  device       text NOT NULL CHECK (char_length(device) BETWEEN 1 AND 80),
  city         text CHECK (char_length(city) <= 80),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mira_session_user_idx ON public.mira_session (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS mira_session_last_seen_idx ON public.mira_session (last_seen_at);

CREATE TABLE IF NOT EXISTS public.mira_email_change (
  user_id   uuid PRIMARY KEY REFERENCES public.mira_user (id) ON DELETE CASCADE,
  new_email text NOT NULL CHECK (new_email = lower(new_email) AND char_length(new_email) <= 320),
  code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz NOT NULL DEFAULT now(),
  attempts  integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

ALTER TABLE public.mira_user ADD COLUMN IF NOT EXISTS google_connected_at timestamptz;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mira_passkey', 'mira_webauthn_challenge', 'mira_session', 'mira_email_change'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "Service role only" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Service role only" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;

-- One guess reserved for the account's pending change, or null: none, older than the code's
-- lifetime, or out of guesses. A single UPDATE, so concurrent guesses are serialised on the row
-- and can't pass the cap (the same shape as mira_claim_code_attempt).
CREATE OR REPLACE FUNCTION public.mira_claim_email_change_attempt(
  p_user uuid,
  p_max integer,
  p_ttl_seconds integer
) RETURNS json
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH claimed AS (
    UPDATE public.mira_email_change
       SET attempts = attempts + 1
     WHERE user_id = p_user
       AND issued_at > now() - make_interval(secs => p_ttl_seconds)
       AND attempts < p_max
    RETURNING new_email, code_hash
  )
  SELECT json_build_object('new_email', new_email, 'code_hash', code_hash) FROM claimed;
$$;

REVOKE ALL ON FUNCTION public.mira_claim_email_change_attempt(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mira_claim_email_change_attempt(uuid, integer, integer) TO service_role;

COMMENT ON TABLE public.mira_passkey IS
  'A Mira account''s passkey (WebAuthn credential; features/mira/server/passkeys.ts): public key, counter, transports, synced or not, a label, made and last used. No biometric data. Goes with the account.';
COMMENT ON TABLE public.mira_webauthn_challenge IS
  'One passkey ceremony''s challenge: single use (deleted when checked), 5 minutes, bound to the browser by an httpOnly cookie with the row id; a registration''s also to its account.';
COMMENT ON TABLE public.mira_session IS
  'A sign-in to Mira, by Supabase Auth session id: method, device label from the user agent, approximate city at sign-in, made and last seen. Mira honours only sessions with a row (session.ts); signing out deletes it. Deleted 90 days after last seen.';
COMMENT ON TABLE public.mira_email_change IS
  'A change of a Mira account''s email waiting for its code: the new address, a keyed hash of the code, when, guesses used. Deleted when used; after a day by the mira-memory job.';
COMMENT ON COLUMN public.mira_user.google_connected_at IS
  'When Google last confirmed the account''s address (Google sign-in or "Connect Google"); cleared when the email changes.';
COMMENT ON FUNCTION public.mira_claim_email_change_attempt(uuid, integer, integer) IS
  'Reserves one guess for the account''s pending email change and returns {new_email, code_hash}, or null when there is none, it is too old or out of guesses (features/mira/server/email-change.ts).';

COMMIT;
