-- DOWN migration for 20260527120300_slack_dead_letter.sql.
--
-- Drops the Slack dead-letter table (+ its two indexes + RLS policy, removed
-- automatically with the table). With the table gone, notifySlack()'s DLQ
-- write fails best-effort (logged with slack:false and dropped), so Slack
-- delivery itself still works — only the post-incident replay trail is lost.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260527120300_slack_dead_letter_down.sql

BEGIN;

DROP TABLE IF EXISTS slack_dead_letter;

COMMIT;
