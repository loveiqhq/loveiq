-- The brain was publishing a revenue forecast overstated by ~4.3x, and calling it "high
-- confidence" on five real data points.
--
-- `get_predictive_insights` emits seven insights. The seventh, `revenue_forecast`, is
-- wrong in four independent ways, all read out of the deployed function body on
-- 2026-09-12 and all reproduced against production:
--
--   v_payment_conv_rate := count(*) filter (status='succeeded') / count(*)   -- from `payment`
--   v_avg_payment       := avg(amount) filter (status='succeeded')
--   v_projected_revenue := v_daily_submissions * v_payment_conv_rate * v_avg_payment * 30
--
-- 1. NO `is_test` FILTER, anywhere in the branch. In the last 30 days the payment ledger
--    held 46 succeeded rows of which 41 were test, so `avg(amount)` came out at EUR 2.80
--    against a real average of EUR 25.80. Test money outnumbers real money in that table.
-- 2. DIMENSIONALLY INCOHERENT. `v_payment_conv_rate` is a payment-ATTEMPT success rate --
--    succeeded payments over attempted payments -- and it is multiplied by SUBMISSIONS.
--    Those are different denominators; the product is not a conversion rate of anything.
-- 3. EUR PRINTED AS DOLLARS. The title hardcodes '$'.
-- 4. CONFIDENCE COMPUTED FROM THE CONTAMINATED COUNT. `v_payment_count` is all 46
--    succeeded rows, which clears the `> 10` bar and reports 'high'. On the 5 real
--    payments the same rule says 'low'.
--
-- Output on the day it was found: "Projected 30-day revenue: $549.20 ... based on 13.8
-- submissions/day, 47.4% conversion, and $2.80 avg payment." The honest figure for that
-- window is about EUR 129.
--
-- DELETED RATHER THAN FIXED, deliberately. A 30-day forecast built on five payments is
-- not information at any level of arithmetic care. Revenue is already answered correctly
-- by `get_business_numbers` over `brain_daily_rollup`, whose definition reconciles to
-- Stripe to the cent and excludes test rows at source. And the system was refusing and
-- inventing at the same time: the battery declines "what will our revenue be in December
-- 2027" while this function published a 30-day projection unprompted.
--
-- WHY IT SURVIVED SIX MONTHS: every one of the seven branches is wrapped in
-- `EXCEPTION WHEN OTHERS THEN NULL`, so a branch can be arbitrarily wrong, or throw
-- outright, and the function still returns a clean-looking array. The other six are not
-- audited here; that swallow is the reason to be suspicious of all of them.
--
-- Edited by substitution against the live definition rather than by re-pasting a 300-line
-- function to change one block. The RAISE matters more than the cut: a missed anchor
-- would otherwise "succeed" and leave the forecast exactly where it was.

DO $do$
DECLARE
  src   text;
  head  text := E'  -- =========================================================================\n  -- 7. Revenue Forecast';
  tail  text := E'  -- =========================================================================\n  -- Assemble final result';
  a     integer;
  b     integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proname = 'get_predictive_insights' AND n.nspname = 'public';

  IF src IS NULL THEN
    RAISE EXCEPTION 'get_predictive_insights does not exist; nothing to edit';
  END IF;
  IF position('revenue_forecast' IN src) = 0 THEN
    RAISE NOTICE 'the revenue forecast is already gone; leaving the function alone';
    RETURN;
  END IF;

  a := position(head IN src);
  b := position(tail IN src);
  IF a = 0 OR b = 0 OR b <= a THEN
    RAISE EXCEPTION 'could not locate the revenue-forecast block — the function has changed shape, edit by hand';
  END IF;

  -- The now-unused DECLAREd variables (v_projected_revenue, v_avg_payment,
  -- v_payment_conv_rate, v_revenue_confidence, v_actual_revenue, v_payment_count,
  -- v_daily_submissions) are left in place: plpgsql does not object to them, and
  -- editing the DECLARE block by substitution is a second chance to cut the wrong line.
  src := left(src, a - 1) || substr(src, b);
  EXECUTE src;

  IF position('revenue_forecast' IN (
       SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'get_predictive_insights' AND n.nspname = 'public')) > 0 THEN
    RAISE EXCEPTION 'the forecast is still in the function after the rewrite';
  END IF;
END
$do$;
