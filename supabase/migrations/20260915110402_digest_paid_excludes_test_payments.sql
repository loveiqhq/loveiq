-- Exclude staff/sandbox test payments from the conversion digest's "paid" and
-- "revenue", the way every other business metric already does.
--
-- WHAT WAS WRONG. `payment-test-exclusion.test.ts` requires `is_test=is.false` on
-- every query of the `payment` table, because staff testing has put EUR 464.38 of
-- fake money in that ledger. These three functions never touched `payment` for the
-- paid COUNT -- they read `report_price_quote.purchased_at`, which fulfilment sets
-- whenever a report unlocks -- so the guard never applied to them and a staff
-- sandbox purchase counted as a sale. Measured 2026-09-15 over the digest's own
-- 30-day window: 9 recorded payments, of which 4 were flagged `is_test`.
--
-- The same message published "Paid 2 - Revenue EUR 29.00" on 2026-09-14: one real
-- EUR 29 sale plus one sandbox unlock. Revenue was right only because that sandbox
-- payment happened to be EUR 0; `money` has no `is_test` filter either, so a
-- non-zero sandbox purchase would land straight in the revenue line. The EUR 464.38
-- already in the ledger sits outside the rolling window by four months, which is
-- the only reason it is not showing today.
--
-- WHAT IS DELIBERATELY KEPT. A EUR 0 redemption of a 100%-off coupon by a real
-- visitor STILL COUNTS AS PAID (decided 2026-09-15). That is a genuine conversion
-- -- someone chose to unlock -- and `get_landing_arm_funnel_daily` already reports
-- those separately as `free_unlocks`, so no information is lost by counting them.
-- Only payments flagged `is_test` are removed. Of the 9 above, that leaves 5.
--
-- HOW. Substitution against the LIVE `pg_get_functiondef` rather than a rewritten
-- body, so this cannot silently revert an unrelated change made to these functions
-- since their own migrations were written. Every anchor RAISEs if it is missing or
-- not unique -- a substitution that quietly matches nothing is indistinguishable
-- from one that worked.

-- One definition of "this purchase was a test", so the three callers cannot drift.
--
-- A quote with NO succeeded payment row is NOT test. Fulfilment normally writes
-- one, so treating a missing row as test would silently drop real unlocks if a
-- future fulfilment path ever skips the ledger. Test-ness has to be asserted,
-- never assumed from absence.
CREATE OR REPLACE FUNCTION public.quote_purchase_is_test(quote_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
           SELECT 1 FROM payment p
            WHERE p.pricing_quote_id = quote_id AND p.status = 'succeeded' AND p.is_test
         )
     AND NOT EXISTS (
           SELECT 1 FROM payment p
            WHERE p.pricing_quote_id = quote_id AND p.status = 'succeeded' AND NOT p.is_test
         );
$$;

REVOKE ALL ON FUNCTION public.quote_purchase_is_test(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_purchase_is_test(BIGINT) TO service_role;

DO $mig$
DECLARE
  def  TEXT;
  new_def TEXT;
  hits INT;

  PROCEDURE_MISSING CONSTANT TEXT := 'digest paid/is_test migration: %s not found in public schema';

  -- (function, anchor, replacement)
  patches CONSTANT TEXT[][] := ARRAY[
    -- get_arm_cohorts: the cohort's ever_paid flag.
    ARRAY[
      'get_arm_cohorts',
      'WHERE q2.survey_submission_id = ss.id AND q2.purchased_at IS NOT NULL',
      'WHERE q2.survey_submission_id = ss.id AND q2.purchased_at IS NOT NULL'
        || E'\n               AND NOT quote_purchase_is_test(q2.id)'
    ],
    -- get_axis_funnel_daily: the per-submission reached_paid rollup.
    ARRAY[
      'get_axis_funnel_daily',
      'bool_or(q.purchased_at IS NOT NULL)        AS reached_paid',
      'bool_or(q.purchased_at IS NOT NULL AND NOT quote_purchase_is_test(q.id)) AS reached_paid'
    ],
    -- get_landing_arm_funnel_daily, 1 of 4: the daily paid count.
    ARRAY[
      'get_landing_arm_funnel_daily',
      E'     WHERE q.purchased_at >= since_ts AND q.purchased_at < until_ts\n     GROUP BY 1, 2',
      E'     WHERE q.purchased_at >= since_ts AND q.purchased_at < until_ts\n       AND NOT quote_purchase_is_test(q.id)\n     GROUP BY 1, 2'
    ],
    -- 2 of 4: charges, free_unlocks and revenue all come off this scan.
    ARRAY[
      'get_landing_arm_funnel_daily',
      E'     WHERE p.status = ''succeeded''\n       AND p.created_date_time >= since_ts',
      E'     WHERE p.status = ''succeeded''\n       AND NOT p.is_test\n       AND p.created_date_time >= since_ts'
    ],
    -- 3 of 4: the cohort paid count.
    ARRAY[
      'get_landing_arm_funnel_daily',
      'WHERE q2.survey_submission_id = s.id AND q2.purchased_at IS NOT NULL',
      'WHERE q2.survey_submission_id = s.id AND q2.purchased_at IS NOT NULL'
        || E'\n               AND NOT quote_purchase_is_test(q2.id)'
    ],
    -- 4 of 4: the cohort revenue sum, which joins payment via personal_report
    -- rather than via the quote, so it filters the column directly.
    ARRAY[
      'get_landing_arm_funnel_daily',
      'WHERE pr3.survey_submission_id = s.id AND p2.status = ''succeeded''',
      'WHERE pr3.survey_submission_id = s.id AND p2.status = ''succeeded'' AND NOT p2.is_test'
    ]
  ];
  i INT;
BEGIN
  FOR i IN 1 .. array_length(patches, 1) LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = patches[i][1];

    IF def IS NULL THEN
      RAISE EXCEPTION '%', format(PROCEDURE_MISSING, patches[i][1]);
    END IF;

    -- Exactly one occurrence, always. Zero means the body moved under us and this
    -- patch is a silent no-op; more than one means it would edit a site nobody
    -- reviewed.
    hits := (length(def) - length(replace(def, patches[i][2], ''))) / length(patches[i][2]);
    IF hits <> 1 THEN
      RAISE EXCEPTION 'digest paid/is_test migration: % matched anchor % time(s), expected exactly 1 (patch %)',
        patches[i][1], hits, i;
    END IF;

    new_def := replace(def, patches[i][2], patches[i][3]);
    IF new_def = def THEN
      RAISE EXCEPTION 'digest paid/is_test migration: patch % changed nothing', i;
    END IF;
    EXECUTE new_def;
  END LOOP;

  -- Belt and braces: every one of the three must now mention the exclusion, or
  -- some later patch in the loop replaced an earlier patch's work.
  FOR i IN 1 .. 3 LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = (ARRAY['get_arm_cohorts','get_axis_funnel_daily','get_landing_arm_funnel_daily'])[i];
    IF def NOT ILIKE '%is_test%' THEN
      RAISE EXCEPTION 'digest paid/is_test migration: % still has no test-payment exclusion',
        (ARRAY['get_arm_cohorts','get_axis_funnel_daily','get_landing_arm_funnel_daily'])[i];
    END IF;
  END LOOP;
END
$mig$;
