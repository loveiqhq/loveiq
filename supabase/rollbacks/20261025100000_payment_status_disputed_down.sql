-- Rollback of 20261025100000_payment_status_disputed: the CHECK without 'disputed' again.
-- It fails while a payment is 'disputed' (an open chargeback): settle those first. Then delete
-- the migration's ledger row.

BEGIN;

ALTER TABLE public.payment DROP CONSTRAINT payment_status_check;
ALTER TABLE public.payment ADD CONSTRAINT payment_status_check CHECK (
  status IS NULL OR status = ANY (ARRAY[
    'requires_payment_method', 'requires_action', 'processing',
    'succeeded', 'canceled', 'failed', 'refunded'
  ])
);

COMMIT;
