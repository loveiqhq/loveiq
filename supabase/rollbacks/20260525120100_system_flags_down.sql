-- DOWN migration for 20260525120100_system_flags.sql.
--
-- Drops the kill-switch flags table (+ its RLS policy). Reverting removes the
-- survey_submissions / nurture_sequence / report_paywall_enforced switches.
-- isFeatureEnabled() in shared/flags/system-flags.ts fails to its default
-- (enabled) when the table is absent, so all gated features stay ON — safe to
-- run, but you lose the ability to disable a feature without a redeploy.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260525120100_system_flags_down.sql

BEGIN;

DROP TABLE IF EXISTS system_flags;

COMMIT;
