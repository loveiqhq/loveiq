-- F-12: register the `chapter_nudge` kill switch.
--
-- Gates /api/cron/chapter-nudge (the "chapter by chapter" drip). When false,
-- the cron exits early with skipped:true. Additive + idempotent: ON CONFLICT
-- DO NOTHING so re-running is safe and an existing row is left untouched.
--
-- isFeatureEnabled() in shared/flags/system-flags.ts fails OPEN (defaults to
-- enabled) when the row is missing, so the drip still runs if this migration
-- has not been applied yet — but seed it so the flag is flippable from the
-- admin system-flags panel.

BEGIN;

INSERT INTO system_flags (key, enabled, description) VALUES
  ('chapter_nudge', true,
    'Gates /api/cron/chapter-nudge (chapter-by-chapter drip). When false, cron exits early with skipped:true.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
