-- One row per day of the business funnel, for the company brain to index.
--
-- WHY THIS EXISTS RATHER THAN A GA4 INTEGRATION. The questions people actually
-- ask -- "how many signups yesterday", "is Google traffic growing", "when did
-- conversion drop" -- are answerable from our OWN tables, which have the full
-- history and need no third-party credentials. GA4 and Search Console would each
-- require a Google Cloud project and a service account; PostHog only started
-- ingesting on 2026-08-23 so it cannot answer anything historical yet. This does
-- both jobs with data we already hold.
--
-- WHY A DAILY SNAPSHOT IS NOT A STALE METRIC. Indexing "the current conversion
-- rate" would rot immediately. Indexing "2026-08-19: 1,000 visitors, 17
-- submissions, 1 paid, EUR 49" is a dated historical fact that stays true
-- forever, so it can live in the same text corpus as docs and commits and be
-- retrieved by the same query path -- no separate metrics engine needed.
--
-- WHY ONE FUNCTION RATHER THAN QUERIES FROM THE APP. The ingester needs ~120 days
-- across six tables. As PostgREST calls that is several hundred round trips per
-- run; as one RPC it is a single call the planner can optimise.
--
-- SECURITY-INVOKER BY DESIGN, like `brain_search`. It reads operational tables
-- that are already service-role-only under RLS, and 20260825140000 exists
-- precisely because SECURITY DEFINER functions here kept drifting open to anon.

BEGIN;

CREATE OR REPLACE FUNCTION public.brain_daily_rollup(days INT DEFAULT 120)
RETURNS TABLE (
  day             DATE,
  unique_visitors BIGINT,
  survey_starts   BIGINT,
  intro_completed BIGINT,
  submissions     BIGINT,
  reports_created BIGINT,
  reports_paid    BIGINT,
  revenue         NUMERIC,
  report_opens    BIGINT,
  invites_sent    BIGINT,
  top_sources     JSONB
)
LANGUAGE sql
STABLE
AS $$
  WITH bounds AS (
    -- Clamped so a bad caller cannot ask for a decade and table-scan everything.
    SELECT (current_date - (least(greatest(days, 1), 400) - 1)) AS from_day
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
    -- DISTINCT report, not raw sessions: one person refreshing is not engagement.
    SELECT rs.started_at::DATE AS day, count(DISTINCT rs.personal_report_id) AS report_opens
      FROM public.report_session rs
     WHERE rs.started_at >= (SELECT from_day FROM bounds)
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
$$;

COMMENT ON FUNCTION public.brain_daily_rollup(INT) IS
  'One row per day of the funnel (visitors, starts, submissions, reports, revenue, sources) for the company-brain analytics ingester.';

REVOKE EXECUTE ON FUNCTION public.brain_daily_rollup(INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.brain_daily_rollup(INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_daily_rollup(INT) TO service_role;

COMMIT;
