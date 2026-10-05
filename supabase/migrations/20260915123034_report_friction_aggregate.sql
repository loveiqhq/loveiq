-- Report and paywall friction per person, for the friction scoreboard.
--
-- Three things this had to work around, all found by looking at the data rather
-- than at the schema:
--
-- 1. analytics_event.session_id is NULL on EVERY row (6,062 of 6,062 over 30
--    days). Anything per-session is impossible; survey_submission_id is
--    populated on all of them, and "per person" is the better unit anyway.
--
-- 2. Staff dominate it. @loveiq.org accounts are 10 of 300 report viewers but
--    generated 38% of all events and 54% of every price_shown, because they
--    reopen the same report for weeks -- one submission alone (1296) spans 61
--    days and 592 price_shown events. Excluding them changed which locked
--    section people most try to open, from `typical_beliefs` to `map`. Note the
--    survey side does NOT need this filter: staff submissions carry zero
--    survey_behavior_event rows, because those runs never execute the client
--    tracking.
--
-- 3. The first version reported "compared plans" by counting people who saw
--    more than one plan. That was 138 of 138 -- the modal fires price_shown
--    once per card on open, so it measured that three cards render, not that
--    anyone compared anything, and would have published "100% compare plans".
--    Reopening the pricing is the behaviour worth counting: 122 people opened
--    it once, 15 came back.
--
-- Aggregated server-side because analytics_event crosses PostgREST's max-rows
-- cap, which truncates silently -- see 20260915140000 for what that cost.

CREATE OR REPLACE FUNCTION public.get_report_friction(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
BEGIN
  WITH staff AS (
    SELECT s.id
    FROM public.survey_submission s
    JOIN public.app_user u ON u.id = s.user_id
    WHERE u.email ~* '@loveiq\.org$'
  ),
  e AS (
    SELECT
      a.survey_submission_id AS sid,
      a.event_type,
      a.event_time,
      a.metadata
    FROM public.analytics_event a
    WHERE a.event_time >= since_ts
      AND a.event_time <  until_ts
      AND a.survey_submission_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM staff st WHERE st.id = a.survey_submission_id)
  ),
  first_paywall AS (
    SELECT sid, MIN(event_time) AS at
    FROM e WHERE event_type = 'paywall_initiated' GROUP BY sid
  ),
  scrolled_before AS (
    SELECT COUNT(DISTINCT e.sid)::int AS n
    FROM e JOIN first_paywall f ON f.sid = e.sid
    WHERE e.event_type = 'scroll_depth_50' AND e.event_time < f.at
  ),
  pricing_opens AS (
    SELECT sid, (COUNT(*) / 3)::int AS opens
    FROM e WHERE event_type = 'price_shown' GROUP BY sid
  )
  SELECT json_build_object(
    'viewers',        (SELECT COUNT(DISTINCT sid)::int FROM e WHERE event_type = 'report_viewed'),
    'tried_locked',   (SELECT COUNT(DISTINCT sid)::int FROM e WHERE event_type = 'lock_icon_clicked'),
    'read_to_end',    (SELECT COUNT(DISTINCT sid)::int FROM e WHERE event_type = 'scroll_depth_100'),
    'paywall_opened', (SELECT COUNT(DISTINCT sid)::int FROM first_paywall),
    'paywall_closed', (SELECT COUNT(DISTINCT sid)::int FROM e WHERE event_type = 'paywall_dismissed'),
    'checkout',       (SELECT COUNT(DISTINCT sid)::int FROM e WHERE event_type = 'begin_checkout'),
    'dwell_median_ms', (
      SELECT COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY (metadata->>'view_duration_ms')::numeric), 0)::int
      FROM e
      WHERE event_type = 'paywall_dismissed'
        AND metadata->>'view_duration_ms' IS NOT NULL
    ),
    'dwell_n', (
      SELECT COUNT(*)::int FROM e
      WHERE event_type = 'paywall_dismissed' AND metadata->>'view_duration_ms' IS NOT NULL
    ),
    'escape_routes', COALESCE((
      SELECT json_agg(json_build_object('source', src, 'n', n) ORDER BY n DESC)
      FROM (
        SELECT COALESCE(metadata->>'source', 'unknown') AS src, COUNT(*)::int AS n
        FROM e WHERE event_type = 'paywall_dismissed'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 5
      ) s
    ), '[]'::json),
    'top_locked_section', (
      SELECT metadata->>'section_id' FROM e
      WHERE event_type = 'lock_icon_clicked' AND metadata->>'section_id' IS NOT NULL
      GROUP BY metadata->>'section_id' ORDER BY COUNT(*) DESC LIMIT 1
    ),
    'scrolled_before_paywall', (SELECT n FROM scrolled_before),
    'reopened_pricing', (SELECT COUNT(*)::int FROM pricing_opens WHERE opens > 1),
    'saw_a_price',      (SELECT COUNT(*)::int FROM pricing_opens),
    'total_rows',       (SELECT COUNT(*)::int FROM e)
  )
  INTO result;

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_report_friction(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_friction(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.get_report_friction(TIMESTAMPTZ, TIMESTAMPTZ) IS
  'Report and paywall friction per person for the friction scoreboard. Excludes @loveiq.org submissions: staff are 10 of 300 viewers but generated 38% of all events and 54% of price_shown, because they reopen the report for weeks. Grouped by survey_submission_id because session_id is NULL on every analytics_event row.';
