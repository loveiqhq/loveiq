-- Rollback of 20261121020000_mira_consent_choices.sql: share_rated_replies goes and
-- use_assessment is on by default again. Roll the code back first: it writes share_rated_replies
-- at every sign-in. The rows the migration switched off stay off (who had it on is not kept).
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261121020000_mira_consent_choices_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.mira_user DROP COLUMN IF EXISTS share_rated_replies;

ALTER TABLE public.mira_user ALTER COLUMN use_assessment SET DEFAULT true;

COMMENT ON COLUMN public.mira_user.use_assessment IS NULL;

COMMIT;
