-- Add V5 scoring columns to scoring_result table
-- V5 produces independent match percentages (not summing to 100) alongside V4 probabilities
ALTER TABLE scoring_result
  ADD COLUMN IF NOT EXISTS v5_primary_archetype text,
  ADD COLUMN IF NOT EXISTS v5_percentages       jsonb,
  ADD COLUMN IF NOT EXISTS v5_raw_scores        jsonb,
  ADD COLUMN IF NOT EXISTS v5_diagnostics       jsonb;
