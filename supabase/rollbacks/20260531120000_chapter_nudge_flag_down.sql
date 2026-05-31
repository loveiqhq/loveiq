-- DOWN migration for 20260531120000_chapter_nudge_flag.sql.
--
-- Removes the `chapter_nudge` kill-switch row. isFeatureEnabled() fails to its
-- default (enabled) when the row is absent, so the drip stays ON after this
-- runs — you just lose the ability to disable it without a redeploy. Safe to
-- run.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260531120000_chapter_nudge_flag_down.sql

BEGIN;

DELETE FROM system_flags WHERE key = 'chapter_nudge';

COMMIT;
