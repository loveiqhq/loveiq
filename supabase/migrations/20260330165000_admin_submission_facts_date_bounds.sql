-- Migration: Fix inclusive date boundaries for admin submission facts RPCs

-- ---------------------------------------------------------------------------
-- 1. Segment rule compilation: treat date-only upper bounds as end-of-day
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
  v_value_is_date_only boolean;
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
      v_value_is_date_only := v_value_text ~ '^\d{4}-\d{2}-\d{2}$';

      IF v_value_is_date_only THEN
        CASE v_operator
          WHEN 'eq' THEN
            v_clause := format(
              '(%1$s >= %2$L::date AND %1$s < (%2$L::date + interval ''1 day''))',
              v_column,
              v_value_text
            );
          WHEN 'neq' THEN
            v_clause := format(
              'NOT (%1$s >= %2$L::date AND %1$s < (%2$L::date + interval ''1 day''))',
              v_column,
              v_value_text
            );
          WHEN 'lt' THEN
            v_clause := format('%s < %L::date', v_column, v_value_text);
          WHEN 'gt' THEN
            v_clause := format('%s >= (%L::date + interval ''1 day'')', v_column, v_value_text);
          WHEN 'lte' THEN
            v_clause := format('%s < (%L::date + interval ''1 day'')', v_column, v_value_text);
          WHEN 'gte' THEN
            v_clause := format('%s >= %L::date', v_column, v_value_text);
          ELSE
            RAISE EXCEPTION 'Unsupported operator % for timestamp field %', v_operator, v_field;
        END CASE;
      ELSE
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
      END IF;
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
-- 2. Snapshot metrics RPC: preserve inclusive day semantics for date-only input
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_segment_metrics_snapshot(timestamptz, timestamptz, text, text, text);

CREATE OR REPLACE FUNCTION public.get_segment_metrics_snapshot(
  p_since text DEFAULT NULL,
  p_until text DEFAULT NULL,
  p_utm text DEFAULT NULL,
  p_archetype text DEFAULT NULL,
  p_session_state text DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  effective_since timestamptz := '2000-01-01'::timestamptz;
  effective_until timestamptz := '2099-12-31'::timestamptz;
  until_is_date_only boolean := false;
BEGIN
  IF p_since IS NOT NULL AND btrim(p_since) <> '' THEN
    effective_since := CASE
      WHEN p_since ~ '^\d{4}-\d{2}-\d{2}$' THEN p_since::date::timestamptz
      ELSE p_since::timestamptz
    END;
  END IF;

  IF p_until IS NOT NULL AND btrim(p_until) <> '' THEN
    until_is_date_only := p_until ~ '^\d{4}-\d{2}-\d{2}$';
    effective_until := CASE
      WHEN until_is_date_only THEN (p_until::date + interval '1 day')::timestamptz
      ELSE p_until::timestamptz
    END;
  END IF;

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
        WHERE f2.created_date_time >= effective_since
          AND (
            p_until IS NULL OR
            (until_is_date_only AND f2.created_date_time < effective_until) OR
            (NOT until_is_date_only AND f2.created_date_time <= effective_until)
          )
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
  WHERE f.created_date_time >= effective_since
    AND (
      p_until IS NULL OR
      (until_is_date_only AND f.created_date_time < effective_until) OR
      (NOT until_is_date_only AND f.created_date_time <= effective_until)
    )
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

GRANT EXECUTE ON FUNCTION public.get_segment_metrics_snapshot(text, text, text, text, text) TO service_role;

