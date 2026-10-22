-- Rollback: remove the `unlock_feedback` flag row.
-- isFeatureEnabled() fails OPEN, so removing the row lets the email go out rather than
-- stopping it. To actually stop it, set enabled = false instead of running this.
BEGIN;
DELETE FROM system_flags WHERE key = 'unlock_feedback';
COMMIT;
