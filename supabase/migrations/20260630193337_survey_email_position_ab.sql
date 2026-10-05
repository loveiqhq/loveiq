-- Survey email-position A/B experiment (survey-email-position-ab).
--
-- Tests whether asking the email question FIRST (control) vs. LAST (just before
-- the marketing opt-in) changes survey drop-off. To analyze drop-off by arm
-- across the WHOLE funnel — including users who decline analytics consent — the
-- arm is stamped onto the three consent-relevant first-party survey tables.
--
-- Additive + nullable, no backfill: pre-experiment rows stay NULL and read as
-- the control/legacy cohort. The writers (survey-partial, funnel-event,
-- survey-tracking API routes) are all best-effort/swallowed, but APPLY THIS
-- MIGRATION BEFORE deploying the code that writes the column — a PostgREST
-- insert with an unknown column 400s and would silently drop tracking rows.
--
--   • survey_partial_save.email_position   — consent-FREE depth signal
--                                            (current_index by arm)
--   • funnel_event.email_position          — consent-FREE "entered survey"
--                                            denominator (survey_engine_mount)
--   • survey_behavior_event.email_position — per-question abandons by arm
--                                            (incl. the no-answer first-question
--                                            bounce); consent-gated like the rest
--                                            of that table

ALTER TABLE survey_partial_save   ADD COLUMN IF NOT EXISTS email_position TEXT;
ALTER TABLE funnel_event          ADD COLUMN IF NOT EXISTS email_position TEXT;
ALTER TABLE survey_behavior_event ADD COLUMN IF NOT EXISTS email_position TEXT;

COMMENT ON COLUMN survey_partial_save.email_position IS
  'survey-email-position-ab arm ("first"|"last"); NULL = pre-experiment/legacy (control).';
COMMENT ON COLUMN funnel_event.email_position IS
  'survey-email-position-ab arm ("first"|"last") on survey_engine_mount rows; NULL = legacy/control.';
COMMENT ON COLUMN survey_behavior_event.email_position IS
  'survey-email-position-ab arm ("first"|"last"); NULL = pre-experiment/legacy (control).';

-- ═══════════════════════════════════════════════════════════════════════════
-- get_dropout_funnel — make arm-aware to stop the daily digest retention curve
-- silently BLENDING the two arms. Once the experiment runs, question_index 0 is
-- the email question for the "first" arm and a soft question for the "last" arm;
-- MIN(q_id) would collapse the bucket under a misleading label. Restricting to
-- the control/legacy cohort keeps the existing digest chart meaning the same
-- thing it always did (the email-first retention curve). Per-arm curves come
-- from get_dropout_funnel_by_arm below.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_dropout_funnel(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  WITH per_q AS (
    SELECT question_index,
           MIN(q_id) AS q_id,
           COUNT(DISTINCT session_id)::int AS sessions
    FROM survey_behavior_event
    WHERE event_time >= since_ts AND event_time < until_ts
      AND question_index IS NOT NULL
      AND (email_position IS NULL OR email_position = 'first')
    GROUP BY question_index
  )
  SELECT json_build_object(
    'questions', COALESCE((
      SELECT json_agg(json_build_object(
        'question_index', question_index,
        'q_id', q_id,
        'sessions', sessions
      ) ORDER BY question_index)
      FROM per_q
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dropout_funnel(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- get_dropout_funnel_by_arm — same window-snapshot retention curve, but for a
-- single email-position arm. Powers the per-arm drop-off chart in the Slack
-- digest and the admin analytics dashboard. Call once per arm ('first','last')
-- and compare; the first-question (index 0) drop is the headline metric.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_dropout_funnel_by_arm(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ,
  arm TEXT
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  WITH per_q AS (
    SELECT question_index,
           MIN(q_id) AS q_id,
           COUNT(DISTINCT session_id)::int AS sessions
    FROM survey_behavior_event
    WHERE event_time >= since_ts AND event_time < until_ts
      AND question_index IS NOT NULL
      AND email_position = arm
    GROUP BY question_index
  )
  SELECT json_build_object(
    'arm', arm,
    'questions', COALESCE((
      SELECT json_agg(json_build_object(
        'question_index', question_index,
        'q_id', q_id,
        'sessions', sessions
      ) ORDER BY question_index)
      FROM per_q
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dropout_funnel_by_arm(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO service_role;
