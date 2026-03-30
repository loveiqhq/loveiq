
-- Submission Tags
CREATE TABLE IF NOT EXISTS submission_tag (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT '#6b7280',
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submission_tag_assignment (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id bigint NOT NULL REFERENCES survey_submission(id) ON DELETE CASCADE,
  tag_id bigint NOT NULL REFERENCES submission_tag(id) ON DELETE CASCADE,
  assigned_by text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(submission_id, tag_id)
);

-- Product Changelog
CREATE TABLE IF NOT EXISTS product_changelog (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'other',
  admin_email text NOT NULL,
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE submission_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_tag_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_changelog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON submission_tag FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_only" ON submission_tag_assignment FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_only" ON product_changelog FOR ALL USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX idx_tag_assignment_submission ON submission_tag_assignment(submission_id);
CREATE INDEX idx_tag_assignment_tag ON submission_tag_assignment(tag_id);
CREATE INDEX idx_changelog_date ON product_changelog(event_date);
;
