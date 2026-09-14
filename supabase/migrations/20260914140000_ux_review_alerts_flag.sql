-- Register the `ux_review_alerts` kill switch.
--
-- Gates the Slack half of /api/cron/ux-review (Replay Vision findings posted to
-- #incoming-surveys). When false the cron exits early with skipped:true.
--
-- IMPORTANT: this silences Slack only. The scanners themselves are PostHog-side
-- and sweep every five minutes regardless, spending credits; the stop for those
-- is the scanner's `credit_limit` or disabling it in PostHog. Flipping this flag
-- off does NOT stop the spend.
--
-- Additive + idempotent (ON CONFLICT DO NOTHING), and isFeatureEnabled() fails
-- OPEN, so the cron still posts if this has not been applied yet — seed it so
-- the flag is flippable from the admin system-flags panel.

BEGIN;

INSERT INTO system_flags (key, enabled, description) VALUES
  ('ux_review_alerts', true,
    'Gates Slack posting from /api/cron/ux-review (Replay Vision UX findings). Silences Slack only — PostHog scanners keep sweeping and spending credits regardless.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
