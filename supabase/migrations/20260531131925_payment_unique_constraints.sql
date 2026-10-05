-- T-05: payment table — partial UNIQUE constraints on the two Stripe IDs.
--
-- Why: webhook idempotency is enforced on payment_webhook_event.stripe_event_id
-- (migration 20260430130000), but THREE code paths can hit `upsertPaymentRecord`:
--   1. the webhook handler (events.stripe.com → /api/stripe/webhook)
--   2. the status-poll fallback (/api/stripe/checkout-session-status)
--   3. the payment-fulfillment-sweep cron
-- Each does a SELECT lookup first, then an INSERT — but that's not atomic.
-- Two paths racing can both pass the lookup and both INSERT, producing
-- duplicate payment rows for the same Stripe charge / payment intent. Downstream
-- damage: double-counted revenue in admin dashboards; refund handler targets
-- one row and misses the other.
--
-- Partial because Stripe IDs are nullable (a row may be inserted before the
-- intent or charge exists — e.g., abandoned-checkout sweep). NULL is allowed
-- to repeat; non-NULL must be unique.

-- migration-lint: ignore
-- (Reason: pure index addition. CONCURRENTLY used; can't go inside transaction.
--  Backfill of existing dupes — if any — would need a separate cleanup step.
--  This migration assumes the prod table is currently clean. Verify via:
--  `SELECT stripe_payment_intent_id, COUNT(*) FROM payment WHERE stripe_payment_intent_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;`
--  before applying. If dupes exist, fix them first.
--  Pre-check run 2026-05-31 against prod (pveqkhdpypfzxggwjsnk): 0 duplicate
--  groups for both stripe_payment_intent_id and stripe_charge_id — clean. Re-run
--  immediately before applying in case new rows landed since.)

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_stripe_payment_intent_id_unique
  ON public.payment (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_stripe_charge_id_unique
  ON public.payment (stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;
