-- `firstRowDay` answered a question nobody asked, so its caveat could never fire.
--
-- get_paywall_hits counts the paywall step as a UNION of two signals:
--   analytics_event 'paywall_initiated'        — client-posted, live since 2026-05-24
--   report_price_quote.paywall_reached_at      — server truth, live since 2026-09-05
--
-- It also returns `firstRowDay`, documented as what "the caller needs to say how
-- much of its window this step actually covers", and the caller
-- (conversion-digest) already builds a line from it:
--
--   "The paywall row covers 14 days, not 30 — that signal only started on ..."
--
-- That line has never once appeared. `firstRowDay` took MIN across BOTH signals,
-- which returns 2026-05-24 — the day the LOSSY signal started — so the caveat's
-- own guard (`first <= windowEnd - WINDOW_DAYS`) is always true and returns null.
-- The doc comment on PaywallHits in conversion-digest.ts states outright that
-- firstRowDay "comes back with" 2026-09-05. It does not. It comes back 2026-05-24.
--
-- WHY IT MATTERS, measured on the 30 days to 2026-09-19:
--
--   window half          hits/finishers   rate     client-only   server-only
--   before 2026-09-06        30/218       13.8%        21             8
--   on/after 2026-09-06     101/199       50.8%         1            87
--
-- One client-only detection against 87 server-only ones after the boundary: the
-- client event is ~97% lossy and the server column is what actually measures
-- this step. So the published "hit the paywall — 32.6%" is an average of an
-- unmeasured 13.8% and a real 50.8%, and the row BELOW it ("started checkout",
-- 31/131 = 23.7%) is inflated by the understated denominator. Both sit in the
-- funnel table, which is the most-read thing in the digest.
--
-- THE FIX is the aggregate, not the mechanism. The day this step became
-- meaningfully measured is the day the LATER signal arrived, so take MAX of the
-- two per-signal minimums instead of MIN. MAX ignores NULLs, so a signal that
-- has never written anything cannot drag the date backwards.
--
-- Nothing else changes: `hits` keeps counting the union (dropping the client
-- signal would lose the 21 pre-boundary detections it is the only source for),
-- and the caller's existing self-expiring logic means this line disappears on
-- its own once 2026-09-05 falls out of the window.

CREATE OR REPLACE FUNCTION public.get_paywall_hits(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    -- DISTINCT submissions, scoped to the same cohort as every other "…of those"
    -- row. report_price_quote holds one row per plan, so counting rows here read
    -- 4x too high and the funnel's monotonic clamp turned it into a fabricated
    -- 100%. Both signals, because neither alone sees the whole step.
    'hits', (
      SELECT COUNT(*)::int FROM (
        SELECT DISTINCT s.id
          FROM survey_submission s
         WHERE s.created_date_time >= since_ts
           AND s.created_date_time <  until_ts
           AND (
             EXISTS (SELECT 1 FROM report_price_quote q
                      WHERE q.survey_submission_id = s.id
                        AND q.paywall_reached_at IS NOT NULL)
             OR
             EXISTS (SELECT 1 FROM analytics_event a
                      WHERE a.survey_submission_id = s.id
                        AND a.event_type = 'paywall_initiated')
           )
      ) reached
    ),
    -- The day this step became MEANINGFULLY measured: the later of the two
    -- signals' first rows, not the earlier. See the note above for why MIN here
    -- made the caller's caveat unreachable.
    'firstRowDay', (
      SELECT to_char(MAX(t) AT TIME ZONE 'Europe/Berlin', 'YYYY-MM-DD')
        FROM (
          SELECT MIN(paywall_reached_at) AS t FROM report_price_quote
           WHERE paywall_reached_at IS NOT NULL
          UNION ALL
          SELECT MIN(event_time) FROM analytics_event WHERE event_type = 'paywall_initiated'
        ) f
    )
  ) INTO result;

  RETURN result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_paywall_hits(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_paywall_hits(TIMESTAMPTZ, TIMESTAMPTZ) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_paywall_hits(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.get_paywall_hits(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Distinct submissions in the window that reached the paywall, by either the '
  'client paywall_initiated event or the server paywall_reached_at column. '
  'firstRowDay is the LATER of the two signals first rows - the day the step '
  'became meaningfully measured - so a caller can say how much of its window '
  'this row really covers.';
