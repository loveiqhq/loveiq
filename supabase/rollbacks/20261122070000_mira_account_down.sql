-- Rollback of 20261122070000_mira_account.sql. Roll the code back first: Mira honours only the
-- sessions mira_session records, so without the table every Mira sign-in is refused (it fails
-- closed), and the passkey, device and email routes need their tables. Passkeys people added stop
-- working; they can still sign in by code or with Google.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261122070000_mira_account_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP FUNCTION IF EXISTS public.mira_claim_email_change_attempt(uuid, integer, integer);
DROP TABLE IF EXISTS public.mira_email_change;
DROP TABLE IF EXISTS public.mira_session;
DROP TABLE IF EXISTS public.mira_webauthn_challenge;
DROP TABLE IF EXISTS public.mira_passkey;
ALTER TABLE public.mira_user DROP COLUMN IF EXISTS google_connected_at;

COMMIT;
