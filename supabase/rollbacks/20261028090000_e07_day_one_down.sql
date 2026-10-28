-- Rollback of 20261028090000_e07_day_one: the switch's day-4 description again (only right if
-- the cron's GIFT_AFTER_MS goes back to four days too). Idempotent. Then delete the
-- migration's ledger row.
--   psql "$DATABASE_URL" -f supabase/rollbacks/20261028090000_e07_day_one_down.sql

BEGIN;

UPDATE system_flags
SET description = 'E07, the day-4 Core Archetype gift (RFD > Pre-Unlock). On: four days after a reader first saw the gate without paying, 80% get the Core Archetype gifted and the email, 20% are a holdout that gets nothing. Off: nothing is gifted or sent.'
WHERE key = 'initial_unlock_gift_email';

COMMIT;
