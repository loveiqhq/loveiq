-- Per-archetype unlock list on personal_report.
-- Lets a user unlock one or more specific non-primary archetype reports
-- without upgrading to the full "all_reports" plan.

ALTER TABLE personal_report
  ADD COLUMN IF NOT EXISTS unlocked_archetypes text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS personal_report_unlocked_archetypes_idx
  ON personal_report USING GIN (unlocked_archetypes);
