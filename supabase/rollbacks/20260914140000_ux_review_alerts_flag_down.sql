-- Rollback: remove the `ux_review_alerts` flag row.
-- isFeatureEnabled() fails OPEN, so removing the row re-enables Slack posting
-- rather than silencing it. To actually stop the posts, set enabled = false
-- instead of running this.
BEGIN;
DELETE FROM system_flags WHERE key = 'ux_review_alerts';
COMMIT;
