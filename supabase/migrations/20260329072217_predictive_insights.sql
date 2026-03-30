CREATE OR REPLACE FUNCTION get_predictive_insights(p_days INT DEFAULT 30)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSON;
  insights JSON[] := ARRAY[]::JSON[];
  v_now TIMESTAMPTZ := NOW();
  v_period_start TIMESTAMPTZ;
  v_prior_start TIMESTAMPTZ;

  -- Volume projection vars
  v_current_count NUMERIC;
  v_prior_count NUMERIC;
  v_volume_delta NUMERIC;
  v_volume_confidence TEXT;

  -- Abandonment predictor vars
  v_abandon_qid TEXT;
  v_abandon_pct NUMERIC;
  v_abandon_sessions BIGINT;
  v_abandon_confidence TEXT;

  -- UTM conversion vars
  v_utm_source TEXT;
  v_utm_conv_rate NUMERIC;
  v_overall_conv_rate NUMERIC;
  v_utm_sessions BIGINT;
  v_utm_confidence TEXT;

  -- Archetype trend vars
  v_arch_name TEXT;
  v_arch_recent_pct NUMERIC;
  v_arch_prior_pct NUMERIC;
  v_arch_change NUMERIC;

  -- Friction zone vars
  v_friction_start INT;
  v_friction_end INT;
  v_friction_rate NUMERIC;
  v_survey_avg_abandon NUMERIC;
  v_friction_events BIGINT;
  v_friction_confidence TEXT;

  -- Completion time vars
  v_slow_median NUMERIC;
  v_overall_median NUMERIC;
  v_slow_count BIGINT;
  v_time_confidence TEXT;

  -- Revenue forecast vars
  v_daily_submissions NUMERIC;
  v_payment_conv_rate NUMERIC;
  v_avg_payment NUMERIC;
  v_projected_revenue NUMERIC;
  v_actual_revenue NUMERIC;
  v_payment_count BIGINT;
  v_revenue_confidence TEXT;
BEGIN
  v_period_start := v_now - (p_days || ' days')::INTERVAL;
  v_prior_start := v_period_start - (p_days || ' days')::INTERVAL;

  -- =========================================================================
  -- 1. Volume Projection
  -- =========================================================================
  SELECT COUNT(*) INTO v_current_count
  FROM survey_submission
  WHERE created_date_time >= v_period_start;

  SELECT COUNT(*) INTO v_prior_count
  FROM survey_submission
  WHERE created_date_time >= v_prior_start
    AND created_date_time < v_period_start;

  IF v_prior_count > 0 THEN
    v_volume_delta := ((v_current_count - v_prior_count) / v_prior_count) * 100;
  ELSE
    v_volume_delta := CASE WHEN v_current_count > 0 THEN 100 ELSE 0 END;
  END IF;

  IF v_current_count > 50 THEN
    v_volume_confidence := 'high';
  ELSIF v_current_count >= 20 THEN
    v_volume_confidence := 'medium';
  ELSE
    v_volume_confidence := 'low';
  END IF;

  IF ABS(v_volume_delta) > 15 THEN
    insights := array_append(insights, json_build_object(
      'type', 'volume_projection',
      'title', CASE
        WHEN v_volume_delta > 0 THEN 'Submission volume is trending up'
        ELSE 'Submission volume is trending down'
      END,
      'description', 'Daily submissions changed by ' || ROUND(v_volume_delta, 1) || '% compared to the prior ' || p_days || '-day period (' || v_current_count || ' vs ' || v_prior_count || ').',
      'confidence', v_volume_confidence,
      'metric_value', ROUND(v_current_count, 2),
      'comparison_value', ROUND(v_prior_count, 2),
      'trend', CASE WHEN v_volume_delta > 0 THEN 'up' ELSE 'down' END,
      'priority', 2
    ));
  END IF;

  -- =========================================================================
  -- 2. Abandonment Predictors
  -- =========================================================================
  BEGIN
    WITH question_times AS (
      SELECT
        q_id,
        session_id,
        time_spent_ms,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY time_spent_ms) OVER (PARTITION BY q_id) AS p25
      FROM survey_behavior_event
      WHERE created_at >= v_period_start
        AND time_spent_ms IS NOT NULL
        AND time_spent_ms > 0
    ),
    fast_sessions AS (
      SELECT DISTINCT q_id, session_id
      FROM question_times
      WHERE time_spent_ms <= p25
    ),
    abandon_after AS (
      SELECT
        fs.q_id,
        COUNT(DISTINCT fs.session_id) AS fast_count,
        COUNT(DISTINCT CASE WHEN ae.session_id IS NOT NULL THEN fs.session_id END) AS abandon_count
      FROM fast_sessions fs
      LEFT JOIN survey_behavior_event ae
        ON ae.session_id = fs.session_id
        AND ae.direction = 'abandon'
        AND ae.question_index > (
          SELECT MIN(be2.question_index)
          FROM survey_behavior_event be2
          WHERE be2.session_id = fs.session_id AND be2.q_id = fs.q_id
        )
      GROUP BY fs.q_id
    ),
    ranked AS (
      SELECT
        q_id,
        fast_count,
        abandon_count,
        CASE WHEN fast_count > 0 THEN (abandon_count::NUMERIC / fast_count) * 100 ELSE 0 END AS abandon_pct
      FROM abandon_after
      WHERE fast_count >= 5
      ORDER BY abandon_pct DESC
      LIMIT 1
    )
    SELECT q_id, abandon_pct, fast_count
    INTO v_abandon_qid, v_abandon_pct, v_abandon_sessions
    FROM ranked;

    IF v_abandon_qid IS NOT NULL THEN
      IF v_abandon_sessions > 100 THEN
        v_abandon_confidence := 'high';
      ELSIF v_abandon_sessions >= 30 THEN
        v_abandon_confidence := 'medium';
      ELSE
        v_abandon_confidence := 'low';
      END IF;

      insights := array_append(insights, json_build_object(
        'type', 'abandonment_predictor',
        'title', 'Question ' || v_abandon_qid || ' predicts abandonment',
        'description', 'Users who rush through question ' || v_abandon_qid || ' (bottom 25% time) abandon ' || ROUND(v_abandon_pct, 1) || '% of the time. Based on ' || v_abandon_sessions || ' sessions.',
        'confidence', v_abandon_confidence,
        'metric_value', ROUND(v_abandon_pct, 2),
        'comparison_value', v_abandon_sessions,
        'trend', CASE WHEN v_abandon_pct > 50 THEN 'up' ELSE 'stable' END,
        'priority', 1
      ));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- =========================================================================
  -- 3. UTM Conversion Rates
  -- =========================================================================
  BEGIN
    SELECT
      CASE WHEN COUNT(DISTINCT session_id) > 0
        THEN (COUNT(DISTINCT CASE WHEN direction = 'complete' THEN session_id END)::NUMERIC / COUNT(DISTINCT session_id)) * 100
        ELSE 0
      END
    INTO v_overall_conv_rate
    FROM survey_behavior_event
    WHERE created_at >= v_period_start;

    IF v_overall_conv_rate > 0 THEN
      WITH utm_sessions AS (
        SELECT
          ss.utm_tracker->>'utm_source' AS utm_src,
          be.session_id,
          MAX(CASE WHEN be.direction = 'complete' THEN 1 ELSE 0 END) AS completed
        FROM survey_behavior_event be
        JOIN survey_submission ss ON ss.session_id = be.session_id
        WHERE be.created_at >= v_period_start
          AND ss.utm_tracker IS NOT NULL
          AND ss.utm_tracker->>'utm_source' IS NOT NULL
          AND ss.utm_tracker->>'utm_source' != ''
        GROUP BY ss.utm_tracker->>'utm_source', be.session_id
      ),
      source_rates AS (
        SELECT
          utm_src,
          COUNT(*) AS total_sessions,
          SUM(completed) AS completed_count,
          (SUM(completed)::NUMERIC / COUNT(*)) * 100 AS conv_rate
        FROM utm_sessions
        GROUP BY utm_src
        HAVING COUNT(*) >= 5
        ORDER BY conv_rate DESC
        LIMIT 1
      )
      SELECT utm_src, conv_rate, total_sessions
      INTO v_utm_source, v_utm_conv_rate, v_utm_sessions
      FROM source_rates
      WHERE conv_rate > v_overall_conv_rate * 1.5;

      IF v_utm_source IS NOT NULL THEN
        IF v_utm_sessions > 50 THEN
          v_utm_confidence := 'high';
        ELSIF v_utm_sessions >= 20 THEN
          v_utm_confidence := 'medium';
        ELSE
          v_utm_confidence := 'low';
        END IF;

        insights := array_append(insights, json_build_object(
          'type', 'utm_conversion',
          'title', 'UTM source "' || v_utm_source || '" outperforms average',
          'description', v_utm_source || ' converts at ' || ROUND(v_utm_conv_rate, 1) || '% vs overall ' || ROUND(v_overall_conv_rate, 1) || '% (' || v_utm_sessions || ' sessions). Consider increasing spend.',
          'confidence', v_utm_confidence,
          'metric_value', ROUND(v_utm_conv_rate, 2),
          'comparison_value', ROUND(v_overall_conv_rate, 2),
          'trend', 'up',
          'priority', 3
        ));
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- =========================================================================
  -- 4. Archetype Trend
  -- =========================================================================
  BEGIN
    WITH recent_half AS (
      SELECT sr.primary_archetype, COUNT(*) AS cnt
      FROM scoring_result sr
      JOIN survey_submission ss ON ss.id = sr.survey_submission_id
      WHERE ss.created_date_time >= v_now - ((p_days / 2) || ' days')::INTERVAL
      GROUP BY sr.primary_archetype
    ),
    prior_half AS (
      SELECT sr.primary_archetype, COUNT(*) AS cnt
      FROM scoring_result sr
      JOIN survey_submission ss ON ss.id = sr.survey_submission_id
      WHERE ss.created_date_time >= v_now - (p_days || ' days')::INTERVAL
        AND ss.created_date_time < v_now - ((p_days / 2) || ' days')::INTERVAL
      GROUP BY sr.primary_archetype
    ),
    recent_total AS (
      SELECT COALESCE(SUM(cnt), 0) AS total FROM recent_half
    ),
    prior_total AS (
      SELECT COALESCE(SUM(cnt), 0) AS total FROM prior_half
    ),
    combined AS (
      SELECT
        COALESCE(r.primary_archetype, p.primary_archetype) AS archetype,
        CASE WHEN rt.total > 0 THEN (COALESCE(r.cnt, 0)::NUMERIC / rt.total) * 100 ELSE 0 END AS recent_pct,
        CASE WHEN pt.total > 0 THEN (COALESCE(p.cnt, 0)::NUMERIC / pt.total) * 100 ELSE 0 END AS prior_pct
      FROM recent_half r
      FULL OUTER JOIN prior_half p ON p.primary_archetype = r.primary_archetype
      CROSS JOIN recent_total rt
      CROSS JOIN prior_total pt
    )
    SELECT archetype, recent_pct, prior_pct,
      CASE WHEN prior_pct > 0 THEN ((recent_pct - prior_pct) / prior_pct) * 100 ELSE 100 END AS rel_change
    INTO v_arch_name, v_arch_recent_pct, v_arch_prior_pct, v_arch_change
    FROM combined
    WHERE CASE WHEN prior_pct > 0 THEN ABS((recent_pct - prior_pct) / prior_pct) * 100 ELSE 100 END > 15
    ORDER BY ABS(CASE WHEN prior_pct > 0 THEN ((recent_pct - prior_pct) / prior_pct) * 100 ELSE 100 END) DESC
    LIMIT 1;

    IF v_arch_name IS NOT NULL THEN
      insights := array_append(insights, json_build_object(
        'type', 'archetype_trend',
        'title', v_arch_name || ' archetype is ' || CASE WHEN v_arch_change > 0 THEN 'rising' ELSE 'declining' END,
        'description', v_arch_name || ' shifted from ' || ROUND(v_arch_prior_pct, 1) || '% to ' || ROUND(v_arch_recent_pct, 1) || '% of results (' || ROUND(v_arch_change, 1) || '% relative change).',
        'confidence', 'medium',
        'metric_value', ROUND(v_arch_recent_pct, 2),
        'comparison_value', ROUND(v_arch_prior_pct, 2),
        'trend', CASE WHEN v_arch_change > 0 THEN 'up' ELSE 'down' END,
        'priority', 4
      ));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- =========================================================================
  -- 5. Friction Zone Detection
  -- =========================================================================
  BEGIN
    WITH per_question AS (
      SELECT
        question_index,
        COUNT(*) AS total_events,
        COUNT(*) FILTER (WHERE direction = 'abandon') AS abandon_events
      FROM survey_behavior_event
      WHERE created_at >= v_period_start
        AND question_index IS NOT NULL
      GROUP BY question_index
    ),
    overall AS (
      SELECT
        CASE WHEN SUM(total_events) > 0
          THEN SUM(abandon_events)::NUMERIC / SUM(total_events)
          ELSE 0
        END AS avg_abandon_rate,
        SUM(total_events) AS total_ev
      FROM per_question
    ),
    flagged AS (
      SELECT
        pq.question_index,
        CASE WHEN pq.total_events > 0 THEN pq.abandon_events::NUMERIC / pq.total_events ELSE 0 END AS q_abandon_rate,
        o.avg_abandon_rate,
        o.total_ev
      FROM per_question pq
      CROSS JOIN overall o
      WHERE pq.total_events > 0
        AND (pq.abandon_events::NUMERIC / pq.total_events) > o.avg_abandon_rate * 2
    ),
    zones AS (
      SELECT
        MIN(question_index) AS zone_start,
        MAX(question_index) AS zone_end,
        MAX(q_abandon_rate) AS worst_rate,
        MAX(avg_abandon_rate) AS survey_avg,
        MAX(total_ev) AS total_events
      FROM flagged
    )
    SELECT zone_start, zone_end, worst_rate, survey_avg, total_events
    INTO v_friction_start, v_friction_end, v_friction_rate, v_survey_avg_abandon, v_friction_events
    FROM zones
    WHERE zone_start IS NOT NULL;

    IF v_friction_start IS NOT NULL THEN
      IF v_friction_events > 200 THEN
        v_friction_confidence := 'high';
      ELSIF v_friction_events >= 50 THEN
        v_friction_confidence := 'medium';
      ELSE
        v_friction_confidence := 'low';
      END IF;

      insights := array_append(insights, json_build_object(
        'type', 'friction_zone',
        'title', 'High friction detected at questions ' || v_friction_start || '-' || v_friction_end,
        'description', 'Abandon rate in this zone reaches ' || ROUND(v_friction_rate * 100, 1) || '%, which is over 2x the survey average of ' || ROUND(v_survey_avg_abandon * 100, 1) || '%. Based on ' || v_friction_events || ' total events.',
        'confidence', v_friction_confidence,
        'metric_value', ROUND(v_friction_rate * 100, 2),
        'comparison_value', ROUND(v_survey_avg_abandon * 100, 2),
        'trend', 'up',
        'priority', 1
      ));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- =========================================================================
  -- 6. Completion Time Prediction
  -- =========================================================================
  BEGIN
    WITH early_avg AS (
      SELECT
        session_id,
        AVG(time_spent_ms) AS avg_time_ms
      FROM survey_behavior_event
      WHERE created_at >= v_period_start
        AND question_index BETWEEN 0 AND 9
        AND time_spent_ms IS NOT NULL
        AND time_spent_ms > 0
      GROUP BY session_id
      HAVING AVG(time_spent_ms) > 120000
    ),
    slow_durations AS (
      SELECT ss.duration_ms
      FROM early_avg ea
      JOIN survey_submission ss ON ss.session_id = ea.session_id
      WHERE ss.duration_ms IS NOT NULL AND ss.duration_ms > 0
    ),
    all_durations AS (
      SELECT duration_ms
      FROM survey_submission
      WHERE created_date_time >= v_period_start
        AND duration_ms IS NOT NULL AND duration_ms > 0
    )
    SELECT
      (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) FROM slow_durations),
      (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) FROM all_durations),
      (SELECT COUNT(*) FROM slow_durations)
    INTO v_slow_median, v_overall_median, v_slow_count;

    IF v_slow_count > 0 AND v_overall_median > 0 THEN
      IF v_slow_count > 50 THEN
        v_time_confidence := 'high';
      ELSIF v_slow_count >= 20 THEN
        v_time_confidence := 'medium';
      ELSE
        v_time_confidence := 'low';
      END IF;

      insights := array_append(insights, json_build_object(
        'type', 'completion_time',
        'title', 'Slow starters take significantly longer to complete',
        'description', 'Users averaging >2min/question early on have a median total duration of ' || ROUND(v_slow_median / 60000, 1) || ' min vs overall ' || ROUND(v_overall_median / 60000, 1) || ' min (' || v_slow_count || ' users).',
        'confidence', v_time_confidence,
        'metric_value', ROUND(v_slow_median / 60000, 2),
        'comparison_value', ROUND(v_overall_median / 60000, 2),
        'trend', CASE WHEN v_slow_median > v_overall_median * 1.3 THEN 'up' ELSE 'stable' END,
        'priority', 3
      ));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- =========================================================================
  -- 7. Revenue Forecast
  -- =========================================================================
  BEGIN
    SELECT COUNT(*)::NUMERIC / GREATEST(p_days, 1)
    INTO v_daily_submissions
    FROM survey_submission
    WHERE created_date_time >= v_period_start;

    SELECT
      CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE status = 'succeeded')::NUMERIC / COUNT(*)
        ELSE 0
      END,
      COALESCE(AVG(amount) FILTER (WHERE status = 'succeeded'), 0),
      COUNT(*) FILTER (WHERE status = 'succeeded')
    INTO v_payment_conv_rate, v_avg_payment, v_payment_count
    FROM payment
    WHERE created_date_time >= v_period_start;

    v_projected_revenue := v_daily_submissions * v_payment_conv_rate * v_avg_payment * 30;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_actual_revenue
    FROM payment
    WHERE status = 'succeeded'
      AND created_date_time >= v_period_start;

    IF v_payment_count > 0 THEN
      IF v_payment_count > 10 THEN
        v_revenue_confidence := 'high';
      ELSIF v_payment_count >= 3 THEN
        v_revenue_confidence := 'medium';
      ELSE
        v_revenue_confidence := 'low';
      END IF;

      insights := array_append(insights, json_build_object(
        'type', 'revenue_forecast',
        'title', 'Projected 30-day revenue: $' || ROUND(v_projected_revenue, 2),
        'description', 'Based on ' || ROUND(v_daily_submissions, 1) || ' submissions/day, ' || ROUND(v_payment_conv_rate * 100, 1) || '% conversion, and $' || ROUND(v_avg_payment, 2) || ' avg payment. Actual in period: $' || ROUND(v_actual_revenue, 2) || '.',
        'confidence', v_revenue_confidence,
        'metric_value', ROUND(v_projected_revenue, 2),
        'comparison_value', ROUND(v_actual_revenue, 2),
        'trend', CASE WHEN v_projected_revenue > v_actual_revenue THEN 'up' ELSE 'down' END,
        'priority', 2
      ));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- =========================================================================
  -- Assemble final result
  -- =========================================================================
  SELECT COALESCE(json_agg(i), '[]'::JSON)
  INTO result
  FROM unnest(insights) i;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_predictive_insights(INT) TO service_role;;
