-- Add the 78h "call invite" stage to get_nurture_performance so its send
-- volume surfaces in the funnel digest. The 78h stage has no promo-based
-- purchase (its real conversion is a booked call, tracked in booking_event), so
-- the `purchased` column reads 0 for it — consistent with the documented
-- promoStage gap that already affects the other stages. Body is unchanged from
-- 20260530120000_funnel_cvr.sql except for the added stage in the array.

BEGIN;

CREATE OR REPLACE FUNCTION get_nurture_performance(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
  stages TEXT[] := ARRAY['6h_no_view', '6h_no_unlock', '30h_no_unlock', '54h_no_unlock', '78h_no_unlock'];
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
