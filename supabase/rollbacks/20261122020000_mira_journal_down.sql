-- Rollback of 20261122020000_mira_journal.sql: the journal's table and mira_user's journal columns
-- go. Roll the code back first: it reads and writes both. Dropping the table deletes every journal
-- entry.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261122020000_mira_journal_down.sql

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP TABLE IF EXISTS public.mira_journal_entry;

ALTER TABLE public.mira_user
  DROP COLUMN IF EXISTS journal_share,
  DROP COLUMN IF EXISTS journal_share_at,
  DROP COLUMN IF EXISTS journal_reminder_time,
  DROP COLUMN IF EXISTS journal_reminded_on;

COMMIT;
