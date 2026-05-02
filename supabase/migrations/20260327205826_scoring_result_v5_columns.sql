ALTER TABLE scoring_result
  ADD COLUMN IF NOT EXISTS v5_primary_archetype text,
  ADD COLUMN IF NOT EXISTS v5_percentages       jsonb,
  ADD COLUMN IF NOT EXISTS v5_raw_scores        jsonb,
  ADD COLUMN IF NOT EXISTS v5_diagnostics       jsonb;;
