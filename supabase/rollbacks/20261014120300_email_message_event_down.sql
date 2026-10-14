-- Rollback for 20261014120300_email_message_event. FIRST put ap_report_extras back to a body
-- that does not read this table (the rollback of 20261014130000), or the admin's Report page
-- fails on every load. The webhook's insert is best effort: with the table gone it logs a
-- warning per event and carries on. Deletes every delivery, open and click recorded since.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261014120300_email_message_event_down.sql

BEGIN;

DROP TABLE IF EXISTS public.email_message_event;

COMMIT;
