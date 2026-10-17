-- Pay to start the survey (Notion "RFD > Pay to start survey", Figma Report-3.0 1741:3820).
--
-- A visitor pays on /sexual-archetype before any survey, user or report exists, so the
-- payment cannot be a `payment` row yet (payment.user_id is NOT NULL). June's pay-first
-- test (20260613230000) built prepaid_report_access for exactly that, and this journey
-- reuses it: the row is the entitlement from checkout until a submitted survey claims it,
-- at which point the usual payment row, report link and tier are written.
--
-- Additive only. New nullable columns (is_test has a default), the status CHECK gains
-- 'expired', three indexes, and the system_flags row for the checkout's kill switch. June's nine rows keep offer NULL, so the partial unique
-- index and every journey lookup (which filter on offer) leave them alone.
--
--   offer             what was sold: 'full' (survey + full report) or 'pre' (reserved for
--                     the EUR 1.99 Pre-Payments variant, Figma 1741:5587; not on sale)
--   list_price_cents  the price on the page when checkout started. amount_cents is what was
--                     actually paid, which a promotion code lowers, and "at which price does
--                     this work" needs the price that was offered
--   customer_email    the address Stripe collected: our confirmation email, the
--                     double-payment check, staff detection. Personal data, covered by the
--                     DSAR export and erase like every other email column
--   is_test           a staff address paid (left out of revenue and readouts, as payment.is_test)
--   paid_at           when the money arrived, so revenue lands on that day and not on the
--                     day the survey was finished
--   consumed_at       when a submission claimed it. consumed_submission_id is ON DELETE SET
--                     NULL, so a deleted submission would otherwise free the row for a
--                     second claim; the claim also requires payment_id IS NULL
--   utm_tracker       the landing page's attribution snapshot (UTMs, gclid), JSON text, for
--                     payments whose survey is never finished
--
-- APPLY BEFORE DEPLOYING the routes that write these columns: PostgREST refuses a column it
-- does not know, so every checkout would fail.
-- Rollback: supabase/rollbacks/20261018120000_pay_to_start_entitlement_down.sql

BEGIN;

ALTER TABLE public.prepaid_report_access
  ADD COLUMN IF NOT EXISTS offer text,
  ADD COLUMN IF NOT EXISTS list_price_cents integer,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS utm_tracker text;

DO $migration$
DECLARE
  status_def TEXT;
BEGIN
  -- offer: only the offers the code knows. Idempotent.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'prepaid_report_access'
       AND con.conname = 'prepaid_report_access_offer_check'
  ) THEN
    ALTER TABLE public.prepaid_report_access
      ADD CONSTRAINT prepaid_report_access_offer_check
      CHECK (offer IS NULL OR offer IN ('full', 'pre'));
  END IF;

  -- status: June's inline CHECK, rewritten in full after asserting it is still the set
  -- 20260613230000 wrote. Replacing a set that has gained a value since would remove it.
  SELECT pg_get_constraintdef(con.oid) INTO status_def
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname = 'prepaid_report_access'
     AND con.conname = 'prepaid_report_access_status_check';

  IF status_def IS NULL THEN
    RAISE EXCEPTION
      'prepaid_report_access_status_check not found, refusing to guess at the allowed statuses';
  END IF;

  IF position('expired' IN status_def) > 0 THEN
    RAISE NOTICE 'prepaid_report_access already allows expired, nothing to do';
  ELSIF position('pending' IN status_def) = 0
     OR position('succeeded' IN status_def) = 0
     OR position('refunded' IN status_def) = 0 THEN
    RAISE EXCEPTION
      'the status CHECK is not the one this migration was written against (%), re-read it first',
      status_def;
  ELSE
    ALTER TABLE public.prepaid_report_access
      DROP CONSTRAINT prepaid_report_access_status_check;
    ALTER TABLE public.prepaid_report_access
      ADD CONSTRAINT prepaid_report_access_status_check
      CHECK (status IN ('pending', 'succeeded', 'refunded', 'expired'));
  END IF;
END
$migration$;

-- The kill switch: when false, /api/stripe/pay-to-start sells nothing. isFeatureEnabled()
-- fails open, so a missing row means on; the row is what puts it in the admin panel.
INSERT INTO system_flags (key, enabled, description) VALUES
  ('pay_to_start_checkout', true,
    'Gates the pay-to-start checkout on /sexual-archetype (Pay to start the survey). Off: the page stays up and its buttons say checkout is paused; nothing is charged. Payments already made are unaffected.')
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- Indexes CONCURRENTLY, outside the transaction (Postgres requirement and the migration lint).
-- One journey row per Stripe session; June's rows (offer NULL) are not covered.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_prepaid_report_access_offer_session
  ON public.prepaid_report_access (stripe_session_id)
  WHERE offer IS NOT NULL AND stripe_session_id IS NOT NULL;
-- Refunds and disputes arrive with a PaymentIntent.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prepaid_report_access_payment_intent
  ON public.prepaid_report_access (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
-- "Which entitlement did this submission claim" (replays, the pre-unlock skip).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prepaid_report_access_consumed_submission
  ON public.prepaid_report_access (consumed_submission_id)
  WHERE consumed_submission_id IS NOT NULL;
