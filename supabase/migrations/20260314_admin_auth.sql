-- Admin users allowlist with RBAC roles
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('viewer', 'editor', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: service_role only (no direct client access)
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON admin_users
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
  );

-- Seed admin users
INSERT INTO admin_users (email, role) VALUES
  ('ema.djedovic@loveiq.org', 'admin'),
  ('eman.cickusic@loveiq.org', 'admin'),
  ('ferhad.jukic@loveiq.org', 'admin'),
  ('ismar.fazlic@loveiq.org', 'admin'),
  ('mb@loveiq.org', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Admin action audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id BIGSERIAL PRIMARY KEY,
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB DEFAULT '{}',
  ip TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: service_role only
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON admin_audit_log
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
  );

-- Indexes for querying
CREATE INDEX idx_audit_log_email ON admin_audit_log(admin_email);
CREATE INDEX idx_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX idx_audit_log_action ON admin_audit_log(action);
