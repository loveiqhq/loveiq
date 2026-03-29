-- Migration: Admin submission facts snapshot
-- Adds a materialized submission fact store plus SQL-native segment matching.

-- ---------------------------------------------------------------------------
-- 1. Safe UTM parsing helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_extract_utm_value(
  p_utm_tracker text,
  p_key text,
  p_fallback_to_raw boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_json jsonb;
  v_value text;
BEGIN
  IF p_utm_tracker IS NULL OR btrim(p_utm_tracker) = '' THEN
    RETURN NULL;
  END IF;

  BEGIN
    v_json := p_utm_tracker::jsonb;
    v_value := NULLIF(v_json ->> p_key, '');
    RETURN v_value;
  EXCEPTION
    WHEN others THEN
      IF p_fallback_to_raw THEN
        RETURN NULLIF(btrim(p_utm_tracker), '');
      END IF;
      RETURN NULL;
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Submission facts materialized view
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS public.admin_submission_facts AS
SELECT
  ss.id AS submission_id,
  ss.session_id,
  ss.user_id,
  au.email,
  ss.status,
  ss.duration_ms,
  ss.created_date_time,
  sr.primary_archetype AS archetype,
  sr.v5_primary_archetype AS v5_archetype,
  up.gender,
  up.sexual_orientation,
  up.relationship_status,
  up.location_primary AS country,
  public.admin_extract_utm_value(ss.utm_tracker, 'utm_source', true) AS utm_source,
  public.admin_extract_utm_value(ss.utm_tracker, 'utm_medium', false) AS utm_medium,
  EXISTS (
    SELECT 1
    FROM personal_report pr
    WHERE pr.survey_submission_id = ss.id
  ) AS has_report,
  EXISTS (
    SELECT 1
    FROM personal_report pr2
    JOIN payment p ON p.personal_report_id = pr2.id
    WHERE pr2.survey_submission_id = ss.id
      AND p.status = 'succeeded'
  ) AS has_payment,
  EXISTS (
    SELECT 1
    FROM survey_partial_save sps
    WHERE sps.session_id = ss.session_id
  ) AS was_resumed
FROM survey_submission ss
LEFT JOIN scoring_result sr ON sr.survey_submission_id = ss.id
LEFT JOIN app_user au ON au.id = ss.user_id
LEFT JOIN user_profile up ON up.id = au.user_profile_id
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS admin_submission_facts_submission_id_uidx
  ON public.admin_submission_facts(submission_id);

CREATE INDEX IF NOT EXISTS admin_submission_facts_created_at_idx
  ON public.admin_submission_facts(created_date_time DESC);

CREATE INDEX IF NOT EXISTS admin_submission_facts_status_lower_idx
  ON public.admin_submission_facts(lower(coalesce(status, '')));

CREATE INDEX IF NOT EXISTS admin_submission_facts_archetype_lower_idx
  ON public.admin_submission_facts(lower(coalesce(archetype, '')));

CREATE INDEX IF NOT EXISTS admin_submission_facts_v5_archetype_lower_idx
  ON public.admin_submission_facts(lower(coalesce(v5_archetype, '')));

CREATE INDEX IF NOT EXISTS admin_submission_facts_utm_source_lower_idx
  ON public.admin_submission_facts(lower(coalesce(utm_source, '')));

CREATE INDEX IF NOT EXISTS admin_submission_facts_utm_medium_lower_idx
  ON public.admin_submission_facts(lower(coalesce(utm_medium, '')));

CREATE INDEX IF NOT EXISTS admin_submission_facts_gender_lower_idx
  ON public.admin_submission_facts(lower(coalesce(gender, '')));

CREATE INDEX IF NOT EXISTS admin_submission_facts_sexual_orientation_lower_idx
  ON public.admin_submission_facts(lower(coalesce(sexual_orientation, '')));

CREATE INDEX IF NOT EXISTS admin_submission_facts_relationship_status_lower_idx
  ON public.admin_submission_facts(lower(coalesce(relationship_status, '')));

CREATE INDEX IF NOT EXISTS admin_submission_facts_country_lower_idx
  ON public.admin_submission_facts(lower(coalesce(country, '')));

CREATE INDEX IF NOT EXISTS admin_submission_facts_has_report_idx
  ON public.admin_submission_facts(has_report);

CREATE INDEX IF NOT EXISTS admin_submission_facts_has_payment_idx
  ON public.admin_submission_facts(has_payment);

CREATE INDEX IF NOT EXISTS admin_submission_facts_was_resumed_idx
  ON public.admin_submission_facts(was_resumed);

-- ---------------------------------------------------------------------------
-- 3. SQL helper for segment rule compilation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_segment_where_clause(
  p_rules jsonb,
  p_alias text DEFAULT 'f'
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_logic text;
  v_conditions jsonb;
  v_cond jsonb;
  v_field text;
  v_operator text;
  v_value jsonb;
  v_value_text text;
  v_column text;
  v_field_kind text;
  v_clause text;
  v_clauses text[] := ARRAY[]::text[];
  v_joiner text;
BEGIN
  v_logic := lower(coalesce(p_rules ->> 'logic', ''));
  v_conditions := p_rules -> 'conditions';

  IF v_logic = 'and' THEN
    v_joiner := ' AND ';
  ELSIF v_logic = 'or' THEN
    v_joiner := ' OR ';
  ELSE
    RAISE EXCEPTION 'Invalid logic: must be "and" or "or"';
  END IF;

  IF v_conditions IS NULL OR jsonb_typeof(v_conditions) <> 'array' OR jsonb_array_length(v_conditions) = 0 THEN
    RAISE EXCEPTION 'Invalid rules: missing conditions';
  END IF;

  FOR v_cond IN SELECT * FROM jsonb_array_elements(v_conditions)
  LOOP
    v_field := v_cond ->> 'field';
    v_operator := lower(coalesce(v_cond ->> 'operator', ''));
    v_value := v_cond -> 'value';
    v_value_text := v_cond ->> 'value';

    CASE v_field
      WHEN 'archetype' THEN
        v_column := format('%I.archetype', p_alias);
        v_field_kind := 'text';
      WHEN 'v5_archetype' THEN
        v_column := format('%I.v5_archetype', p_alias);
        v_field_kind := 'text';
      WHEN 'gender' THEN
        v_column := format('%I.gender', p_alias);
        v_field_kind := 'text';
      WHEN 'sexual_orientation' THEN
        v_column := format('%I.sexual_orientation', p_alias);
        v_field_kind := 'text';
      WHEN 'relationship_status' THEN
        v_column := format('%I.relationship_status', p_alias);
        v_field_kind := 'text';
      WHEN 'country' THEN
        v_column := format('%I.country', p_alias);
        v_field_kind := 'text';
      WHEN 'status' THEN
        v_column := format('%I.status', p_alias);
        v_field_kind := 'text';
      WHEN 'duration_ms' THEN
        v_column := format('%I.duration_ms', p_alias);
        v_field_kind := 'number';
      WHEN 'created_date_time' THEN
        v_column := format('%I.created_date_time', p_alias);
        v_field_kind := 'timestamp';
      WHEN 'utm_source' THEN
        v_column := format('%I.utm_source', p_alias);
        v_field_kind := 'text';
      WHEN 'utm_medium' THEN
        v_column := format('%I.utm_medium', p_alias);
        v_field_kind := 'text';
      WHEN 'has_report' THEN
        v_column := format('%I.has_report', p_alias);
        v_field_kind := 'boolean';
      WHEN 'has_payment' THEN
        v_column := format('%I.has_payment', p_alias);
        v_field_kind := 'boolean';
      ELSE
        RAISE EXCEPTION 'Unknown field: %', v_field;
    END CASE;

    IF v_value IS NULL THEN
      RAISE EXCEPTION 'Invalid rule: missing value for field %', v_field;
    END IF;

    IF v_field_kind = 'text' THEN
      CASE v_operator
        WHEN 'eq' THEN
          v_clause := format('lower(coalesce(%s, %L)) = lower(%L)', v_column, '', v_value_text);
        WHEN 'neq' THEN
          v_clause := format('lower(coalesce(%s, %L)) <> lower(%L)', v_column, '', v_value_text);
        WHEN 'contains' THEN
          v_clause := format('coalesce(%s, %L) ILIKE %L', v_column, '', '%' || v_value_text || '%');
        WHEN 'lt' THEN
          v_clause := format('lower(coalesce(%s, %L)) < lower(%L)', v_column, '', v_value_text);
        WHEN 'gt' THEN
          v_clause := format('lower(coalesce(%s, %L)) > lower(%L)', v_column, '', v_value_text);
        WHEN 'lte' THEN
          v_clause := format('lower(coalesce(%s, %L)) <= lower(%L)', v_column, '', v_value_text);
        WHEN 'gte' THEN
          v_clause := format('lower(coalesce(%s, %L)) >= lower(%L)', v_column, '', v_value_text);
        ELSE
          RAISE EXCEPTION 'Unsupported operator % for field %', v_operator, v_field;
      END CASE;
    ELSIF v_field_kind = 'number' THEN
      CASE v_operator
        WHEN 'eq' THEN
          v_clause := format('%s = %L::bigint', v_column, v_value_text);
        WHEN 'neq' THEN
          v_clause := format('%s <> %L::bigint', v_column, v_value_text);
        WHEN 'lt' THEN
          v_clause := format('%s < %L::bigint', v_column, v_value_text);
        WHEN 'gt' THEN
          v_clause := format('%s > %L::bigint', v_column, v_value_text);
        WHEN 'lte' THEN
          v_clause := format('%s <= %L::bigint', v_column, v_value_text);
        WHEN 'gte' THEN
          v_clause := format('%s >= %L::bigint', v_column, v_value_text);
        ELSE
          RAISE EXCEPTION 'Unsupported operator % for numeric field %', v_operator, v_field;
      END CASE;
    ELSIF v_field_kind = 'timestamp' THEN
      CASE v_operator
        WHEN 'eq' THEN
          v_clause := format('%s = %L::timestamptz', v_column, v_value_text);
        WHEN 'neq' THEN
          v_clause := format('%s <> %L::timestamptz', v_column, v_value_text);
        WHEN 'lt' THEN
          v_clause := format('%s < %L::timestamptz', v_column, v_value_text);
        WHEN 'gt' THEN
          v_clause := format('%s > %L::timestamptz', v_column, v_value_text);
        WHEN 'lte' THEN
          v_clause := format('%s <= %L::timestamptz', v_column, v_value_text);
        WHEN 'gte' THEN
          v_clause := format('%s >= %L::timestamptz', v_column, v_value_text);
        ELSE
          RAISE EXCEPTION 'Unsupported operator % for timestamp field %', v_operator, v_field;
      END CASE;
    ELSE
      CASE v_operator
        WHEN 'eq' THEN
          v_clause := format('coalesce(%s, false) = %L::boolean', v_column, v_value_text);
        WHEN 'neq' THEN
          v_clause := format('coalesce(%s, false) <> %L::boolean', v_column, v_value_text);
        ELSE
          RAISE EXCEPTION 'Unsupported operator % for boolean field %', v_operator, v_field;
      END CASE;
    END IF;

    v_clauses := array_append(v_clauses, '(' || v_clause || ')');
  END LOOP;

  RETURN '(' || array_to_string(v_clauses, v_joiner) || ')';
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Segment count helper
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_segment_match_count_scalar(p_rules jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_where text;
  v_sql text;
  v_count integer;
BEGIN
  v_where := public.admin_segment_where_clause(p_rules, 'f');
  v_sql := format(
    'SELECT count(*)::int FROM public.admin_submission_facts f WHERE %s',
    v_where
  );
  EXECUTE v_sql INTO v_count;
  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_segment_match_count_scalar(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Refresh function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_admin_submission_facts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.admin_submission_facts;

  UPDATE public.admin_segment
  SET match_count = public.admin_segment_match_count_scalar(rules)
  WHERE rules IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_admin_submission_facts() TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Snapshot-backed segment preview RPC
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_segment_match_count(p_rules jsonb)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_where text;
  v_sql text;
  v_count integer;
  v_sample json;
BEGIN
  v_where := public.admin_segment_where_clause(p_rules, 'f');
  v_count := public.admin_segment_match_count_scalar(p_rules);

  v_sql := format(
    'SELECT COALESCE(json_agg(t), %L::json) FROM (
       SELECT
         f.submission_id AS id,
         f.email,
         f.archetype,
         f.created_date_time,
         f.status,
         f.duration_ms
       FROM public.admin_submission_facts f
       WHERE %s
       ORDER BY f.created_date_time DESC
       LIMIT 10
     ) t',
    '[]',
    v_where
  );

  EXECUTE v_sql INTO v_sample;

  RETURN json_build_object(
    'count', COALESCE(v_count, 0),
    'sample', COALESCE(v_sample, '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_segment_match_count(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Snapshot-backed metrics RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_segment_metrics_snapshot(
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_until TIMESTAMPTZ DEFAULT NULL,
  p_utm TEXT DEFAULT NULL,
  p_archetype TEXT DEFAULT NULL,
  p_session_state TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(p_since, '2000-01-01'::TIMESTAMPTZ);
  effective_until TIMESTAMPTZ := COALESCE(p_until, '2099-12-31'::TIMESTAMPTZ);
BEGIN
  SELECT json_build_object(
    'total_submissions', COUNT(*)::int,
    'completed', COUNT(*) FILTER (WHERE f.status = 'completed')::int,
    'avg_duration_ms', ROUND(AVG(f.duration_ms) FILTER (
      WHERE f.status = 'completed' AND f.duration_ms IS NOT NULL
    ))::bigint,
    'archetype_distribution', COALESCE((
      SELECT json_agg(row_to_json(ad))
      FROM (
        SELECT f2.archetype, COUNT(*)::int AS count
        FROM public.admin_submission_facts f2
        WHERE f2.created_date_time BETWEEN effective_since AND effective_until
          AND (p_utm IS NULL OR coalesce(f2.utm_source, '') ILIKE '%' || p_utm || '%')
          AND (p_archetype IS NULL OR f2.archetype = p_archetype)
          AND (
            p_session_state IS NULL OR
            (p_session_state = 'resumed' AND f2.was_resumed) OR
            (p_session_state = 'fresh' AND NOT f2.was_resumed)
          )
          AND f2.archetype IS NOT NULL
        GROUP BY f2.archetype
        ORDER BY count DESC
      ) ad
    ), '[]'::json)
  ) INTO result
  FROM public.admin_submission_facts f
  WHERE f.created_date_time BETWEEN effective_since AND effective_until
    AND (p_utm IS NULL OR coalesce(f.utm_source, '') ILIKE '%' || p_utm || '%')
    AND (p_archetype IS NULL OR f.archetype = p_archetype)
    AND (
      p_session_state IS NULL OR
      (p_session_state = 'resumed' AND f.was_resumed) OR
      (p_session_state = 'fresh' AND NOT f.was_resumed)
    );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_segment_metrics_snapshot(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.get_segment_metrics_by_rules(p_rules jsonb)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  v_where text;
  v_sql text;
BEGIN
  v_where := public.admin_segment_where_clause(p_rules, 'f');

  v_sql := format(
    'WITH filtered AS (
       SELECT *
       FROM public.admin_submission_facts f
       WHERE %s
     )
     SELECT json_build_object(
       %L, (SELECT COUNT(*)::int FROM filtered),
       %L, (SELECT COUNT(*)::int FROM filtered WHERE status = %L),
       %L, (
         SELECT ROUND(AVG(duration_ms))::bigint
         FROM filtered
         WHERE status = %L AND duration_ms IS NOT NULL
       ),
       %L, COALESCE((
         SELECT json_agg(row_to_json(ad))
         FROM (
           SELECT archetype, COUNT(*)::int AS count
           FROM filtered
           WHERE archetype IS NOT NULL
           GROUP BY archetype
           ORDER BY count DESC
         ) ad
       ), %L::json)
     )',
    v_where,
    'total_submissions',
    'completed',
    'completed',
    'avg_duration_ms',
    'completed',
    'archetype_distribution',
    '[]'
  );

  EXECUTE v_sql INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_segment_metrics_by_rules(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Keep snapshot fresh on a 5 minute cadence
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR v_job_id IN
      SELECT jobid
      FROM cron.job
      WHERE jobname = 'refresh-admin-submission-facts'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
      'refresh-admin-submission-facts',
      '*/5 * * * *',
      'SELECT public.refresh_admin_submission_facts();'
    );
  END IF;
END;
$$;
