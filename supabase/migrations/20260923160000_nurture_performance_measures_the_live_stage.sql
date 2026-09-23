-- get_nurture_performance measured five retired stages and never the live one.
--
-- Pricing 2.0 (2026-08-03) cut the nurture sequence to ONE stage, `72h_no_unlock`
-- (`type Stage` in app/api/cron/nurture-sequence/route.ts). This function kept the old
-- list — 6h_no_view, 6h_no_unlock, 30h_no_unlock, 54h_no_unlock, 78h_no_unlock — so the
-- only stage actually sending was absent from its output.
--
-- It was also dating sends by `report_price_quote.updated_date_time`, which is when the
-- ROW last changed, not when the email went. 20260831101238_retire_pricing_bucket_a set
-- that column to now() on every unpurchased quote, so for the 30 days to 2026-09-23 the
-- function reported 1,179 / 1,175 / 1,171 / 238 sends for stages that had sent nothing
-- since August, and no row at all for the 403 real sends.
--
-- The send time now comes from the promo code: the cron mints it with a 24-hour expiry
-- (`expiresAtSec = now + 24 * 3600` in the route) and writes it after the email is sent,
-- so `expiresAt - 24h` is the send. 30h/54h codes carry the same field, so their history
-- stays countable; 6h_no_view and 78h_no_unlock stored no send time anywhere in this
-- table and are left out rather than counted by a date that is not theirs.
--
-- The cast is guarded: one malformed value would otherwise fail the whole call.

CREATE OR REPLACE FUNCTION public.get_nurture_performance(since_ts timestamp with time zone, until_ts timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result JSON;
  -- The live stage first. Must contain every member of `type Stage` in
  -- app/api/cron/nurture-sequence/route.ts (a unit test reads both).
  stages TEXT[] := ARRAY['72h_no_unlock', '30h_no_unlock', '54h_no_unlock'];
  live_stages TEXT[] := ARRAY['72h_no_unlock'];
BEGIN
  SELECT json_build_object(
    'stages', COALESCE((
      SELECT json_agg(json_build_object(
        'stage', s.stage,
        'live', s.stage = ANY (live_stages),
        'sent', (
          SELECT COUNT(*)::int
          FROM report_price_quote rpq
          CROSS JOIN LATERAL (
            SELECT CASE
              WHEN rpq.metadata -> 'nurturePromoCodes' -> s.stage ->> 'expiresAt' ~ '^\d{4}-\d{2}-\d{2}T'
              THEN (rpq.metadata -> 'nurturePromoCodes' -> s.stage ->> 'expiresAt')::timestamptz - interval '24 hours'
            END AS sent_at
          ) t
          WHERE rpq.metadata -> 'nurtureEmailsSent' ? s.stage
            AND t.sent_at >= since_ts AND t.sent_at < until_ts
        ),
        'purchased', (
          SELECT COUNT(*)::int FROM payment p
          WHERE p.status = 'succeeded' AND coalesce(p.is_test, false) = false
            AND p.metadata->>'promoStage' = s.stage
            AND p.created_date_time >= since_ts AND p.created_date_time < until_ts
        )
      ) ORDER BY s.ord)
      FROM unnest(stages) WITH ORDINALITY AS s(stage, ord)
    ), '[]'::json),
    'note', '72h_no_unlock is the only live stage since pricing 2.0 (2026-08-03). 30h and 54h are retired and shown for history. 6h_no_view and 78h_no_unlock also ran before then but stored no send time, so they cannot be counted by date and are omitted.'
  ) INTO result;
  RETURN result;
END;
$function$;
