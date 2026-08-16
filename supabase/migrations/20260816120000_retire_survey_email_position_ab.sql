-- Retire the survey email-position A/B (survey-email-position-ab).
--
-- The experiment is over: "last" shipped to everyone on 2026-08-16, so the app
-- no longer mints the arm cookie and no longer stamps `email_position` on
-- survey_partial_save / funnel_event / survey_behavior_event. New rows are NULL.
--
-- Columns are KEPT (not dropped) so the finished experiment stays analyzable —
-- the admin panel (/api/admin/analytics/email-position-ab) and the digest's
-- per-arm chart both read them, and both self-disable once their window no
-- longer reaches back into the experiment period. Nothing writes them anymore.
--
-- The only thing that must change is get_dropout_funnel's cohort filter. It was
-- pinned to `(email_position IS NULL OR = 'first')` so the running experiment
-- couldn't blend two different question orders into one curve. That pin is now
-- backwards: new (NULL) rows use the email-LAST order, so the old 'first'-arm
-- rows are the odd ones out. Flip it to exclude only the retired email-first
-- ordering, which leaves one consistent flow in the curve:
--
--   NULL  → post-retirement rows (email last)  ✓ keep
--   'last'→ experiment's last arm (same order) ✓ keep
--   'first'→ retired ordering                  ✗ exclude
--
-- Pre-experiment legacy rows are also NULL but all predate 2026-06-30, so no
-- window the digest asks for (30 days) can reach them. Once no live window
-- reaches back to 2026-08-16, this WHERE clause can be dropped entirely.

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
      AND email_position IS DISTINCT FROM 'first'
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

COMMENT ON COLUMN survey_partial_save.email_position IS
  'RETIRED 2026-08-16 (survey-email-position-ab). Historical arm ("first"|"last"); no longer written. NULL = pre-experiment or post-retirement (email asked last).';
COMMENT ON COLUMN funnel_event.email_position IS
  'RETIRED 2026-08-16 (survey-email-position-ab). Historical arm on survey_engine_mount rows; no longer written.';
COMMENT ON COLUMN survey_behavior_event.email_position IS
  'RETIRED 2026-08-16 (survey-email-position-ab). Historical arm ("first"|"last"); no longer written. NULL = pre-experiment or post-retirement (email asked last).';
