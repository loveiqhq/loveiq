CREATE TABLE IF NOT EXISTS admin_chart_annotation (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email     text NOT NULL,
  chart_key       text NOT NULL,
  annotation_date date NOT NULL,
  note            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chart_annotation_key ON admin_chart_annotation(chart_key);
CREATE INDEX IF NOT EXISTS idx_chart_annotation_date ON admin_chart_annotation(annotation_date);

ALTER TABLE admin_chart_annotation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON admin_chart_annotation
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
  );

CREATE TABLE IF NOT EXISTS admin_export_preset (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email     text NOT NULL,
  name            text NOT NULL,
  config          jsonb NOT NULL,
  is_shared       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_export_preset_email ON admin_export_preset(admin_email);

ALTER TABLE admin_export_preset ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON admin_export_preset
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
  );;
