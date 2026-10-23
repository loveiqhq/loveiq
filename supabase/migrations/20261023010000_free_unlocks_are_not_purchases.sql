-- Free unlocks are not purchases, in the two RPCs that still counted them: get_dropoff_everywhere
-- ("purchased", the last step of the conversion digest's funnel, features/admin/server/
-- digest-metrics.ts) and get_conversion_pipeline ("payment_completed", the admin strategy and
-- metric library).
--
-- Two EUR 0 rows unlock a report without anyone buying it:
--   - the unlock-feedback grant (metadata.source = 'unlock_feedback'): a reader answered "why
--     didn't you unlock?" and got the full report free (live since 2026-10-22, #633);
--   - E07's day-4 gift (metadata.gifted = 'e07', the EUR 1.99 pre-unlock gate; ships off).
-- Both functions counted every succeeded, non-test payment, so each answer and each gift would
-- have read as a sale. AP-Analytics (ap_facts), the KPI week and the digest's other readers
-- already leave EUR 0 rows out.
--
-- KEPT: a EUR 0 redemption of a 100%-off coupon by a real visitor still counts as paid (decided
-- 2026-09-15, 20260915110402): someone chose to unlock. Only the two free unlocks leave.
--
-- HOW: substitution against the LIVE definition, as 20260915110402 does, so nothing else in
-- either body can be reverted by this. Every anchor must match exactly once, or it raises.
-- Rollback: supabase/rollbacks/20261023010000_free_unlocks_are_not_purchases_down.sql

DO $mig$
DECLARE
  def     TEXT;
  new_def TEXT;
  hits    INT;
  i       INT;
  -- (function, anchor, replacement)
  patches CONSTANT TEXT[][] := ARRAY[
    ARRAY[
      'get_conversion_pipeline',
      'WHERE status = ''succeeded'' AND coalesce(is_test, false) = false AND created_date_time >= effective_since',
      'WHERE status = ''succeeded'' AND coalesce(is_test, false) = false AND created_date_time >= effective_since'
        || E'\n          AND metadata->>''gifted'' IS NULL AND coalesce(metadata->>''source'', '''') <> ''unlock_feedback'''
    ],
    ARRAY[
      'get_dropoff_everywhere',
      E'          AND is_test = false\n',
      E'          AND is_test = false\n'
        || E'          AND metadata->>''gifted'' IS NULL\n'
        || E'          AND coalesce(metadata->>''source'', '''') <> ''unlock_feedback''\n'
    ]
  ];
BEGIN
  FOR i IN 1 .. array_length(patches, 1) LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = patches[i][1];

    IF def IS NULL THEN
      RAISE EXCEPTION 'free-unlock migration: % not found in public schema', patches[i][1];
    END IF;

    -- Already patched (a re-run): leave it, rather than add the lines twice.
    CONTINUE WHEN def LIKE '%<> ''unlock_feedback''%';

    -- Exactly one occurrence: zero means the body moved under us and this would be a silent
    -- no-op; more than one means it would edit a site nobody reviewed.
    hits := (length(def) - length(replace(def, patches[i][2], ''))) / length(patches[i][2]);
    IF hits <> 1 THEN
      RAISE EXCEPTION 'free-unlock migration: % matched anchor % time(s), expected exactly 1',
        patches[i][1], hits;
    END IF;

    new_def := replace(def, patches[i][2], patches[i][3]);
    IF new_def = def THEN
      RAISE EXCEPTION 'free-unlock migration: patch % changed nothing', i;
    END IF;
    EXECUTE new_def;
  END LOOP;

  -- Both must now name both exclusions.
  FOR i IN 1 .. 2 LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = (ARRAY['get_conversion_pipeline', 'get_dropoff_everywhere'])[i];
    IF def NOT LIKE '%gifted%' OR def NOT LIKE '%unlock_feedback%' THEN
      RAISE EXCEPTION 'free-unlock migration: % still counts a free unlock',
        (ARRAY['get_conversion_pipeline', 'get_dropoff_everywhere'])[i];
    END IF;
  END LOOP;
END
$mig$;
