-- DOWN migration for 20260526120100_payment_unique_constraints.sql.
--
-- Drops the two partial UNIQUE indexes on payment Stripe IDs. Dropped
-- CONCURRENTLY (no transaction) so the drop never takes an ACCESS EXCLUSIVE
-- lock on the payment table.
--
-- WARNING: reverting re-opens the duplicate-payment-row race the forward
-- migration closed (webhook + status-poll + sweep can each INSERT the same
-- charge). Only run if a constraint is wrongly blocking a legitimate insert
-- and you need breathing room while you investigate.
--
-- NOTE: no BEGIN/COMMIT — DROP INDEX CONCURRENTLY is not allowed in a txn.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260526120100_payment_unique_constraints_down.sql

DROP INDEX CONCURRENTLY IF EXISTS idx_payment_stripe_payment_intent_id_unique;
DROP INDEX CONCURRENTLY IF EXISTS idx_payment_stripe_charge_id_unique;
