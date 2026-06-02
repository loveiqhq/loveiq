-- DOWN migration for 20260601120100_nurture_perf_78h.sql.
--
-- Restores get_nurture_performance to the original 4-stage array (drops
-- '78h_no_unlock' from the funnel-digest aggregation). No data is touched — the
-- 78h send/booking data remains in report_price_quote / booking_event; it just
-- stops appearing in the digest chart.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260601120100_nurture_perf_78h_down.sql

BEGIN;

CREATE OR REPLACE FUNCTION get_nurture_performance(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
  stages TEXT[] := ARRAY['6h_no_view', '6h_no_unlock', '30h_no_unlock', '54h_no_unlock'];
BEGIN
  SELECT json_build_object(
    'stages', COALESCE((
      SELECT json_agg(json_build_object(
        'stage', s.stage,
        'sent', (
          SELECT COUNT(*)::int FROM report_price_quote rpq
          WHERE rpq.metadata -> 'nurtureEmailsSent' ? s.stage
            AND rpq.updated_date_time >= since_ts AND rpq.updated_date_time < until_ts
        ),
        'purchased', (
          SELECT COUNT(*)::int FROM payment p
          WHERE p.status = 'succeeded'
            AND p.metadata->>'promoStage' = s.stage
            AND p.created_date_time >= since_ts AND p.created_date_time < until_ts
        )
      ) ORDER BY s.ord)
      FROM unnest(stages) WITH ORDINALITY AS s(stage, ord)
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_nurture_performance(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMIT;
