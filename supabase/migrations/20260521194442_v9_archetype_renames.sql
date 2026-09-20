-- V9 scoring workbook renames 3 archetypes (same slots, same bias values,
-- same prototype values — display-name change only). This migration updates
-- existing scoring_result rows so post-merge admin dashboards keep working
-- without a code-side alias layer.
--
-- Renames:
--   Approval Seeker         -> Tender Devotee
--   Power Orchestrator      -> Authority Conductor
--   Exhibitionist Performer -> Radiant Performer
--
-- Touched columns: primary_archetype, v5_primary_archetype (jsonb columns
-- percentages / raw_scores / diagnostics / v5_percentages / v5_raw_scores /
-- v5_diagnostics also contain the old names as keys / values — rewritten in
-- place via jsonb string replacement).
--
-- Safe to re-run: idempotent (no rows contain the old names after first run).

BEGIN;

-- 1. Top-level archetype string columns.
UPDATE scoring_result
SET primary_archetype = CASE primary_archetype
  WHEN 'Approval Seeker' THEN 'Tender Devotee'
  WHEN 'Power Orchestrator' THEN 'Authority Conductor'
  WHEN 'Exhibitionist Performer' THEN 'Radiant Performer'
  ELSE primary_archetype
END
WHERE primary_archetype IN (
  'Approval Seeker',
  'Power Orchestrator',
  'Exhibitionist Performer'
);

UPDATE scoring_result
SET v5_primary_archetype = CASE v5_primary_archetype
  WHEN 'Approval Seeker' THEN 'Tender Devotee'
  WHEN 'Power Orchestrator' THEN 'Authority Conductor'
  WHEN 'Exhibitionist Performer' THEN 'Radiant Performer'
  ELSE v5_primary_archetype
END
WHERE v5_primary_archetype IN (
  'Approval Seeker',
  'Power Orchestrator',
  'Exhibitionist Performer'
);

-- 2. JSONB columns: percentages / raw_scores / diagnostics / v5_* mirror.
--    Old archetype names appear as object keys (percentages, raw_scores) and
--    as string values inside diagnostics. Rewrite the JSONB as text, swap, and
--    cast back. Cheap given small documents; one-time migration.
UPDATE scoring_result
SET
  percentages = regexp_replace(
    regexp_replace(
      regexp_replace(percentages::text,
        '"Approval Seeker"', '"Tender Devotee"', 'g'),
      '"Power Orchestrator"', '"Authority Conductor"', 'g'),
    '"Exhibitionist Performer"', '"Radiant Performer"', 'g'
  )::jsonb,
  raw_scores = regexp_replace(
    regexp_replace(
      regexp_replace(raw_scores::text,
        '"Approval Seeker"', '"Tender Devotee"', 'g'),
      '"Power Orchestrator"', '"Authority Conductor"', 'g'),
    '"Exhibitionist Performer"', '"Radiant Performer"', 'g'
  )::jsonb,
  diagnostics = regexp_replace(
    regexp_replace(
      regexp_replace(diagnostics::text,
        '"Approval Seeker"', '"Tender Devotee"', 'g'),
      '"Power Orchestrator"', '"Authority Conductor"', 'g'),
    '"Exhibitionist Performer"', '"Radiant Performer"', 'g'
  )::jsonb
WHERE
  percentages::text LIKE '%Approval Seeker%'
  OR percentages::text LIKE '%Power Orchestrator%'
  OR percentages::text LIKE '%Exhibitionist Performer%'
  OR raw_scores::text LIKE '%Approval Seeker%'
  OR raw_scores::text LIKE '%Power Orchestrator%'
  OR raw_scores::text LIKE '%Exhibitionist Performer%'
  OR diagnostics::text LIKE '%Approval Seeker%'
  OR diagnostics::text LIKE '%Power Orchestrator%'
  OR diagnostics::text LIKE '%Exhibitionist Performer%';

UPDATE scoring_result
SET
  v5_percentages = regexp_replace(
    regexp_replace(
      regexp_replace(v5_percentages::text,
        '"Approval Seeker"', '"Tender Devotee"', 'g'),
      '"Power Orchestrator"', '"Authority Conductor"', 'g'),
    '"Exhibitionist Performer"', '"Radiant Performer"', 'g'
  )::jsonb,
  v5_raw_scores = regexp_replace(
    regexp_replace(
      regexp_replace(v5_raw_scores::text,
        '"Approval Seeker"', '"Tender Devotee"', 'g'),
      '"Power Orchestrator"', '"Authority Conductor"', 'g'),
    '"Exhibitionist Performer"', '"Radiant Performer"', 'g'
  )::jsonb,
  v5_diagnostics = regexp_replace(
    regexp_replace(
      regexp_replace(v5_diagnostics::text,
        '"Approval Seeker"', '"Tender Devotee"', 'g'),
      '"Power Orchestrator"', '"Authority Conductor"', 'g'),
    '"Exhibitionist Performer"', '"Radiant Performer"', 'g'
  )::jsonb
WHERE
  v5_percentages IS NOT NULL
  AND (
    v5_percentages::text LIKE '%Approval Seeker%'
    OR v5_percentages::text LIKE '%Power Orchestrator%'
    OR v5_percentages::text LIKE '%Exhibitionist Performer%'
    OR v5_raw_scores::text LIKE '%Approval Seeker%'
    OR v5_raw_scores::text LIKE '%Power Orchestrator%'
    OR v5_raw_scores::text LIKE '%Exhibitionist Performer%'
    OR v5_diagnostics::text LIKE '%Approval Seeker%'
    OR v5_diagnostics::text LIKE '%Power Orchestrator%'
    OR v5_diagnostics::text LIKE '%Exhibitionist Performer%'
  );

COMMIT;
