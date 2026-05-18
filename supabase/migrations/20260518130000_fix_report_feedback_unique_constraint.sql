-- Fix: replace partial unique INDEX with a full unique CONSTRAINT so
-- PostgREST upserts to report_section_feedback can target it.
--
-- Background:
--   Migration 20260502120000_report_feedback_user_links_and_unlock_all_archetypes.sql
--   created a *partial* unique INDEX on (survey_submission_id, section_id)
--   WHERE (survey_submission_id IS NOT NULL). The /api/report-feedback route
--   issues PostgREST upserts with `?on_conflict=survey_submission_id,section_id`,
--   which translates to `ON CONFLICT (survey_submission_id, section_id) DO
--   UPDATE …`. Postgres requires a non-partial unique constraint OR the
--   partial's WHERE predicate to satisfy ON CONFLICT — PostgREST can't emit
--   the predicate, so every chapter rating POST has returned 500 with:
--     42P10: there is no unique or exclusion constraint matching the
--     ON CONFLICT specification
--
-- Fix: drop the partial index, add a real UNIQUE CONSTRAINT on the same
-- columns. Coverage is identical in practice — Postgres treats NULLs as
-- distinct in unique constraints by default, so rows with a NULL
-- survey_submission_id still don't conflict (same as the partial).
--
-- Both halves are idempotent. Applied via Supabase MCP on 2026-05-18.

DROP INDEX IF EXISTS public.report_section_feedback_submission_section_uq;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'report_section_feedback_submission_section_uq'
      AND conrelid = 'public.report_section_feedback'::regclass
  ) THEN
    ALTER TABLE public.report_section_feedback
      ADD CONSTRAINT report_section_feedback_submission_section_uq
      UNIQUE (survey_submission_id, section_id);
  END IF;
END$$;
