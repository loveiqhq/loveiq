-- Finish the paywall stage: the three RPCs 20260905182829 missed.
--
-- That migration put `get_dropoff_everywhere`, `get_funnel_sparklines_v2` and
-- `_v3` on the UNION of `report_price_quote.paywall_reached_at` and the
-- consent-gated `analytics_event.paywall_initiated`. A sweep of every plpgsql
-- function afterwards found three more LIVE ones still reading only the client
-- event — which would have recreated exactly the split-brain that started this
-- work, just on the paywall stage instead of checkout, and only once the new
-- column had begun to fill (so it would have drifted in quietly days later):
--
--   get_funnel_cvr_sparklines   paygate CTE       (per-day conversion rates)
--   get_funnel_sparklines       pw CTE            (per-day counts)
--   get_velocity_percentiles    first_paywall CTE (time from paywall to payment)
--
-- The first two take the same UNION as their siblings. `get_velocity_percentiles`
-- takes UNION ALL instead: it has no time window and only wants MIN per
-- submission, so deduplicating rows would be wasted work — and it needs the
-- EARLIEST of the two witnesses, which is what MIN over both gives.
--
-- Still on the client event and deliberately left: `get_forced_paywall_ab`, the
-- only remaining reader of `event_type = 'begin_checkout'`. It has zero non-test
-- callers — the forced-paywall axis was concluded in favour of the forced wall,
-- and `slack-journey.ts` already stops rendering that arm. Patching a dead
-- function to match a live convention is churn; it is recorded here so the next
-- sweep does not re-flag it as an oversight.
--
-- Alias note: the obvious name for the UNION subquery, `both`, is reserved in
-- Postgres (TRIM(BOTH …)) and fails with a syntax error at CREATE time. The DO
-- block is one statement, so that failure rolled back the two functions patched
-- before it — worth knowing if this ever needs editing.
--
-- No behavioural change on the day it shipped: the column was empty, and a UNION
-- with an empty set is the identity. Coverage improves as the column fills.

DO $mig$
DECLARE
  def text; newdef text; old_t text; new_t text; patched int := 0;
BEGIN
  -- get_funnel_cvr_sparklines: paygate CTE
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prokind='f' AND p.proname='get_funnel_cvr_sparklines';
  IF def IS NULL THEN RAISE EXCEPTION 'cvr sparklines not found'; END IF;
  old_t := E'    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n\n    FROM analytics_event\n    WHERE event_type = ''paywall_initiated'' AND event_time >= since_ts AND event_time < until_ts\n    GROUP BY event_time::date';
  new_t := E'    SELECT day, COUNT(DISTINCT survey_submission_id)::int AS n\n    FROM (\n      SELECT event_time::date AS day, survey_submission_id FROM analytics_event\n       WHERE event_type = ''paywall_initiated'' AND event_time >= since_ts AND event_time < until_ts\n         AND survey_submission_id IS NOT NULL\n      UNION\n      SELECT paywall_reached_at::date AS day, survey_submission_id FROM report_price_quote\n       WHERE paywall_reached_at >= since_ts AND paywall_reached_at < until_ts\n         AND survey_submission_id IS NOT NULL\n    ) paywall_hits\n    GROUP BY day';
  IF position(new_t in def) = 0 THEN
    IF position(old_t in def) = 0 THEN RAISE EXCEPTION 'cvr: paygate CTE matched neither shape'; END IF;
    newdef := replace(def, old_t, new_t);
    IF newdef = def THEN RAISE EXCEPTION 'cvr: no change'; END IF;
    EXECUTE newdef; patched := patched + 1;
  END IF;

  -- get_funnel_sparklines: pw CTE
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prokind='f' AND p.proname='get_funnel_sparklines';
  IF def IS NULL THEN RAISE EXCEPTION 'v1 sparklines not found'; END IF;
  old_t := E'    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n\n    FROM analytics_event\n    WHERE event_type = ''paywall_initiated''\n      AND event_time >= since_ts AND event_time < until_ts\n    GROUP BY event_time::date';
  new_t := E'    SELECT day, COUNT(DISTINCT survey_submission_id)::int AS n\n    FROM (\n      SELECT event_time::date AS day, survey_submission_id FROM analytics_event\n       WHERE event_type = ''paywall_initiated''\n         AND event_time >= since_ts AND event_time < until_ts\n         AND survey_submission_id IS NOT NULL\n      UNION\n      SELECT paywall_reached_at::date AS day, survey_submission_id FROM report_price_quote\n       WHERE paywall_reached_at >= since_ts AND paywall_reached_at < until_ts\n         AND survey_submission_id IS NOT NULL\n    ) paywall_hits\n    GROUP BY day';
  IF position(new_t in def) = 0 THEN
    IF position(old_t in def) = 0 THEN RAISE EXCEPTION 'v1: pw CTE matched neither shape'; END IF;
    newdef := replace(def, old_t, new_t);
    IF newdef = def THEN RAISE EXCEPTION 'v1: no change'; END IF;
    EXECUTE newdef; patched := patched + 1;
  END IF;

  -- get_velocity_percentiles: first_paywall CTE (no window; MIN over all time)
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.prokind='f' AND p.proname='get_velocity_percentiles';
  IF def IS NULL THEN RAISE EXCEPTION 'velocity not found'; END IF;
  old_t := E'    SELECT survey_submission_id, MIN(event_time) AS first_at\n    FROM analytics_event\n    WHERE event_type = ''paywall_initiated'' AND survey_submission_id IS NOT NULL\n    GROUP BY survey_submission_id';
  new_t := E'    SELECT survey_submission_id, MIN(reached_at) AS first_at\n    FROM (\n      SELECT survey_submission_id, event_time AS reached_at FROM analytics_event\n       WHERE event_type = ''paywall_initiated'' AND survey_submission_id IS NOT NULL\n      UNION ALL\n      SELECT survey_submission_id, paywall_reached_at AS reached_at FROM report_price_quote\n       WHERE paywall_reached_at IS NOT NULL AND survey_submission_id IS NOT NULL\n    ) paywall_hits\n    GROUP BY survey_submission_id';
  IF position(new_t in def) = 0 THEN
    IF position(old_t in def) = 0 THEN RAISE EXCEPTION 'velocity: first_paywall CTE matched neither shape'; END IF;
    newdef := replace(def, old_t, new_t);
    IF newdef = def THEN RAISE EXCEPTION 'velocity: no change'; END IF;
    EXECUTE newdef; patched := patched + 1;
  END IF;

  RAISE NOTICE 'remaining paywall stages patched: %', patched;
END $mig$;
