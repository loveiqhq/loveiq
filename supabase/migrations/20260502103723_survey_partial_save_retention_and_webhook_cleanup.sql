-- Survey partial-save retention. Partial saves contain raw PII answers
-- (sometimes intimate). Once a submission completes, the matching row is
-- deleted by the app; this cron sweeps abandoned drafts after 30 days so
-- we don't accumulate PII for users who never finish the survey.
DELETE FROM public.survey_partial_save
 WHERE saved_at < now() - interval '30 days';

-- Schedule daily cleanup at 03:30 UTC (offset from the existing 03:00
-- rate-limit cleanup so they don't run simultaneously).
SELECT cron.schedule(
  'cleanup-stale-survey-partial-saves',
  '30 3 * * *',
  $$DELETE FROM public.survey_partial_save WHERE saved_at < now() - interval '30 days'$$
);

-- Retroactively mark the orphan checkout.session.expired webhook event as
-- processed. It pre-dates the graceful-skip code path in
-- lib/checkout/fulfillment.ts; no payment was taken on this Stripe session,
-- so there is nothing to fulfill.
UPDATE public.payment_webhook_event
   SET processed = true,
       processed_at = COALESCE(processed_at, now()),
       processing_error = NULL
 WHERE NOT processed
   AND event_type IN ('checkout.session.expired',
                      'checkout.session.async_payment_failed')
   AND processing_error = 'stripe_checkout_missing_plan';
