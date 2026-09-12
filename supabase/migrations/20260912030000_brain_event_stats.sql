-- Aggregation over the behaviour tables, which the brain could read and not summarise.
--
-- `survey_behavior_event` holds 128,236 rows, `funnel_event` 42,618, `analytics_event`
-- 19,931, `report_session` 10,354. Every one of them is readable through
-- `query_product_data` a thousand rows at a time, and NONE of them is answerable that
-- way: "which question do people abandon" is an average over the whole table, and an
-- average never arrives through a paging door.
--
-- WHY NOT JUST TURN ON PostgREST AGGREGATES. Measured 2026-09-12: they are disabled on
-- this instance (PGRST123), and more importantly the MCP layer refuses them on its own,
-- for a good reason -- private columns are masked BY NAME, so `email.count()` or an
-- aliased column comes back unmasked and looks exactly like a clean result. Enabling them
-- would silently remove that guard everywhere. A `get_*` function is also exposed to the
-- brain automatically, so this lands with no route change at all.
--
-- ONE GROUPING COLUMN, FROM AN ALLOWLIST. `p_group_by` is checked against an explicit
-- (table, column) list before it is ever interpolated, so this is not dynamic SQL over
-- caller input: an unlisted pair is refused by name rather than quoted and run.
-- Grouping by a private column is REFUSED, not masked -- grouping by `client_ip` or
-- `session_id` produces one bucket per person, which is user-level data reshaped, and
-- masking the label would leave the counts intact and the shape unchanged.

CREATE OR REPLACE FUNCTION public.get_event_stats(
  p_table    text,
  p_group_by text,
  p_since    timestamptz DEFAULT NULL,
  p_until    timestamptz DEFAULT NULL,
  p_limit    integer DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  -- (table, time column, measure column or NULL, allowed grouping columns).
  allowed   text[];
  time_col  text;
  ms_col    text;
  sql       text;
  result    json;
BEGIN
  CASE p_table
    WHEN 'survey_behavior_event' THEN
      allowed  := ARRAY['q_id','chapter','question_index','answered','direction','email_position'];
      time_col := 'created_at';
      ms_col   := 'time_spent_ms';
    WHEN 'funnel_event' THEN
      allowed  := ARRAY['event_type','utm_source','landing_variant','email_position','day'];
      time_col := 'first_seen';
      ms_col   := NULL;
    WHEN 'analytics_event' THEN
      allowed  := ARRAY['event_type','entity_type'];
      time_col := 'event_time';
      ms_col   := 'duration_ms';
    ELSE
      RETURN json_build_object(
        'error', format(
          'No stats for %L. This function covers the behaviour tables: survey_behavior_event, '
          'funnel_event, analytics_event. Anything else is readable row by row with '
          'query_product_data, or already has a get_* function of its own.', p_table)
      );
  END CASE;

  IF NOT (p_group_by = ANY(allowed)) THEN
    RETURN json_build_object(
      'error', format(
        '%L cannot be grouped by %L. Allowed here: %s. Columns holding an IP, a session, a '
        'visitor or a user id are deliberately absent — grouping by one produces a bucket per '
        'person, which is user-level data whatever the label says.',
        p_table, p_group_by, array_to_string(allowed, ', '))
    );
  END IF;

  -- `p_group_by` and `time_col` are now values from this function's own arrays, never
  -- caller text; %I quotes them as identifiers regardless.
  sql := format(
    'SELECT coalesce(json_agg(row_to_json(t)), ''[]''::json) FROM ('
    '  SELECT %I::text AS bucket, count(*)::bigint AS events%s'
    '    FROM public.%I'
    '   WHERE ($1 IS NULL OR %I >= $1) AND ($2 IS NULL OR %I <= $2)'
    '     AND %I IS NOT NULL'
    '   GROUP BY 1 ORDER BY count(*) DESC LIMIT $3'
    ') t',
    p_group_by,
    CASE WHEN ms_col IS NULL THEN ''
         ELSE format(', round(avg(%I))::bigint AS avg_ms, round(percentile_cont(0.5) '
                     'WITHIN GROUP (ORDER BY %I))::bigint AS median_ms', ms_col, ms_col) END,
    p_table, time_col, time_col, p_group_by
  );
  EXECUTE sql INTO result USING p_since, p_until, greatest(1, least(500, coalesce(p_limit, 50)));
  RETURN result;
END;
$fn$;

COMMENT ON FUNCTION public.get_event_stats(text, text, timestamptz, timestamptz, integer) IS
  'Counts and timings over the behaviour tables, grouped by one allowlisted column. '
  'Exists because those tables are far too large to answer by paging, and because turning '
  'on PostgREST aggregates would defeat the by-name masking of private columns.';

GRANT EXECUTE ON FUNCTION public.get_event_stats(text, text, timestamptz, timestamptz, integer) TO service_role;
