-- Mark Oldenburg changed email: mark.oldenburg@loveiq.org -> mo@loveiq.org.
-- Grant the new address the same /admin allowlist access he already had (role 'admin'),
-- then remove the old address so only his current email keeps access.
-- Idempotent: INSERT no-ops if mo@ is already present; DELETE no-ops if the old row is gone.
-- admin_audit_log.admin_email is plain TEXT (no FK), so his historical audit rows under the
-- old address are intentionally retained.

INSERT INTO admin_users (email, role) VALUES
  ('mo@loveiq.org', 'admin')
ON CONFLICT (email) DO NOTHING;

DELETE FROM admin_users
WHERE email = 'mark.oldenburg@loveiq.org';
