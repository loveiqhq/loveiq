-- A chargeback re-locks the report: payment.status may be 'disputed'.
--
-- features/checkout/server/fulfillment.ts syncDisputeEvent writes status 'disputed' on
-- charge.dispute.created (and 'succeeded' again when the dispute is won), and report access
-- reads only succeeded payments. The CHECK from 20260307100000_normalized_schema never allowed
-- 'disputed', so that PATCH was refused (400) and the webhook threw
-- payment_dispute_update_failed before re-locking the report or posting the ops alert. No
-- dispute had happened yet (25 Oct 2026: no disputed or refunded payment). Widening a CHECK
-- accepts every existing row.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.payment DROP CONSTRAINT payment_status_check;
ALTER TABLE public.payment ADD CONSTRAINT payment_status_check CHECK (
  status IS NULL OR status = ANY (ARRAY[
    'requires_payment_method', 'requires_action', 'processing',
    'succeeded', 'canceled', 'failed', 'refunded', 'disputed'
  ])
);

COMMIT;
