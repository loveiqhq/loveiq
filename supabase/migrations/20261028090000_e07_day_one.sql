-- E07 goes out a day after a reader first sees the EUR 1.99 gate, not four (Marcus, LoveIQ
-- Sync 27 Oct 2026; app/api/cron/initial-unlock-gift). The description of its switch, seeded
-- by 20261020090000 and shown beside it on the admin flags page, says so. Data only: one row,
-- no schema change. Rollback: supabase/rollbacks/20261028090000_e07_day_one_down.sql.

BEGIN;

UPDATE system_flags
SET description = 'E07, the day-1 Core Archetype gift (RFD > Pre-Unlock). On: a day after a reader first saw the gate without paying, 80% get the Core Archetype gifted and the email, 20% are a holdout that gets nothing. Off: nothing is gifted or sent.'
WHERE key = 'initial_unlock_gift_email';

COMMIT;
