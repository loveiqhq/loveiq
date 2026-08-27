-- Stop the admin "Landing A/B" tab reporting three different things as "Dark".
--
-- The old body collapsed every arm that was not exactly 'white' into 'control':
--
--   CASE WHEN ...->>'landing_variant' = 'white' THEN 'white' ELSE 'control' END
--
-- so the tab's "Dark / Control" column summed the genuinely dark round-1 arm, the
-- round-2 V1 arm, AND every submission with no arm stamped at all. Measured on
-- production the day this was written, that column held 892 completed surveys:
--
--     805  no arm stamped (pre-experiment, crawlers, direct hits)
--      53  control — genuinely dark, and the only six days it ever ran (14-19 Jun)
--      34  white_prev — the LIVE V1 arm, being reported as the retired dark one
--
-- 94% of the "Dark" column was not dark, and the arm currently under test was
-- inside it. The mislabelling is called out in the header comment of
-- features/attribution/server/labels.ts, which warns not to route values through
-- this RPC before labelling them; the fix is for the RPC to stop lying instead.
--
-- Now returns the RAW arm, with NULL/'' as its own 'unknown' bucket, and always
-- includes the two arms currently assigned plus the retired one so an arm with no
-- rows reads as 0 rather than vanishing. Naming stays out of SQL entirely: the
-- route labels these through armLabel(), the single vocabulary Slack and /admin
-- both already use.
--
-- CREATE OR REPLACE keeps the existing ACL ({postgres,service_role}), so the
-- public-execute revoke from 20260825140000 is preserved. Verified after applying.

CREATE OR REPLACE FUNCTION public.get_landing_variant_funnel(since_ts timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH bounds AS (
    SELECT COALESCE(since_ts, '2000-01-01'::timestamptz) AS since
  ),
  -- Every arm the UI should always show a row for, even at zero. 'unknown' is
  -- deliberately NOT here: it appears only when it actually has rows, because a
  -- permanent "Not recorded: 0" row is noise.
  variants(variant) AS (VALUES ('white'), ('white_prev'), ('control')),
  comp AS (
    SELECT
      COALESCE(
        NULLIF((NULLIF(ss.utm_tracker, '')::jsonb)->>'landing_variant', ''),
        'unknown'
      ) AS variant,
      COUNT(*)::int AS completed
    FROM survey_submission ss
    CROSS JOIN bounds
    WHERE ss.status = 'completed'
      AND ss.created_date_time >= bounds.since
    GROUP BY 1
  ),
  pay AS (
    SELECT
      COALESCE(
        NULLIF((NULLIF(ss.utm_tracker, '')::jsonb)->>'landing_variant', ''),
        'unknown'
      ) AS variant,
      COUNT(*)::int AS paid,
      COALESCE(SUM(p.amount), 0)::numeric AS revenue
    FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
    JOIN survey_submission ss ON ss.id = pr.survey_submission_id
    CROSS JOIN bounds
    WHERE p.status = 'succeeded'
      AND p.created_date_time >= bounds.since
    GROUP BY 1
  ),
  -- Union of the always-show list and whatever actually has data, so an arm that
  -- only exists in history (or a value nobody expected) still gets a row instead
  -- of being silently dropped.
  all_variants AS (
    SELECT variant FROM variants
    UNION
    SELECT variant FROM comp
    UNION
    SELECT variant FROM pay
  )
  SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.variant), '[]'::json)
  FROM (
    SELECT
      v.variant,
      COALESCE(comp.completed, 0) AS completed,
      COALESCE(pay.paid, 0) AS paid,
      ROUND(COALESCE(pay.revenue, 0), 2)::float8 AS revenue
    FROM all_variants v
    LEFT JOIN comp ON comp.variant = v.variant
    LEFT JOIN pay ON pay.variant = v.variant
  ) r;
$function$;
