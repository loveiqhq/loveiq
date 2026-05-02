-- Migration: Admin features batch 3
-- New tables: admin_goals, admin_tag_rules

-- admin_goals
CREATE TABLE IF NOT EXISTS admin_goals (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email     text NOT NULL,
  metric_key      text NOT NULL,
  target_value    numeric NOT NULL,
  current_value   numeric NOT NULL DEFAULT 0,
  deadline        date,
  label           text NOT NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_goals_email ON admin_goals(admin_email);
CREATE INDEX IF NOT EXISTS idx_admin_goals_status ON admin_goals(status);

ALTER TABLE admin_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON admin_goals
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
  );

-- admin_tag_rules
CREATE TABLE IF NOT EXISTS admin_tag_rules (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tag_id          bigint NOT NULL REFERENCES submission_tag(id) ON DELETE CASCADE,
  field           text NOT NULL,
  operator        text NOT NULL CHECK (operator IN ('gt','gte','lt','lte','eq','contains')),
  value           text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tag_rules_active ON admin_tag_rules(is_active);

ALTER TABLE admin_tag_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON admin_tag_rules
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
  );;
