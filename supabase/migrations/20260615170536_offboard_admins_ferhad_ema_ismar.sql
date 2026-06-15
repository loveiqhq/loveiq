-- Offboard departed teammates: revoke their /admin allowlist entries.
-- Ferhad, Ema Djedovic, and Ismar have left; this removes their admin_users rows
-- so they can no longer obtain a magic-link admin session. admin_audit_log.admin_email
-- is plain TEXT (no FK), so their historical audit trail is intentionally retained.
-- Keeps Eman Cickusic + Marcus Borner. Idempotent: DELETE no-ops if already gone.
DELETE FROM admin_users
WHERE email IN (
  'ferhad.jukic@loveiq.org',
  'ema.djedovic@loveiq.org',
  'ismar.fazlic@loveiq.org'
);
