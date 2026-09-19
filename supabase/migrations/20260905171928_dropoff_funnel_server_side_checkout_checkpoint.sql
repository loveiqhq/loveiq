-- Recalibrate the drop-off funnel's CHECKOUT checkpoint onto the server-side signal.
--
-- `get_dropoff_everywhere` builds the funnel in the Slack digest AND feeds
-- `scoreFunnelLeaks`, which ranks the leaks and drives the digest's
-- recommendations. Its `begin_checkout` stage counted a CONSENT-GATED client
-- event from `analytics_event`, while its `purchased` stage counted server-side
-- `payment` rows. Measured on production over 2026-08-25 → 2026-09-05:
--
--     begin_checkout   client event:  9      server truth: 14     36% blind
--
-- Cross-checked three ways: our own `analytics_event` said 9, GA4 said 10
-- distinct users, and the live Stripe API has sessions for 14. So the funnel
-- understated the checkout→paid leak (it read 5/9 = 56% when the truth is
-- 5/14 = 36%) and overstated paywall→checkout by the same 5 readers.
--
-- The project already defined this checkpoint the other way elsewhere:
-- `get_axis_funnel_daily` and `get_landing_arm_funnel_daily` both use
-- `report_price_quote.checkout_started_at`. So a single digest could report the
-- same reader as having reached checkout in one chart and not in another —
-- which is what prompted this (EC, 2026-09-05, after a session recording
-- disagreed with the Slack rail). This aligns the drop-off funnel with them.
--
-- `checkout_started_at` is stamped by /api/stripe/checkout-session only after
-- Stripe has accepted the session, so the stage means "we created a Stripe
-- session and sent them there". Note that a session recording can NEVER
-- corroborate it: Stripe's hosted page is a different origin with no snippet,
-- so the recording ends at `$pageleave` and the checkout is invisible on video.
--
-- `purchased` also gains `is_test = false`, matching `fetchRevenue`, so the
-- funnel's tail can never count a staff test purchase that the revenue line
-- already excludes (12 such payments exist, Apr–May 2026; no-op for recent
-- windows, correct going forward).
--
-- Stage names, order and JSON shape are unchanged — the renderer and the leak
-- scorer key off `name`. The signature is unchanged, so this REPLACES the
-- function rather than adding an overload.
--
-- DELIBERATELY NOT CHANGED HERE, with the reason:
--
--  * `report_viewed` stays on the consent-gated client event (104) even though
--    `report_session` is the server-side truth (189, and the report route's own
--    comment says so). Swapping it event-for-event INVERTS the funnel:
--    `report_session` counts readers returning to older reports, so 189 would
--    sit above `survey_submitted` (148) and the chart would climb. The
--    cohort-scoped form — submitted AND opened in the same window — is 143 and
--    stays monotone, but that changes the stage's windowing semantics, not just
--    its source. Pick one deliberately rather than as a side effect of this fix.
--  * `paywall_initiated` has NO server-side signal persisted anywhere. The
--    `/api/price` POST witnesses it server-side but writes no row; it only
--    passes a transient `reachedFloor` to the Slack journey message. Until
--    something records it, this stage cannot be de-gated — and note that mixing
--    a server-truth checkout with a consent-gated paywall can invert THAT edge
--    in a low-volume window. `scoreFunnelLeaks` clamps with
--    `Math.max(0, a - b)` and `Math.min(1, rate)`, so an inversion silently
--    drops the edge rather than producing nonsense revenue — it degrades the
--    ranking, it does not corrupt it.
--  * `get_funnel_sparklines`, `get_funnel_sparklines_v2`, `get_funnel_sparklines_v3`
--    (report_viewed + begin_checkout) and `get_engagement_purchase_lift`
--    (report_viewed) all still read the client events. Each is a larger rewrite
--    with its own day-bucketing to re-verify, so they are left consistent with
--    each other rather than half-migrated.

CREATE OR REPLACE FUNCTION public.get_dropoff_everywhere(
  since_ts timestamp with time zone,
  until_ts timestamp with time zone
)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  result JSON;
  since_day DATE := since_ts::date;
  until_day DATE := until_ts::date;
BEGIN
  SELECT json_build_object(
    'stages', json_build_array(
      json_build_object('name', 'unique_visitors', 'count', (
        SELECT COUNT(DISTINCT visitor_id)::int FROM funnel_event
        WHERE event_type = 'unique_visitor' AND day >= since_day AND day < until_day
      )),
      json_build_object('name', 'saw_q1', 'count', (
        SELECT COUNT(DISTINCT visitor_id)::int FROM funnel_event
        WHERE event_type = 'survey_engine_mount' AND day >= since_day AND day < until_day
      )),
      json_build_object('name', 'survey_started', 'count', (
        SELECT COUNT(DISTINCT session_id)::int FROM survey_partial_save
        WHERE started_at >= since_ts AND started_at < until_ts
      )),
      json_build_object('name', 'q1_answered', 'count', (
        SELECT COUNT(DISTINCT session_id)::int FROM survey_behavior_event
        WHERE answered = true AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'completed_all_questions', 'count', (
        SELECT COUNT(DISTINCT session_id)::int FROM survey_behavior_event
        WHERE direction = 'complete' AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'survey_submitted', 'count', (
        SELECT COUNT(*)::int FROM survey_submission
        WHERE status = 'completed'
          AND created_date_time >= since_ts AND created_date_time < until_ts
      )),
      json_build_object('name', 'wizard_slide_1', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'wizard_slide_advanced'
          AND metadata->>'to_slide' ~ '^[0-9]+$'
          AND (metadata->>'to_slide')::int = 1
          AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'wizard_slide_5', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'wizard_slide_advanced'
          AND metadata->>'to_slide' ~ '^[0-9]+$'
          AND (metadata->>'to_slide')::int = 5
          AND event_time >= since_ts AND event_time < until_ts
      )),
      -- Consent-gated; see the header note on report_session before changing.
      json_build_object('name', 'report_viewed', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'report_viewed'
          AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'engagement_1min', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'report_engagement_1min'
          AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'engagement_5min', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'report_engagement_5min'
          AND event_time >= since_ts AND event_time < until_ts
      )),
      json_build_object('name', 'engagement_10min', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'report_engagement_10min'
          AND event_time >= since_ts AND event_time < until_ts
      )),
      -- Consent-gated; no server-side paywall signal exists to replace it.
      json_build_object('name', 'paywall_initiated', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM analytics_event
        WHERE event_type = 'paywall_initiated'
          AND event_time >= since_ts AND event_time < until_ts
      )),
      -- SERVER-SIDE TRUTH: stamped once Stripe accepts the session, so this
      -- counts every reader we actually sent to Stripe, consent or not.
      json_build_object('name', 'begin_checkout', 'count', (
        SELECT COUNT(DISTINCT survey_submission_id)::int FROM report_price_quote
        WHERE checkout_started_at >= since_ts AND checkout_started_at < until_ts
      )),
      json_build_object('name', 'purchased', 'count', (
        SELECT COUNT(*)::int FROM payment
        WHERE status = 'succeeded'
          AND is_test = false
          AND created_date_time >= since_ts AND created_date_time < until_ts
      ))
    )
  ) INTO result;
  RETURN result;
END;
$function$;
