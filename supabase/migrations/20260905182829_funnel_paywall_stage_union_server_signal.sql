-- Read the paywall stage as the UNION of its two witnesses.
--
-- `report_price_quote.paywall_reached_at` (20260905182523) is the new
-- server-side signal; `analytics_event.paywall_initiated` is the old
-- consent-gated one. A UNION rather than a replacement, because the column
-- starts empty: replacing outright would drop the stage to 0 for every past
-- window and then climb, which in the digest reads as "the paywall stopped
-- working". The union leaves history byte-identical — verified after applying:
-- 18 before and 18 after in get_dropoff_everywhere, 17 in both sparklines — and
-- improves coverage only as the column fills.
--
-- `survey_submission_id IS NOT NULL` on both sides preserves the original
-- semantics: COUNT(DISTINCT survey_submission_id) already ignored NULLs, and a
-- UNION would otherwise contribute one NULL row to the count.
--
-- Patched in place for the same reason as 20260905182050 — these are 5–9KB of
-- generated-looking SQL where one CTE changes, and retyping them to change a few
-- lines invites a transcription error exactly where nobody would re-read.
-- Idempotent (already-patched definitions are skipped) and raises rather than
-- silently no-opping if a definition matches neither shape.

DO $mig$
DECLARE
  def text; newdef text; old_t text; new_t text; patched int := 0;
BEGIN
  -- ---------- get_dropoff_everywhere ----------
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_dropoff_everywhere';
  IF def IS NULL THEN RAISE EXCEPTION 'get_dropoff_everywhere not found'; END IF;

  old_t := E'        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event\n        WHERE event_type = ''paywall_initiated''\n          AND event_time >= since_ts AND event_time < until_ts';
  new_t := E'        SELECT COUNT(*)::int FROM (\n          SELECT survey_submission_id FROM report_price_quote\n           WHERE paywall_reached_at >= since_ts AND paywall_reached_at < until_ts\n             AND survey_submission_id IS NOT NULL\n          UNION\n          SELECT survey_submission_id FROM analytics_event\n           WHERE event_type = ''paywall_initiated''\n             AND event_time >= since_ts AND event_time < until_ts\n             AND survey_submission_id IS NOT NULL\n        ) reached';

  IF position(new_t in def) = 0 THEN
    IF position(old_t in def) = 0 THEN RAISE EXCEPTION 'dropoff: paywall stage matched neither shape'; END IF;
    newdef := replace(def, old_t, new_t);
    IF newdef = def THEN RAISE EXCEPTION 'dropoff: no change'; END IF;
    EXECUTE newdef; patched := patched + 1;
  END IF;

  -- ---------- get_funnel_sparklines_v3 (one-line CTE) ----------
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_funnel_sparklines_v3';
  old_t := 'pw AS (SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n FROM analytics_event WHERE event_type = ''paywall_initiated'' AND event_time >= since_ts AND event_time < until_ts GROUP BY event_time::date)';
  new_t := 'pw AS (SELECT day, COUNT(DISTINCT survey_submission_id)::int AS n FROM (SELECT paywall_reached_at::date AS day, survey_submission_id FROM report_price_quote WHERE paywall_reached_at >= since_ts AND paywall_reached_at < until_ts AND survey_submission_id IS NOT NULL UNION SELECT event_time::date AS day, survey_submission_id FROM analytics_event WHERE event_type = ''paywall_initiated'' AND event_time >= since_ts AND event_time < until_ts AND survey_submission_id IS NOT NULL) reached GROUP BY day)';
  IF position(new_t in def) = 0 THEN
    IF position(old_t in def) = 0 THEN RAISE EXCEPTION 'v3: paywall CTE matched neither shape'; END IF;
    newdef := replace(def, old_t, new_t);
    IF newdef = def THEN RAISE EXCEPTION 'v3: no change'; END IF;
    EXECUTE newdef; patched := patched + 1;
  END IF;

  -- ---------- get_funnel_sparklines_v2 (multi-line CTE) ----------
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='get_funnel_sparklines_v2';
  old_t := E'    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n\n    FROM analytics_event\n    WHERE event_type = ''paywall_initiated''\n      AND event_time >= since_ts AND event_time < until_ts\n    GROUP BY event_time::date';
  new_t := E'    SELECT day, COUNT(DISTINCT survey_submission_id)::int AS n\n    FROM (\n      SELECT paywall_reached_at::date AS day, survey_submission_id\n      FROM report_price_quote\n      WHERE paywall_reached_at >= since_ts AND paywall_reached_at < until_ts\n        AND survey_submission_id IS NOT NULL\n      UNION\n      SELECT event_time::date AS day, survey_submission_id\n      FROM analytics_event\n      WHERE event_type = ''paywall_initiated''\n        AND event_time >= since_ts AND event_time < until_ts\n        AND survey_submission_id IS NOT NULL\n    ) reached\n    GROUP BY day';
  IF position(new_t in def) = 0 THEN
    IF position(old_t in def) = 0 THEN RAISE EXCEPTION 'v2: paywall CTE matched neither shape'; END IF;
    newdef := replace(def, old_t, new_t);
    IF newdef = def THEN RAISE EXCEPTION 'v2: no change'; END IF;
    EXECUTE newdef; patched := patched + 1;
  END IF;

  RAISE NOTICE 'paywall stages patched: %', patched;
END $mig$;
