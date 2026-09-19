-- brain_daily_rollup clamped `days` to 400 with the comment "so a bad caller
-- cannot ask for a decade and table-scan everything". The guard is right in
-- principle and wrong in two ways in practice.
--
-- 1. IT SILENTLY TRUNCATES. `brain_daily_rollup(3650)` returns 400 rows and says
--    nothing, so a caller asking for all history is told a partial answer is the
--    whole one. That is the same failure as the 90-day GA4 window and the
--    1,000-row PostgREST cap: data missing with nothing indicating it.
-- 2. IT CAPS THE CORPUS. The analytics ingester feeds off this function, so the
--    business-number history could never exceed 400 days. LoveIQ's data starts
--    2026-03-24, so the clamp does not bind today — it starts silently trimming
--    the oldest month once the company is past 400 days old, which is exactly the
--    kind of failure nobody notices.
--
-- The DoS worry does not survive measurement. Only `generate_series` scales with
-- `days`; every table CTE is filtered by `day >= from_day`, so a wider window
-- scans the same rows when no older rows exist. Measured at 400 / 3650 / 7300
-- days: 0.3ms each. And the `opens` CTE already groups over all of
-- `report_session` with no date bound, so it is the real cost and is unaffected.
--
-- Clamp raised to 4000 days (~11 years), which keeps a bound against an absurd
-- argument while never binding on real history. The TypeScript caller reports
-- when a request WAS reduced, so a future ceiling cannot be silent again.

CREATE OR REPLACE FUNCTION public.brain_daily_rollup(days integer DEFAULT 120)
 RETURNS TABLE(day date, unique_visitors bigint, survey_starts bigint, intro_completed bigint, submissions bigint, reports_created bigint, reports_paid bigint, revenue numeric, report_opens bigint, invites_sent bigint, top_sources jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  WITH bounds AS (
    -- Bounded against an absurd argument, but high enough never to bind on real
    -- history. See the migration header for why 400 was wrong.
    SELECT (current_date - (least(greatest(days, 1), 4000) - 1)) AS from_day
  ),
  d AS (
    SELECT generate_series((SELECT from_day FROM bounds), current_date, INTERVAL '1 day')::DATE AS day
  ),
  fe AS (
    SELECT f.day,
           count(*) FILTER (WHERE f.event_type = 'unique_visitor')      AS unique_visitors,
           count(*) FILTER (WHERE f.event_type = 'survey_engine_mount') AS survey_starts,
           count(*) FILTER (WHERE f.event_type = 'intro_slide_4')       AS intro_completed
      FROM public.funnel_event f
     WHERE f.day >= (SELECT from_day FROM bounds)
     GROUP BY f.day
  ),
  src AS (
    -- jsonb, not a rendered string: the ingester rolls days up into weeks and
    -- months, and summing a map is correct where re-parsing prose is not.
    SELECT t.day, jsonb_object_agg(t.s, t.n) AS top_sources
      FROM (
        SELECT f.day,
               coalesce(f.utm_source, 'direct') AS s,
               count(*) AS n,
               row_number() OVER (PARTITION BY f.day ORDER BY count(*) DESC) AS rn
          FROM public.funnel_event f
         WHERE f.event_type = 'unique_visitor'
           AND f.day >= (SELECT from_day FROM bounds)
         GROUP BY f.day, coalesce(f.utm_source, 'direct')
      ) t
     WHERE t.rn <= 6
     GROUP BY t.day
  ),
  sub AS (
    SELECT s.created_date_time::DATE AS day, count(*) AS submissions
      FROM public.survey_submission s
     WHERE s.created_date_time >= (SELECT from_day FROM bounds)
     GROUP BY 1
  ),
  rep AS (
    SELECT r.created_date_time::DATE AS day,
           count(*) AS reports_created,
           count(*) FILTER (WHERE r.payment_status = 'succeeded') AS reports_paid,
           coalesce(sum(r.price) FILTER (WHERE r.payment_status = 'succeeded'), 0) AS revenue
      FROM public.personal_report r
     WHERE r.created_date_time >= (SELECT from_day FROM bounds)
     GROUP BY 1
  ),
  opens AS (
    -- Counted on each report's FIRST open, which is the only shape that survives
    -- being rolled up. `count(DISTINCT report_id)` PER DAY is correct for one day
    -- and wrong the moment the ingester sums days into a week or a month: the same
    -- report opened on three days counted three times. Measured for August 2026 --
    -- 543 published against 376 true distinct, and only 302 reports existed, so
    -- the corpus stated more reports opened than had ever been created.
    -- First-open is additive: summing days gives distinct reports newly opened in
    -- the range, which is also the funnel number that matters (created -> opened).
    SELECT f.first_open::DATE AS day, count(*) AS report_opens
      FROM (
        SELECT rs.personal_report_id, min(rs.started_at) AS first_open
          FROM public.report_session rs
         GROUP BY rs.personal_report_id
      ) f
     WHERE f.first_open >= (SELECT from_day FROM bounds)
     GROUP BY 1
  ),
  inv AS (
    SELECT i.created_at::DATE AS day, count(*) AS invites_sent
      FROM public.invite_event i
     WHERE i.created_at >= (SELECT from_day FROM bounds)
     GROUP BY 1
  )
  SELECT d.day,
         coalesce(fe.unique_visitors, 0),
         coalesce(fe.survey_starts, 0),
         coalesce(fe.intro_completed, 0),
         coalesce(sub.submissions, 0),
         coalesce(rep.reports_created, 0),
         coalesce(rep.reports_paid, 0),
         coalesce(rep.revenue, 0),
         coalesce(opens.report_opens, 0),
         coalesce(inv.invites_sent, 0),
         coalesce(src.top_sources, '{}'::jsonb)
    FROM d
    LEFT JOIN fe    ON fe.day    = d.day
    LEFT JOIN src   ON src.day   = d.day
    LEFT JOIN sub   ON sub.day   = d.day
    LEFT JOIN rep   ON rep.day   = d.day
    LEFT JOIN opens ON opens.day = d.day
    LEFT JOIN inv   ON inv.day   = d.day
   ORDER BY d.day DESC;
$function$;
