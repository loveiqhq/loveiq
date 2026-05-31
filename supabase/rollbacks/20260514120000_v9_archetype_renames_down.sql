-- DOWN migration for 20260514120000_v9_archetype_renames.sql.
--
-- Reverts the 3 V9 archetype display-name renames in scoring_result rows.
-- Mirror-image of the forward migration: same columns, same shape, swap
-- direction. Same idempotency property — safe to re-run.
--
-- Renames (reversed):
--   Tender Devotee       -> Approval Seeker
--   Authority Conductor  -> Power Orchestrator
--   Radiant Performer    -> Exhibitionist Performer
--
-- Apply this only if you need to roll the prod DB back to its pre-V9 state.
-- It does NOT roll back the scoring CSVs / engine config — that lives in
-- the application code and is governed by deployment rollback.
--
-- This file lives in supabase/rollbacks/ (NOT supabase/migrations/) so the
-- standard migration runner will never auto-apply it. To execute manually:
--   psql "$DATABASE_URL" -f supabase/rollbacks/20260514120000_v9_archetype_renames_down.sql

BEGIN;

-- 1. Top-level archetype string columns.
UPDATE scoring_result
SET primary_archetype = CASE primary_archetype
  WHEN 'Tender Devotee' THEN 'Approval Seeker'
  WHEN 'Authority Conductor' THEN 'Power Orchestrator'
  WHEN 'Radiant Performer' THEN 'Exhibitionist Performer'
  ELSE primary_archetype
END
WHERE primary_archetype IN (
  'Tender Devotee',
  'Authority Conductor',
  'Radiant Performer'
);

UPDATE scoring_result
SET v5_primary_archetype = CASE v5_primary_archetype
  WHEN 'Tender Devotee' THEN 'Approval Seeker'
  WHEN 'Authority Conductor' THEN 'Power Orchestrator'
  WHEN 'Radiant Performer' THEN 'Exhibitionist Performer'
  ELSE v5_primary_archetype
END
WHERE v5_primary_archetype IN (
  'Tender Devotee',
  'Authority Conductor',
  'Radiant Performer'
);

-- 2. JSONB columns: percentages / raw_scores / diagnostics / v5_* mirror.
UPDATE scoring_result
SET
  percentages = regexp_replace(
    regexp_replace(
      regexp_replace(percentages::text,
        '"Tender Devotee"', '"Approval Seeker"', 'g'),
      '"Authority Conductor"', '"Power Orchestrator"', 'g'),
    '"Radiant Performer"', '"Exhibitionist Performer"', 'g'
  )::jsonb,
  raw_scores = regexp_replace(
    regexp_replace(
      regexp_replace(raw_scores::text,
        '"Tender Devotee"', '"Approval Seeker"', 'g'),
      '"Authority Conductor"', '"Power Orchestrator"', 'g'),
    '"Radiant Performer"', '"Exhibitionist Performer"', 'g'
  )::jsonb,
  diagnostics = regexp_replace(
    regexp_replace(
      regexp_replace(diagnostics::text,
        '"Tender Devotee"', '"Approval Seeker"', 'g'),
      '"Authority Conductor"', '"Power Orchestrator"', 'g'),
    '"Radiant Performer"', '"Exhibitionist Performer"', 'g'
  )::jsonb
WHERE
  percentages::text LIKE '%Tender Devotee%'
  OR percentages::text LIKE '%Authority Conductor%'
  OR percentages::text LIKE '%Radiant Performer%'
  OR raw_scores::text LIKE '%Tender Devotee%'
  OR raw_scores::text LIKE '%Authority Conductor%'
  OR raw_scores::text LIKE '%Radiant Performer%'
  OR diagnostics::text LIKE '%Tender Devotee%'
  OR diagnostics::text LIKE '%Authority Conductor%'
  OR diagnostics::text LIKE '%Radiant Performer%';

UPDATE scoring_result
SET
  v5_percentages = regexp_replace(
    regexp_replace(
      regexp_replace(v5_percentages::text,
        '"Tender Devotee"', '"Approval Seeker"', 'g'),
      '"Authority Conductor"', '"Power Orchestrator"', 'g'),
    '"Radiant Performer"', '"Exhibitionist Performer"', 'g'
  )::jsonb,
  v5_raw_scores = regexp_replace(
    regexp_replace(
      regexp_replace(v5_raw_scores::text,
        '"Tender Devotee"', '"Approval Seeker"', 'g'),
      '"Authority Conductor"', '"Power Orchestrator"', 'g'),
    '"Radiant Performer"', '"Exhibitionist Performer"', 'g'
  )::jsonb,
  v5_diagnostics = regexp_replace(
    regexp_replace(
      regexp_replace(v5_diagnostics::text,
        '"Tender Devotee"', '"Approval Seeker"', 'g'),
      '"Authority Conductor"', '"Power Orchestrator"', 'g'),
    '"Radiant Performer"', '"Exhibitionist Performer"', 'g'
  )::jsonb
WHERE
  v5_percentages IS NOT NULL
  AND (
    v5_percentages::text LIKE '%Tender Devotee%'
    OR v5_percentages::text LIKE '%Authority Conductor%'
    OR v5_percentages::text LIKE '%Radiant Performer%'
    OR v5_raw_scores::text LIKE '%Tender Devotee%'
    OR v5_raw_scores::text LIKE '%Authority Conductor%'
    OR v5_raw_scores::text LIKE '%Radiant Performer%'
    OR v5_diagnostics::text LIKE '%Tender Devotee%'
    OR v5_diagnostics::text LIKE '%Authority Conductor%'
    OR v5_diagnostics::text LIKE '%Radiant Performer%'
  );

COMMIT;
