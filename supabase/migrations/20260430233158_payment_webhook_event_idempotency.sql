-- ═══════════════════════════════════════════════════════════════════════════
-- payment_webhook_event idempotency
-- ═══════════════════════════════════════════════════════════════════════════
-- Stripe re-delivers webhooks on retry (network blip, slow ack, etc.).
-- Without a UNIQUE constraint on stripe_event_id, concurrent retries can both
-- pass the application-level "already processed?" check and double-process,
-- causing duplicate payment rows / duplicate emails.
--
-- Adding the unique index makes idempotency atomic at the DB layer:
-- the second insert returns 23505 and fulfillment.ts treats it as a no-op.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'payment_webhook_event_stripe_event_id_unique'
  ) THEN
    -- Defensive: collapse any pre-existing duplicates so the constraint can land.
    -- Keeps the lowest id per stripe_event_id.
    DELETE FROM payment_webhook_event a
    USING payment_webhook_event b
    WHERE a.stripe_event_id IS NOT NULL
      AND a.stripe_event_id = b.stripe_event_id
      AND a.id > b.id;

    ALTER TABLE payment_webhook_event
      ADD CONSTRAINT payment_webhook_event_stripe_event_id_unique
      UNIQUE (stripe_event_id);
  END IF;
END $$;
