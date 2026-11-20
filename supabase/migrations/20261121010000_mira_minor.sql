-- Mira's under-18 stop (Sanjin's rail 15, kept by the app): when a person says they are under 18,
-- their account is marked, gets only message G from then on, its nudges go off and its chats are
-- deleted (features/mira/server/minor.ts); the nudge job skips a marked account. Additive only.
-- Follows 20261120050000. Rollback: supabase/rollbacks/20261121010000_mira_minor_down.sql
--
-- Service role only, like every other Mira object: no grants or policies change.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_user ADD COLUMN IF NOT EXISTS minor_at timestamptz;

COMMENT ON COLUMN public.mira_user.minor_at IS
  'When the person said they are under 18 (Mira''s [[MINOR]], rail 15): from then on the chat answers only with message G and the nudge job skips the account.';

COMMIT;
