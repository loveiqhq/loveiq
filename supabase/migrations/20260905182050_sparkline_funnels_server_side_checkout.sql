-- Finish the job started in 20260905171928: put the CHECKOUT checkpoint on the
-- server-side signal in the sparkline funnels too, and stop counting staff test
-- purchases in their `purchased` stage.
--
-- 20260905171928 fixed `get_dropoff_everywhere`, which left the digest
-- self-contradictory in a subtler way than before: its funnel chart counted 14
-- checkouts while the sparkline beside it counted 9, for the same window. The
-- original complaint was that the same reader showed as reaching checkout in one
-- place and not another, so fixing one RPC and not the others just moved the
-- inconsistency rather than removing it.
--
-- Both stages change the same way as in that migration:
--   begin_checkout → report_price_quote.checkout_started_at (stamped only once
--                    Stripe accepts the session; the consent-gated
--                    `analytics_event` version missed 36% — 9 of a real 14 —
--                    cross-checked against the live Stripe API and GA4)
--   purchased      → adds `is_test = false`, matching `fetchRevenue`, so the
--                    tail can never count a staff purchase the revenue line
--                    already excludes (12 such payments, Apr–May 2026)
--
-- `report_viewed` is deliberately NOT touched, here or in the drop-off funnel.
-- `report_session` is the server-side truth (189 vs the client event's 104 over
-- 2026-08-25 → 09-05) but swapping it event-for-event puts report opens ABOVE
-- survey submissions (148), because report_session counts readers returning to
-- older reports — the funnel would climb. The cohort-scoped form (submitted AND
-- opened in the same window) is 143 and stays monotone. That is a windowing
-- decision about what the stage MEANS, so it wants deciding on its own rather
-- than riding along with a source fix. Leaving every RPC on the same
-- (imperfect) definition at least keeps them agreeing with each other.
--
-- Two RPCs still read `report_viewed` from `analytics_event` and have no
-- checkout stage at all, so they need nothing here: `get_funnel_sparklines` and
-- `get_engagement_purchase_lift`.
--
-- WHY THIS IS A PATCH RATHER THAN TWO FULL FUNCTION BODIES: v3 is 9.3KB and v2
-- is 5.5KB of generated-looking SQL where only one CTE changes in each.
-- Retyping them to change four lines invites a transcription error in the exact
-- place nobody would re-read. This reads the live definition, replaces the two
-- CTEs by exact match, and re-executes it — so every other byte is preserved
-- verbatim. It is idempotent: already-patched definitions are skipped, and a
-- definition that matches NEITHER the old nor the new shape raises rather than
-- silently doing nothing.

DO $mig$
DECLARE
  fn      text;
  def     text;
  newdef  text;
  old_bc  text;
  new_bc  text;
  old_pay text;
  new_pay text;
  patched int := 0;
BEGIN
  FOREACH fn IN ARRAY ARRAY['get_funnel_sparklines_v3', 'get_funnel_sparklines_v2'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = fn;
    IF def IS NULL THEN
      RAISE EXCEPTION '%: function not found — has it been renamed?', fn;
    END IF;

    IF fn = 'get_funnel_sparklines_v3' THEN
      -- v3 writes its CTEs on one line each.
      old_bc := 'SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n FROM analytics_event WHERE event_type = ''begin_checkout'' AND event_time >= since_ts AND event_time < until_ts GROUP BY event_time::date';
      new_bc := 'SELECT checkout_started_at::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n FROM report_price_quote WHERE checkout_started_at >= since_ts AND checkout_started_at < until_ts GROUP BY checkout_started_at::date';
      old_pay := 'FROM payment WHERE status = ''succeeded'' AND created_date_time >= since_ts AND created_date_time < until_ts GROUP BY created_date_time::date';
      new_pay := 'FROM payment WHERE status = ''succeeded'' AND is_test = false AND created_date_time >= since_ts AND created_date_time < until_ts GROUP BY created_date_time::date';
    ELSE
      -- v2 wraps them across lines; the indentation is part of the match.
      old_bc := E'    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n\n    FROM analytics_event\n    WHERE event_type = ''begin_checkout''\n      AND event_time >= since_ts AND event_time < until_ts\n    GROUP BY event_time::date';
      new_bc := E'    SELECT checkout_started_at::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n\n    FROM report_price_quote\n    WHERE checkout_started_at >= since_ts AND checkout_started_at < until_ts\n    GROUP BY checkout_started_at::date';
      old_pay := E'    FROM payment\n    WHERE status = ''succeeded''\n      AND created_date_time >= since_ts AND created_date_time < until_ts\n    GROUP BY created_date_time::date';
      new_pay := E'    FROM payment\n    WHERE status = ''succeeded''\n      AND is_test = false\n      AND created_date_time >= since_ts AND created_date_time < until_ts\n    GROUP BY created_date_time::date';
    END IF;

    -- Already on the server-side signal (this migration replayed): nothing to do.
    IF position(new_bc in def) > 0 AND position(new_pay in def) > 0 THEN
      CONTINUE;
    END IF;

    IF position(old_bc in def) = 0 AND position(new_bc in def) = 0 THEN
      RAISE EXCEPTION '%: begin_checkout CTE matches neither the old nor the patched shape', fn;
    END IF;
    IF position(old_pay in def) = 0 AND position(new_pay in def) = 0 THEN
      RAISE EXCEPTION '%: purchases CTE matches neither the old nor the patched shape', fn;
    END IF;

    newdef := replace(replace(def, old_bc, new_bc), old_pay, new_pay);
    IF newdef = def THEN
      RAISE EXCEPTION '%: replacement produced an identical definition', fn;
    END IF;
    EXECUTE newdef;
    patched := patched + 1;
  END LOOP;

  RAISE NOTICE 'sparkline funnels patched: %', patched;
END $mig$;
