-- Twelve analysis functions were reporting our own test purchases as revenue.
--
-- `payment` holds 123 succeeded rows totalling EUR 1,169.29. Only 53 of them, EUR 704.91,
-- are real; the rest are staff sandbox purchases carrying `is_test = true`. Twelve of the
-- eighteen `get_*` functions that touch the table had no filter for it, including
-- `get_conversion_funnel`, which is the one anyone reaches for first and the one the admin
-- dashboard renders. It reported revenue inflated by 66% and 77 purchased reports against
-- a real 50.
--
-- Six functions already filtered correctly, so this is bringing the rest in line rather
-- than inventing a rule. A 2026-09-15 migration fixed the same defect in three DIGEST
-- functions and stopped there; these twelve were never revisited.
--
-- AND ONE FUNCTION HAD NEVER REPORTED A PURCHASE AT ALL. `get_conversion_pipeline`
-- filtered `payment.status = 'completed'`. The only statuses that column has ever held are
-- `succeeded` and `canceled` — `SELECT count(*) FROM payment WHERE status='completed'`
-- returns 0 — so `payment_completed` was structurally pinned to zero, and every
-- per-channel conversion rate beside it read 100% because that same dead count was also
-- the denominator.
--
-- 'completed' IS CORRECT ELSEWHERE and that is why this is a targeted replacement rather
-- than a global one: `survey_submission.status = 'completed'` is the real, working value,
-- and it appears seven times in that same function. Only the predicate reading `payment`
-- is touched, anchored on its own line.
--
-- The `is_test` rule is applied by regexp on `(\w+\.)?status = 'succeeded'`, where the
-- capture is empty for a bare predicate inside a payment CTE and the alias otherwise, so
-- one rule covers both spellings. It is safe to key on that string because
-- `status = 'succeeded'` only ever refers to `payment` in this schema — surveys are
-- 'completed', and nothing else in these functions has a `succeeded` state.
--
-- VERIFIED AFTER APPLYING, against figures computed independently of the functions:
--
--   get_conversion_funnel   purchased  77 -> 50      truth: 50 distinct reports paid
--   get_conversion_funnel   revenue  1169.29 -> 704.91   truth: EUR 704.91
--   get_conversion_pipeline payment_completed 0 -> 53    truth: 53 succeeded non-test
--
-- and all eighteen payment-touching functions were then executed to confirm none throws.
--
-- NOT FIXED HERE, deliberately, because they are different defects and want their own
-- measurement: `get_nurture_performance` still matches a hardcoded five-stage array from
-- pricing 1.0, so the only stage that now runs is absent from it; and
-- `get_conversion_pipeline`'s `waitlist_signups` does not agree with a direct count of the
-- table.
DO $mig$
DECLARE
  fn text;
  def text;
  out text;
  changed int := 0;
  fns text[] := ARRAY[
    'get_answer_conversion_lift','get_archetype_sparklines','get_channel_sparklines',
    'get_conversion_funnel','get_conversion_pipeline','get_engagement_purchase_lift',
    'get_forced_paywall_ab','get_funnel_sparklines','get_landing_variant_funnel',
    'get_nurture_performance','get_report_pricing_metrics','get_velocity_percentiles'];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
    WHERE n2.nspname = 'public' AND p.proname = fn;

    IF def IS NULL THEN
      RAISE EXCEPTION 'function % not found — refusing to guess', fn;
    END IF;

    -- Idempotent: re-running would otherwise append the filter a second time.
    IF def ~* 'is_test' THEN
      CONTINUE;
    END IF;

    IF fn = 'get_conversion_pipeline' THEN
      IF position('WHERE status = ''completed'' AND created_date_time >= effective_since' in def) = 0 THEN
        RAISE EXCEPTION 'pipeline dead-status anchor has moved — re-derive from pg_get_functiondef';
      END IF;
      def := replace(def,
        E'SELECT COUNT(*)::int FROM payment\n        WHERE status = ''completed'' AND created_date_time >= effective_since',
        E'SELECT COUNT(*)::int FROM payment\n        WHERE status = ''succeeded'' AND created_date_time >= effective_since');
    END IF;

    out := regexp_replace(def,
      '(\w+\.)?status = ''succeeded''',
      '\1status = ''succeeded'' AND coalesce(\1is_test, false) = false',
      'g');

    IF out = def THEN
      RAISE EXCEPTION 'no succeeded-predicate found in % — refusing to guess', fn;
    END IF;

    EXECUTE out;
    changed := changed + 1;
  END LOOP;
  RAISE NOTICE 'sandbox filter applied to % function(s)', changed;
END $mig$;
