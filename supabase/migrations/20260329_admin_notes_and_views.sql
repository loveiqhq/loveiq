-- Migration: admin_note + admin_saved_view tables
-- Notes: internal admin comments on survey submissions
-- Saved views: reusable filter presets for the submission browser

-- ─── admin_note ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_note (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id   bigint NOT NULL REFERENCES survey_submission(id) ON DELETE CASCADE,
  admin_email     text NOT NULL,
  content         text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_note_submission ON admin_note(submission_id);
CREATE INDEX idx_admin_note_created ON admin_note(created_at DESC);

ALTER TABLE admin_note ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON admin_note
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
  );

-- ─── admin_saved_view ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_saved_view (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email     text NOT NULL,
  name            text NOT NULL,
  filters         jsonb NOT NULL,
  is_shared       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_saved_view_email ON admin_saved_view(admin_email);

ALTER TABLE admin_saved_view ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_only" ON admin_saved_view
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role'
  );
