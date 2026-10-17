-- Rollback for 20261018120000_pay_to_start_entitlement. FIRST deploy code that no longer
-- writes these columns (the pay-to-start routes), or every checkout fails on an unknown
-- column. The rows stay; what the journey recorded beyond June's columns goes (the offer,
-- list price, buyer email, test flag, paid and claimed times, attribution). Expired rows
-- are set back to pending, because June's CHECK has no 'expired'.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261018120000_pay_to_start_entitlement_down.sql

BEGIN;

UPDATE public.prepaid_report_access SET status = 'pending' WHERE status = 'expired';

DELETE FROM system_flags WHERE key = 'pay_to_start_checkout';

ALTER TABLE public.prepaid_report_access
  DROP CONSTRAINT IF EXISTS prepaid_report_access_status_check;
ALTER TABLE public.prepaid_report_access
  ADD CONSTRAINT prepaid_report_access_status_check
  CHECK (status IN ('pending', 'succeeded', 'refunded'));

ALTER TABLE public.prepaid_report_access
  DROP CONSTRAINT IF EXISTS prepaid_report_access_offer_check;

ALTER TABLE public.prepaid_report_access
  DROP COLUMN IF EXISTS offer,
  DROP COLUMN IF EXISTS list_price_cents,
  DROP COLUMN IF EXISTS customer_email,
  DROP COLUMN IF EXISTS is_test,
  DROP COLUMN IF EXISTS paid_at,
  DROP COLUMN IF EXISTS consumed_at,
  DROP COLUMN IF EXISTS utm_tracker;

COMMIT;

DROP INDEX CONCURRENTLY IF EXISTS public.uq_prepaid_report_access_offer_session;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_prepaid_report_access_payment_intent;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_prepaid_report_access_consumed_submission;
