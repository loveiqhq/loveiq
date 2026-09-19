-- DOWN migration for 20260824200000_slack_journey_message.sql.
--
-- Drops the message-id table. Consequence: already-posted journey notifications
-- stop updating (their ids are gone) and new ones fall back to a single
-- non-updating post. No user-facing data is lost — the table holds no message
-- content, no email and no answers.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260824200000_slack_journey_message_down.sql

BEGIN;

DROP TABLE IF EXISTS public.slack_journey_message;

COMMIT;
