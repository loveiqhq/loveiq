-- F-12: system_flags table for incident-time kill switches.
--
-- Each row is one named flag. `enabled = true` means the feature runs
-- normally; `enabled = false` means the corresponding code path early-exits
-- (survey submissions return 503, nurture cron skips, paywall stops enforcing).
--
-- Cached 30s in-process per Vercel function. To take effect immediately,
-- redeploy or wait up to 30s for cache expiry across all instances.

BEGIN;

CREATE TABLE IF NOT EXISTS system_flags (
  key          text PRIMARY KEY,
  enabled      boolean NOT NULL DEFAULT true,
  description  text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   text
);

ALTER TABLE system_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON system_flags USING (false);

-- Seed the canonical kill switches with enabled=true. Admins flip to false
-- via PATCH /api/admin/system-flags when something goes wrong.
INSERT INTO system_flags (key, enabled, description) VALUES
  ('survey_submissions', true,
    'Gates /api/survey and /api/survey-partial. When false, both routes return 503.'),
  ('nurture_sequence', true,
    'Gates /api/cron/nurture-sequence. When false, cron exits early with skipped:true.'),
  ('report_paywall_enforced', true,
    'When false, paywalled sections become readable without payment (emergency-only).')
ON CONFLICT (key) DO NOTHING;

COMMIT;
