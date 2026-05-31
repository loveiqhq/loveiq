-- DOWN migration for 20260526120000_resend_webhook_event.sql.
--
-- Drops the Resend webhook idempotency table (+ index + RLS policy, removed
-- automatically with the table). With it gone, claimResendEvent() in
-- app/api/resend/webhook/route.ts fails OPEN (returns "new" → processes), so
-- the webhook keeps working but loses duplicate suppression. Run only when
-- reverting R-02.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260526120000_resend_webhook_event_down.sql

BEGIN;

DROP TABLE IF EXISTS resend_webhook_event;

COMMIT;
