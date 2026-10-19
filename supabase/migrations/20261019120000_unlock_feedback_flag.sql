-- Register the `unlock_feedback` kill switch.
--
-- Gates /api/cron/unlock-feedback, the "why didn't you unlock?" email (Marcus's epic, 18 Oct
-- 2026). When false the cron exits early with skipped:true and nothing is sent; answers to
-- emails already out still work. Every answer unlocks a full report for free, so the flag is
-- also toggleable from the admin system-flags panel (ALLOWED_KEYS).
--
-- Additive + idempotent (ON CONFLICT DO NOTHING), and isFeatureEnabled() fails OPEN, so the
-- cron runs if this has not been applied yet: seeded so it can be flipped. What starts the
-- sends is UNLOCK_FEEDBACK_FROM (features/unlock-feedback/logic/launch.ts): no report created
-- before it is ever emailed.

BEGIN;

INSERT INTO system_flags (key, enabled, description) VALUES
  ('unlock_feedback', true,
    'Gates /api/cron/unlock-feedback (the "why didn''t you unlock?" email). When false, cron exits early with skipped:true.')
ON CONFLICT (key) DO NOTHING;

COMMIT;
