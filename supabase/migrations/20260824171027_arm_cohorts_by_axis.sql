-- RECOVERED FILE, written 2026-08-27. The migration ledger has carried this version
-- since 2026-08-24 but no file existed for it: it was applied straight to the
-- database and never committed. That is the dangerous direction of ledger drift —
-- production had the function, and any environment rebuilt from this repo (a Supabase
-- branch, `supabase db reset`, a disaster-recovery restore) would NOT, so
-- `get_arm_cohorts` would simply be absent and the /admin A/B cohort view and
-- `npm run test:integration` would fail against it.
--
-- Body below is `pg_get_functiondef` taken verbatim from production, so replaying it
-- reproduces exactly what is live rather than someone's reconstruction of it.
--
-- Note it still reads the `survey_variant` axis. That test concluded on 2026-08-25
-- and the axis is absent from every live reporting list, so the arm comes back as a
-- constant or `unknown` and nothing renders it. Left as-is deliberately: this file
-- records what was applied, and changing behaviour while recovering a file would make
-- the ledger honest and the schema wrong.

CREATE OR REPLACE FUNCTION public.get_arm_cohorts(since_ts timestamp with time zone, until_ts timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
BEGIN
  WITH subs AS (
    SELECT ss.id,
           tracker_arm(ss.utm_tracker, 'landing_variant') AS landing_arm,
           tracker_arm(ss.utm_tracker, 'survey_variant')  AS survey_arm,
           COALESCE(
             (SELECT COALESCE(q.experiment_group, q.base_price_bucket)
                FROM report_price_quote q
               WHERE q.survey_submission_id = ss.id
                 AND COALESCE(q.experiment_group, q.base_price_bucket) IS NOT NULL
               ORDER BY q.created_date_time ASC
               LIMIT 1),
             'unknown'
           ) AS pricing_arm,
           EXISTS (
             SELECT 1 FROM report_price_quote q2
             WHERE q2.survey_submission_id = ss.id AND q2.purchased_at IS NOT NULL
           ) AS ever_paid
      FROM survey_submission ss
     WHERE ss.status = 'completed'
       AND ss.created_date_time >= since_ts
       AND ss.created_date_time < until_ts
  ),
  unpivoted AS (
    SELECT 'landing'::text AS axis, landing_arm AS arm, ever_paid FROM subs
    UNION ALL
    SELECT 'survey', survey_arm, ever_paid FROM subs
    UNION ALL
    SELECT 'pricing', pricing_arm, ever_paid FROM subs
  )
  SELECT COALESCE(json_agg(json_build_object(
           'axis', axis,
           'arm',  arm,
           'n',    n,
           'conversions', conversions
         ) ORDER BY axis, conversions DESC, arm), '[]'::json)
    INTO result
    FROM (
      SELECT axis, arm,
             COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE ever_paid)::int AS conversions
        FROM unpivoted
       GROUP BY axis, arm
    ) g;

  RETURN result;
END;
$function$;

-- Matches the public-execute revoke applied to every SECURITY DEFINER RPC in
-- 20260825140000; restated here so a rebuild does not leave this one open in the
-- window before that migration runs.
REVOKE ALL ON FUNCTION public.get_arm_cohorts(timestamp with time zone, timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_arm_cohorts(timestamp with time zone, timestamp with time zone) TO service_role;
