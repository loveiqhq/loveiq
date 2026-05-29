-- Phase 2 — Perfecting the Funnel (2026-05-29).
--
-- Adds 5 new RPCs for the chart-dominant funnel digest:
--   1. get_funnel_sparklines_v3    — superset of v2 + 4 new fixed-key buckets
--                                    (pricing, ux, payment_health, invite)
--   2. get_channel_sparklines      — per-source per-stage counts (dynamic keys)
--   3. get_archetype_sparklines    — per-archetype per-stage counts (dynamic keys)
--   4. get_velocity_percentiles    — p50/p75/p90 paywall→purchase hours per day
--   5. get_question_abandonment_top_n — top-N q_id by abandon count over window
--
-- Conventions (match Phase 1 RPCs in 20260527130000_strategy_funnel_rpcs.sql
-- and 20260529120000_funnel_v2_longitudinal.sql):
--   * SECURITY DEFINER + GRANT EXECUTE TO service_role
--   * Half-open [since_ts, until_ts) windows
--   * COALESCE on aggregates so JSON is always shaped, never NULL
--   * Read-only (SELECT only) — never throw on empty windows
--
-- Payment join chain (no FK from payment directly to survey_submission):
--   payment.personal_report_id → personal_report.id
--                              → personal_report.survey_submission_id
--                              → survey_submission.id

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. get_funnel_sparklines_v3 — supersets v2
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_funnel_sparklines_v3(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
  since_day DATE := since_ts::date;
  until_day DATE := until_ts::date;
BEGIN
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(since_day, until_day - INTERVAL '1 day', INTERVAL '1 day') AS d
  ),
  -- ---- v2 carry-over buckets (unchanged from migration 20260529120000) ----
  intro AS (
    SELECT day, event_type, COUNT(DISTINCT visitor_id)::int AS n
    FROM funnel_event
    WHERE event_type IN ('intro_slide_1', 'intro_slide_2', 'intro_slide_3', 'intro_slide_4')
      AND day >= since_day AND day < until_day
    GROUP BY day, event_type
  ),
  intro_pivot AS (
    SELECT day,
           COALESCE(SUM(n) FILTER (WHERE event_type = 'intro_slide_1'), 0)::int AS s1,
           COALESCE(SUM(n) FILTER (WHERE event_type = 'intro_slide_2'), 0)::int AS s2,
           COALESCE(SUM(n) FILTER (WHERE event_type = 'intro_slide_3'), 0)::int AS s3,
           COALESCE(SUM(n) FILTER (WHERE event_type = 'intro_slide_4'), 0)::int AS s4
    FROM intro GROUP BY day
  ),
  survey_chapter AS (
    SELECT event_time::date AS day,
           LEFT(q_id, 2) AS chapter,
           COUNT(DISTINCT session_id)::int AS n
    FROM survey_behavior_event
    WHERE event_time >= since_ts AND event_time < until_ts
      AND answered = true
      AND q_id ~ '^[0-9]{5}$'
    GROUP BY event_time::date, LEFT(q_id, 2)
  ),
  survey_pivot AS (
    SELECT day, json_object_agg(chapter, n) AS chapters
    FROM survey_chapter GROUP BY day
  ),
  wizard AS (
    SELECT event_time::date AS day,
           (metadata->>'to_slide')::int AS to_slide,
           COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'wizard_slide_advanced'
      AND event_time >= since_ts AND event_time < until_ts
      AND survey_submission_id IS NOT NULL
      AND metadata ? 'to_slide'
      AND metadata->>'to_slide' ~ '^[0-9]{1,2}$'
    GROUP BY event_time::date, (metadata->>'to_slide')::int
  ),
  wizard_pivot AS (
    SELECT day,
           COALESCE(SUM(n) FILTER (WHERE to_slide = 1), 0)::int AS s1,
           COALESCE(SUM(n) FILTER (WHERE to_slide = 2), 0)::int AS s2,
           COALESCE(SUM(n) FILTER (WHERE to_slide = 3), 0)::int AS s3,
           COALESCE(SUM(n) FILTER (WHERE to_slide = 4), 0)::int AS s4,
           COALESCE(SUM(n) FILTER (WHERE to_slide = 5), 0)::int AS s5,
           COALESCE(SUM(n) FILTER (WHERE to_slide = 6), 0)::int AS s6
    FROM wizard GROUP BY day
  ),
  rv AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'report_viewed'
      AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  e5 AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'report_engagement_5min'
      AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  pw AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'paywall_initiated'
      AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  bc AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'begin_checkout'
      AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  purchases AS (
    SELECT created_date_time::date AS day, COUNT(*)::int AS n
    FROM payment
    WHERE status = 'succeeded'
      AND created_date_time >= since_ts AND created_date_time < until_ts
    GROUP BY created_date_time::date
  ),
  -- ---- NEW v3 buckets ----
  -- pricing.price_shown — fired once per (plan, cluster) when the modal paints.
  ps AS (
    SELECT event_time::date AS day, COUNT(DISTINCT survey_submission_id)::int AS n
    FROM analytics_event
    WHERE event_type = 'price_shown'
      AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  -- ux signals
  rc AS (
    SELECT event_time::date AS day, COUNT(*)::int AS n
    FROM analytics_event
    WHERE event_type = 'rage_click'
      AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  sd50 AS (
    SELECT event_time::date AS day, COUNT(*)::int AS n
    FROM analytics_event
    WHERE event_type = 'scroll_depth_50'
      AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  sd100 AS (
    SELECT event_time::date AS day, COUNT(*)::int AS n
    FROM analytics_event
    WHERE event_type = 'scroll_depth_100'
      AND event_time >= since_ts AND event_time < until_ts
    GROUP BY event_time::date
  ),
  -- payment health
  refunds AS (
    SELECT refunded_at::date AS day, COUNT(*)::int AS n
    FROM payment
    WHERE status = 'refunded'
      AND refunded_at IS NOT NULL
      AND refunded_at >= since_ts AND refunded_at < until_ts
    GROUP BY refunded_at::date
  ),
  disputes AS (
    -- Disputed payments don't have a separate dispute_at column; use
    -- updated_date_time as a reasonable proxy for "dispute landed today".
    SELECT updated_date_time::date AS day, COUNT(*)::int AS n
    FROM payment
    WHERE status = 'disputed'
      AND updated_date_time >= since_ts AND updated_date_time < until_ts
    GROUP BY updated_date_time::date
  ),
  failed AS (
    SELECT created_date_time::date AS day, COUNT(*)::int AS n
    FROM payment
    WHERE status = 'failed'
      AND created_date_time >= since_ts AND created_date_time < until_ts
    GROUP BY created_date_time::date
  ),
  promos AS (
    -- Counted at purchase moment so a refunded purchase still counted its
    -- redemption — the strategy lead wants to see promo-code reach, not
    -- net-of-refunds.
    SELECT created_date_time::date AS day, COUNT(*)::int AS n
    FROM payment
    WHERE status = 'succeeded'
      AND metadata ? 'promotionCode'
      AND metadata->>'promotionCode' <> ''
      AND created_date_time >= since_ts AND created_date_time < until_ts
    GROUP BY created_date_time::date
  ),
  -- viral loop (email-match attribution)
  invite_sent AS (
    SELECT created_at::date AS day, COUNT(*)::int AS n
    FROM invite_event
    WHERE created_at >= since_ts AND created_at < until_ts
    GROUP BY created_at::date
  ),
  -- partner_completed: matches recipient_email → app_user.email → survey_submission
  -- where the submission happened AFTER the invite. Bucketed on the INVITE day
  -- so the funnel column reads "of invites sent today, how many led to a
  -- partner completion by the end of the window".
  invite_partner_completed AS (
    SELECT ie.created_at::date AS day, COUNT(*)::int AS n
    FROM invite_event ie
    JOIN app_user au ON LOWER(au.email) = LOWER(ie.recipient_email)
    JOIN survey_submission ss ON ss.user_id = au.id
      AND ss.status = 'completed'
      AND ss.created_date_time > ie.created_at
      AND ss.created_date_time < until_ts
    WHERE ie.created_at >= since_ts AND ie.created_at < until_ts
      AND ie.recipient_email IS NOT NULL
      AND ie.recipient_email <> ''
    GROUP BY ie.created_at::date
  ),
  invite_partner_purchased AS (
    SELECT ie.created_at::date AS day, COUNT(*)::int AS n
    FROM invite_event ie
    JOIN app_user au ON LOWER(au.email) = LOWER(ie.recipient_email)
    JOIN survey_submission ss ON ss.user_id = au.id
      AND ss.created_date_time > ie.created_at
    JOIN personal_report pr ON pr.survey_submission_id = ss.id
    JOIN payment p ON p.personal_report_id = pr.id
      AND p.status = 'succeeded'
      AND p.created_date_time < until_ts
    WHERE ie.created_at >= since_ts AND ie.created_at < until_ts
      AND ie.recipient_email IS NOT NULL
      AND ie.recipient_email <> ''
    GROUP BY ie.created_at::date
  )
  SELECT json_build_object(
    'days', COALESCE((
      SELECT json_agg(json_build_object(
        'day', to_char(days.day, 'YYYY-MM-DD'),
        'intro', json_build_object(
          's1', COALESCE(intro_pivot.s1, 0),
          's2', COALESCE(intro_pivot.s2, 0),
          's3', COALESCE(intro_pivot.s3, 0),
          's4', COALESCE(intro_pivot.s4, 0)
        ),
        'survey', COALESCE(survey_pivot.chapters, '{}'::json),
        'wizard', json_build_object(
          's1', COALESCE(wizard_pivot.s1, 0),
          's2', COALESCE(wizard_pivot.s2, 0),
          's3', COALESCE(wizard_pivot.s3, 0),
          's4', COALESCE(wizard_pivot.s4, 0),
          's5', COALESCE(wizard_pivot.s5, 0),
          's6', COALESCE(wizard_pivot.s6, 0),
          'report_viewed', COALESCE(rv.n, 0)
        ),
        'monetize', json_build_object(
          'report_viewed', COALESCE(rv.n, 0),
          'engagement_5min', COALESCE(e5.n, 0),
          'paywall_init', COALESCE(pw.n, 0),
          'begin_checkout', COALESCE(bc.n, 0),
          'purchased', COALESCE(purchases.n, 0)
        ),
        'pricing', json_build_object(
          'paywall_initiated', COALESCE(pw.n, 0),
          'price_shown', COALESCE(ps.n, 0),
          'begin_checkout', COALESCE(bc.n, 0),
          'purchased', COALESCE(purchases.n, 0)
        ),
        'ux', json_build_object(
          'rage_click', COALESCE(rc.n, 0),
          'scroll_depth_50', COALESCE(sd50.n, 0),
          'scroll_depth_100', COALESCE(sd100.n, 0)
        ),
        'payment_health', json_build_object(
          'refunds', COALESCE(refunds.n, 0),
          'disputes', COALESCE(disputes.n, 0),
          'failed', COALESCE(failed.n, 0),
          'promo_redemptions', COALESCE(promos.n, 0)
        ),
        'invite', json_build_object(
          'sent', COALESCE(invite_sent.n, 0),
          'partner_completed', COALESCE(invite_partner_completed.n, 0),
          'partner_purchased', COALESCE(invite_partner_purchased.n, 0)
        )
      ) ORDER BY days.day)
      FROM days
      LEFT JOIN intro_pivot   ON intro_pivot.day   = days.day
      LEFT JOIN survey_pivot  ON survey_pivot.day  = days.day
      LEFT JOIN wizard_pivot  ON wizard_pivot.day  = days.day
      LEFT JOIN rv            ON rv.day            = days.day
      LEFT JOIN e5            ON e5.day            = days.day
      LEFT JOIN pw            ON pw.day            = days.day
      LEFT JOIN bc            ON bc.day            = days.day
      LEFT JOIN purchases     ON purchases.day     = days.day
      LEFT JOIN ps            ON ps.day            = days.day
      LEFT JOIN rc            ON rc.day            = days.day
      LEFT JOIN sd50          ON sd50.day          = days.day
      LEFT JOIN sd100         ON sd100.day         = days.day
      LEFT JOIN refunds       ON refunds.day       = days.day
      LEFT JOIN disputes      ON disputes.day      = days.day
      LEFT JOIN failed        ON failed.day        = days.day
      LEFT JOIN promos        ON promos.day        = days.day
      LEFT JOIN invite_sent              ON invite_sent.day              = days.day
      LEFT JOIN invite_partner_completed ON invite_partner_completed.day = days.day
      LEFT JOIN invite_partner_purchased ON invite_partner_purchased.day = days.day
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_funnel_sparklines_v3(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. get_channel_sparklines — per-source per-day funnel counts
-- ═══════════════════════════════════════════════════════════════════════════
-- Channel = parsed utm_source from survey_submission.utm_tracker. We extract
-- the source via a regex on the JSON-ish text (no try-cast in plpgsql without
-- DO-block), defaulting to 'direct' when source is missing or unparseable.
-- Returns ALL sources; Node side trims to top-N by total volume.

CREATE OR REPLACE FUNCTION get_channel_sparklines(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
  since_day DATE := since_ts::date;
  until_day DATE := until_ts::date;
BEGIN
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(since_day, until_day - INTERVAL '1 day', INTERVAL '1 day') AS d
  ),
  -- Submissions in window with their parsed utm_source.
  subs AS (
    SELECT ss.id,
           ss.created_date_time::date AS day,
           ss.status,
           COALESCE(
             NULLIF(LOWER(TRIM((ss.utm_tracker::jsonb)->>'utm_source')), ''),
             'direct'
           ) AS source
    FROM survey_submission ss
    WHERE ss.created_date_time >= since_ts
      AND ss.created_date_time < until_ts
      AND ss.utm_tracker IS NOT NULL
      AND ss.utm_tracker <> ''
      -- Defensive: skip malformed utm_tracker that's not valid JSON
      AND ss.utm_tracker LIKE '{%}'
  ),
  -- For "starts" we use survey_partial_save since that's the truer top-of-funnel
  -- start signal (vs survey_submission which only contains COMPLETED). Match the
  -- source via the same JSON path on its utm_tracker column.
  starts AS (
    SELECT sps.started_at::date AS day,
           COALESCE(
             NULLIF(LOWER(TRIM((sps.utm_tracker::jsonb)->>'utm_source')), ''),
             'direct'
           ) AS source,
           COUNT(DISTINCT sps.session_id)::int AS n
    FROM survey_partial_save sps
    WHERE sps.started_at >= since_ts AND sps.started_at < until_ts
      AND sps.utm_tracker IS NOT NULL
      AND sps.utm_tracker <> ''
      AND sps.utm_tracker LIKE '{%}'
    GROUP BY sps.started_at::date,
             COALESCE(
               NULLIF(LOWER(TRIM((sps.utm_tracker::jsonb)->>'utm_source')), ''),
               'direct'
             )
  ),
  completions AS (
    SELECT day, source, COUNT(*)::int AS n
    FROM subs
    WHERE status = 'completed'
    GROUP BY day, source
  ),
  purch AS (
    SELECT p.created_date_time::date AS day,
           COALESCE(
             NULLIF(LOWER(TRIM((ss.utm_tracker::jsonb)->>'utm_source')), ''),
             'direct'
           ) AS source,
           COUNT(*)::int AS n
    FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
    JOIN survey_submission ss ON ss.id = pr.survey_submission_id
    WHERE p.status = 'succeeded'
      AND p.created_date_time >= since_ts AND p.created_date_time < until_ts
      AND ss.utm_tracker IS NOT NULL
      AND ss.utm_tracker <> ''
      AND ss.utm_tracker LIKE '{%}'
    GROUP BY p.created_date_time::date,
             COALESCE(
               NULLIF(LOWER(TRIM((ss.utm_tracker::jsonb)->>'utm_source')), ''),
               'direct'
             )
  ),
  per_source_day AS (
    SELECT day, source, SUM(starts_n) AS starts, SUM(comp_n) AS completions, SUM(purch_n) AS purchases
    FROM (
      SELECT day, source, n AS starts_n, 0 AS comp_n, 0 AS purch_n FROM starts
      UNION ALL
      SELECT day, source, 0, n, 0 FROM completions
      UNION ALL
      SELECT day, source, 0, 0, n FROM purch
    ) u
    GROUP BY day, source
  )
  SELECT json_build_object(
    'days', COALESCE((
      SELECT json_agg(json_build_object(
        'day', to_char(days.day, 'YYYY-MM-DD'),
        'sources', COALESCE(
          (
            SELECT json_object_agg(
              source,
              json_build_object(
                'starts', starts,
                'completions', completions,
                'purchases', purchases
              )
            )
            FROM per_source_day psd
            WHERE psd.day = days.day
          ),
          '{}'::json
        )
      ) ORDER BY days.day)
      FROM days
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_channel_sparklines(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. get_archetype_sparklines — per-archetype per-day completion + purchase
-- ═══════════════════════════════════════════════════════════════════════════
-- Archetype = scoring_result.v5_primary_archetype (prefer V5, fall back to V4
-- primary_archetype). Returns ALL archetypes with non-zero traffic; Node side
-- trims to top-N by total volume.

CREATE OR REPLACE FUNCTION get_archetype_sparklines(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
  since_day DATE := since_ts::date;
  until_day DATE := until_ts::date;
BEGIN
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(since_day, until_day - INTERVAL '1 day', INTERVAL '1 day') AS d
  ),
  -- One row per (submission, day, archetype) for the window.
  scored AS (
    SELECT ss.id AS submission_id,
           ss.created_date_time::date AS day,
           ss.status,
           COALESCE(sr.v5_primary_archetype, sr.primary_archetype) AS archetype
    FROM survey_submission ss
    JOIN scoring_result sr ON sr.survey_submission_id = ss.id
    WHERE ss.created_date_time >= since_ts
      AND ss.created_date_time < until_ts
      AND COALESCE(sr.v5_primary_archetype, sr.primary_archetype) IS NOT NULL
  ),
  comps AS (
    SELECT day, archetype, COUNT(*)::int AS n
    FROM scored
    WHERE status = 'completed'
    GROUP BY day, archetype
  ),
  purch AS (
    SELECT p.created_date_time::date AS day,
           COALESCE(sr.v5_primary_archetype, sr.primary_archetype) AS archetype,
           COUNT(*)::int AS n
    FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
    JOIN scoring_result sr ON sr.survey_submission_id = pr.survey_submission_id
    WHERE p.status = 'succeeded'
      AND p.created_date_time >= since_ts AND p.created_date_time < until_ts
      AND COALESCE(sr.v5_primary_archetype, sr.primary_archetype) IS NOT NULL
    GROUP BY p.created_date_time::date,
             COALESCE(sr.v5_primary_archetype, sr.primary_archetype)
  ),
  per_arch_day AS (
    SELECT day, archetype, SUM(comp_n) AS completions, SUM(purch_n) AS purchases
    FROM (
      SELECT day, archetype, n AS comp_n, 0 AS purch_n FROM comps
      UNION ALL
      SELECT day, archetype, 0, n FROM purch
    ) u
    GROUP BY day, archetype
  )
  SELECT json_build_object(
    'days', COALESCE((
      SELECT json_agg(json_build_object(
        'day', to_char(days.day, 'YYYY-MM-DD'),
        'archetypes', COALESCE(
          (
            SELECT json_object_agg(
              archetype,
              json_build_object('completions', completions, 'purchases', purchases)
            )
            FROM per_arch_day pad
            WHERE pad.day = days.day
          ),
          '{}'::json
        )
      ) ORDER BY days.day)
      FROM days
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_archetype_sparklines(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. get_velocity_percentiles — p50/p75/p90 paywall→purchase hours per day
-- ═══════════════════════════════════════════════════════════════════════════
-- Same gap-set as the existing fetchMedianTimeToPurchaseHours: from the FIRST
-- paywall_initiated event for a submission to the matching succeeded payment.
-- Bucketed on the PURCHASE day (decision lands then). When a day has fewer
-- than MIN_SAMPLE purchases the percentiles are unstable — returned anyway,
-- Node side decides whether to display.

CREATE OR REPLACE FUNCTION get_velocity_percentiles(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
  since_day DATE := since_ts::date;
  until_day DATE := until_ts::date;
BEGIN
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(since_day, until_day - INTERVAL '1 day', INTERVAL '1 day') AS d
  ),
  -- First paywall_initiated per submission (across all time, not just window —
  -- a payment today may follow a paywall_initiated days ago).
  first_paywall AS (
    SELECT survey_submission_id, MIN(event_time) AS first_at
    FROM analytics_event
    WHERE event_type = 'paywall_initiated'
      AND survey_submission_id IS NOT NULL
    GROUP BY survey_submission_id
  ),
  gaps AS (
    SELECT p.created_date_time::date AS day,
           EXTRACT(EPOCH FROM (p.created_date_time - fp.first_at)) / 3600.0 AS hours
    FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
    JOIN first_paywall fp ON fp.survey_submission_id = pr.survey_submission_id
    WHERE p.status = 'succeeded'
      AND p.created_date_time >= since_ts AND p.created_date_time < until_ts
      AND p.created_date_time > fp.first_at  -- only positive gaps
  ),
  per_day AS (
    SELECT day,
           COUNT(*)::int AS n,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY hours)::numeric(10,1) AS p50,
           percentile_cont(0.75) WITHIN GROUP (ORDER BY hours)::numeric(10,1) AS p75,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY hours)::numeric(10,1) AS p90
    FROM gaps
    GROUP BY day
  )
  SELECT json_build_object(
    'days', COALESCE((
      SELECT json_agg(json_build_object(
        'day', to_char(days.day, 'YYYY-MM-DD'),
        'n',   COALESCE(per_day.n, 0),
        'p50', COALESCE(per_day.p50, 0),
        'p75', COALESCE(per_day.p75, 0),
        'p90', COALESCE(per_day.p90, 0)
      ) ORDER BY days.day)
      FROM days
      LEFT JOIN per_day ON per_day.day = days.day
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_velocity_percentiles(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. get_question_abandonment_top_n
-- ═══════════════════════════════════════════════════════════════════════════
-- Top-N q_id by abandon count in the window. Weekly only — needs ~14d of data
-- to be useful. Returns one daily array per top-N question so the Node side
-- can chart "top-10 questions abandoned over time".

CREATE OR REPLACE FUNCTION get_question_abandonment_top_n(
  since_ts TIMESTAMPTZ,
  until_ts TIMESTAMPTZ,
  top_n INT DEFAULT 10
)
RETURNS JSON
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
  since_day DATE := since_ts::date;
  until_day DATE := until_ts::date;
BEGIN
  WITH days AS (
    SELECT d::date AS day
    FROM generate_series(since_day, until_day - INTERVAL '1 day', INTERVAL '1 day') AS d
  ),
  abandons AS (
    SELECT q_id, event_time::date AS day, COUNT(*)::int AS n
    FROM survey_behavior_event
    WHERE direction = 'abandon'
      AND event_time >= since_ts AND event_time < until_ts
      AND q_id IS NOT NULL
      AND q_id ~ '^[0-9]{5}$'
    GROUP BY q_id, event_time::date
  ),
  totals AS (
    SELECT q_id, SUM(n)::int AS total
    FROM abandons
    GROUP BY q_id
    ORDER BY total DESC
    LIMIT top_n
  )
  SELECT json_build_object(
    'top_questions', COALESCE((
      SELECT json_agg(json_build_object(
        'q_id', t.q_id,
        'total', t.total,
        'days', (
          SELECT json_agg(json_build_object(
            'day', to_char(days.day, 'YYYY-MM-DD'),
            'n', COALESCE(a.n, 0)
          ) ORDER BY days.day)
          FROM days
          LEFT JOIN abandons a ON a.day = days.day AND a.q_id = t.q_id
        )
      ) ORDER BY t.total DESC)
      FROM totals t
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_question_abandonment_top_n(TIMESTAMPTZ, TIMESTAMPTZ, INT) TO service_role;
