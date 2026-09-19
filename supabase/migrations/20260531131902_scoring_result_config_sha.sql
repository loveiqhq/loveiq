-- F-03: scoring_result.config_sha
--
-- Stores SHA-256 of the in-memory scoring config at the moment a row was
-- written. When CSVs (gates / boosts / calibration / archetype names) change,
-- existing rows preserve the hash of the config that produced them so a
-- dispute or audit can replay the exact decision.
--
-- engine_version stays at "v4+v5" across config refreshes (V7→V8→V9 etc.);
-- config_sha is the finer-grained identifier.

BEGIN;

ALTER TABLE scoring_result
  ADD COLUMN IF NOT EXISTS config_sha text;

COMMIT;

-- Index created CONCURRENTLY outside the transaction. scoring_result may have
-- millions of rows in prod; a non-concurrent index build would hold an
-- ACCESS EXCLUSIVE lock for the duration.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scoring_result_config_sha
  ON scoring_result (config_sha);
