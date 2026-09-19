-- Complete the conversion funnel RPC with the real acquisition→monetization
-- stages so the admin Funnels page (and any strategy query) shows the whole
-- picture in one call. We are switching to 100% white (no more dark A/B), so the
-- funnel just needs to be complete and trustworthy — not variant-split.
--
-- The previous version only had 4 stages (waitlist / survey_started /
-- survey_completed / invite_sent). Waitlist is legacy (the site is survey-driven)
-- and invite is a post-purchase share action — neither is an acquisition-funnel
-- step, so they are dropped here. Every stage below is CONSENT-FREE (first-party
-- aggregate or server-side write), so the funnel is not confounded by analytics
-- consent attrition — the numbers are directly comparable stage to stage:
--   unique_visitors  — funnel_event 'unique_visitor'         (consent-free, daily-deduped)
--   survey_started   — survey_partial_save distinct session   (consent-free, canonical start)
--   survey_completed — survey_submission status='completed'   (consent-free, server write)
--   report_viewed    — report_session distinct personal_report (consent-free, one per report)
--   purchased        — payment status='succeeded'             (consent-free; incl. €0 coupon unlocks)
-- Plus a top-level `revenue` = SUM of paid amount>0 in the payment currency
-- (major units, e.g. EUR — payment.amount is NOT in cents), excludes €0 coupon/test.
-- CREATE OR REPLACE is idempotent. Added fields are additive — the admin
-- /api/admin/funnels/conversion route renders the `stages` array generically.

CREATE OR REPLACE FUNCTION get_conversion_funnel(
  since_ts TIMESTAMPTZ,
  utm_filter TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  SELECT json_build_object(
    'stages', json_build_array(
      json_build_object('name', 'unique_visitors', 'count', (
        SELECT COUNT(DISTINCT fe.visitor_id)::int
        FROM funnel_event fe
        WHERE fe.event_type = 'unique_visitor'
          AND fe.day >= effective_since::date
          AND (utm_filter IS NULL OR fe.utm_source ILIKE '%' || utm_filter || '%')
      )),
      json_build_object('name', 'survey_started', 'count', (
        SELECT COUNT(DISTINCT sps.session_id)::int
        FROM survey_partial_save sps
        WHERE sps.started_at >= effective_since
          AND (utm_filter IS NULL OR EXISTS (
            SELECT 1 FROM survey_submission ss
            WHERE ss.session_id = sps.session_id
              AND ss.utm_tracker ILIKE '%' || utm_filter || '%'
          ))
      )),
      json_build_object('name', 'survey_completed', 'count', (
        SELECT COUNT(*)::int
        FROM survey_submission ss
        WHERE ss.status = 'completed'
          AND ss.created_date_time >= effective_since
          AND (utm_filter IS NULL OR ss.utm_tracker ILIKE '%' || utm_filter || '%')
      )),
      json_build_object('name', 'report_viewed', 'count', (
        SELECT COUNT(DISTINCT rs.personal_report_id)::int
        FROM report_session rs
        WHERE rs.started_at >= effective_since
          AND (utm_filter IS NULL OR rs.utm_tracker ILIKE '%' || utm_filter || '%')
      )),
      json_build_object('name', 'purchased', 'count', (
        SELECT COUNT(*)::int
        FROM payment p
        WHERE p.status = 'succeeded'
          AND p.created_date_time >= effective_since
          AND (utm_filter IS NULL OR EXISTS (
            SELECT 1 FROM personal_report pr
            JOIN survey_submission ss ON ss.id = pr.survey_submission_id
            WHERE pr.id = p.personal_report_id
              AND ss.utm_tracker ILIKE '%' || utm_filter || '%'
          ))
      ))
    ),
    'revenue', (
      SELECT COALESCE(SUM(p.amount), 0)
      FROM payment p
      WHERE p.status = 'succeeded'
        AND p.amount > 0
        AND p.created_date_time >= effective_since
        AND (utm_filter IS NULL OR EXISTS (
          SELECT 1 FROM personal_report pr
          JOIN survey_submission ss ON ss.id = pr.survey_submission_id
          WHERE pr.id = p.personal_report_id
            AND ss.utm_tracker ILIKE '%' || utm_filter || '%'
        ))
    )
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_conversion_funnel(TIMESTAMPTZ, TEXT) TO service_role;
