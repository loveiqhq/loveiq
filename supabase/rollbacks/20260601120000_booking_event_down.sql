-- DOWN migration for 20260601120000_booking_event.sql.
--
-- Drops the call-funnel tables (+ indexes + RLS policies, removed automatically
-- with the tables). DATA LOSS: removes every booking_event row (call invites,
-- bookings, cancellations, post-call coupon grants) and the Calendly webhook
-- idempotency ledger. With calendly_webhook_event gone, the Calendly webhook
-- loses duplicate suppression (it fails OPEN → reprocesses). Run only when
-- reverting the 78h call-funnel feature.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260601120000_booking_event_down.sql

BEGIN;

DROP TABLE IF EXISTS booking_event;
DROP TABLE IF EXISTS calendly_webhook_event;

COMMIT;
