/**
 * The Traffic page's fields (Assessment A · Traffic): what each figure means, how the builder
 * (features/admin/server/ap/traffic.ts) counts it, and a query that reproduces it for all
 * traffic. Every query was run read-only for 21 Sep – 20 Oct 2026 and matched the page's own
 * figure at "Last 30 days" (the checks are recorded with the change that wrote them).
 */
import { inHogql, OWN_HOST } from "@features/admin/server/ap/referrers";

import type { FieldRegistry, FieldTable } from "./types";

// ---------------------------------------------------------------------------------------------
// The queries' shared parts. :from and :to are the range's first and last Berlin days.

const TEST_SOURCES = "('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')";

const FINISHERS = `finishers AS (
  -- Finished surveys of the range (Berlin days); the team's own (ap_team_user) and our test runs out.
  SELECT s.id, s.user_id, s.session_id, s.created_date_time, t.j
    FROM survey_submission s,
         LATERAL (SELECT CASE WHEN pg_input_is_valid(s.utm_tracker, 'jsonb')
                              THEN s.utm_tracker::jsonb END AS j) t
   WHERE s.status = 'completed'
     AND s.created_date_time >= :from::timestamp AT TIME ZONE 'Europe/Berlin'
     AND s.created_date_time < (:to::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin'
     AND NOT EXISTS (SELECT 1 FROM ap_team_user t WHERE t.id = s.user_id)
     AND lower(trim(coalesce(t.j->>'utm_source', ''))) NOT IN ${TEST_SOURCES}
     AND lower(trim(coalesce(t.j->>'utm_medium', ''))) <> 'probe'
)`;

const SALES = `sales AS (
  -- Their reports' real sales so far: paid, not a test, over €0.
  SELECT f.id AS sid, p.amount, p.metadata->>'plan' AS plan
    FROM finishers f
    JOIN personal_report pr ON pr.survey_submission_id = f.id
    JOIN payment p ON p.personal_report_id = pr.id
   WHERE p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
)`;

const VISITS = `visits AS (
  -- The visit log: one row per visitor and day, written by our server; our probes out.
  SELECT count(*) AS n
    FROM funnel_event
   WHERE event_type = 'unique_visitor' AND coalesce(landing_variant, '') <> 'pay_to_start' AND day BETWEEN :from AND :to
     AND lower(trim(coalesce(utm_source, ''))) NOT IN ${TEST_SOURCES}
)`;

const ADS = `ads AS (
  -- Google Ads' cost, clicks and impressions per day, as Google Analytics imports them
  -- (the company brain's daily copy, refreshed every 15 minutes).
  SELECT sum((meta->>'ad_cost')::numeric) AS spend,
         sum((meta->>'ad_clicks')::numeric) AS clicks,
         sum((meta->>'ad_impressions')::numeric) AS impressions
    FROM brain_chunk
   WHERE source = 'ga4' AND meta->>'grain' = 'day' AND (meta->>'day')::date BETWEEN :from AND :to
)`;

const STARTS = `staff AS (SELECT id FROM ap_team_user),
staff_ips AS (
  -- The networks the team's own surveys came from: an unfinished run from one is the team testing.
  SELECT e.client_ip FROM survey_behavior_event e
    JOIN survey_submission s ON s.session_id = e.session_id
   WHERE s.user_id IN (SELECT id FROM staff) AND e.client_ip IS NOT NULL
  UNION
  SELECT d.client_ip FROM survey_partial_save d
    JOIN survey_submission s ON s.session_id = d.session_id
   WHERE s.user_id IN (SELECT id FROM staff) AND d.client_ip IS NOT NULL
),
signs AS (
  -- Every sign of a survey run (one browser session): a step, a draft, a submission.
  SELECT e.session_id, e.created_at AS at, (e.answered IS TRUE OR e.direction = 'complete') AS answered,
         false AS finished, NULL::bigint AS user_id, e.client_ip, NULL::text AS tracker,
         NULL::timestamptz AS saved, e.q_id = '00000' AS email_seen
    FROM survey_behavior_event e
  UNION ALL
  SELECT d.session_id, d.started_at, d.current_index >= 1, false, NULL, d.client_ip, d.utm_tracker,
         d.saved_at, jsonb_typeof(d.answers) = 'object' AND d.answers ? '00000'
    FROM survey_partial_save d
  UNION ALL
  SELECT s.session_id, s.start_date_time, s.status = 'completed', s.status = 'completed', s.user_id,
         NULL, s.utm_tracker, 'infinity', false
    FROM survey_submission s
),
runs AS (
  SELECT session_id, min(at) AS started_at, bool_or(answered) AS answered,
         bool_or(finished) AS finished, bool_or(user_id IN (SELECT id FROM staff)) AS staff_user,
         -- It reached the email question (00000): a step on it, an email answer, or it finished.
         coalesce(bool_or(email_seen), false) OR bool_or(finished) AS email_reached,
         bool_or(client_ip IN (SELECT client_ip FROM staff_ips)) AS staff_ip,
         -- The submission's link tags, else the latest draft's.
         (array_agg(tracker ORDER BY saved DESC NULLS LAST) FILTER (WHERE tracker IS NOT NULL))[1] AS tracker
    FROM signs
   WHERE session_id IN (SELECT session_id FROM signs
                         WHERE at >= :from::timestamp AT TIME ZONE 'Europe/Berlin'
                           AND at < (:to::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin')
   GROUP BY session_id
),
starts AS (
  -- A start: a run that answered a question (or finished), begun in the range.
  SELECT * FROM runs
   WHERE started_at >= :from::timestamp AT TIME ZONE 'Europe/Berlin'
     AND started_at < (:to::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin'
     AND answered AND NOT coalesce(staff_user, false)
     AND (finished OR NOT coalesce(staff_ip, false))
     AND NOT coalesce(CASE WHEN pg_input_is_valid(tracker, 'jsonb') THEN
           lower(trim(coalesce(tracker::jsonb->>'utm_source', ''))) IN ${TEST_SOURCES}
           OR lower(trim(coalesce(tracker::jsonb->>'utm_medium', ''))) = 'probe' END, false)
)`;

/** Contribution at the page's starting assumptions; needs FINISHERS, SALES and ADS. */
const CONTRIB = `contrib AS (
  -- Revenue less VAT (0%), payment fees (2.9% + €0.25 each), each finished survey's report
  -- (€0.05) and the Google Ads spend: the page's starting assumptions.
  SELECT r.revenue, r.sales, c.n AS finished_surveys, round(a.spend, 2) AS ad_spend,
         round(r.revenue / (1 + 0 / 100.0)
               - (r.revenue * 2.9 / 100 + r.sales * 0.25)
               - c.n * 0.05
               - a.spend, 2) AS contribution
    FROM (SELECT coalesce(sum(amount), 0) AS revenue, count(*) AS sales FROM sales) r,
         (SELECT count(*) AS n FROM finishers) c, ads a
)`;

const REV = `(SELECT coalesce(sum(amount), 0) AS revenue, count(*) AS sales,
         count(DISTINCT sid) AS buyers FROM sales) r`;

const sql = (ctes: string[], select: string) => ({
  lang: "SQL" as const,
  text: `WITH ${ctes.join(",\n")}\n${select}`,
});

// ---------------------------------------------------------------------------------------------
// The tables, as the Data sources catalog lists them, and what each figure takes from them.

const T = {
  subs: (columns = "status, created_date_time, user_id, utm_tracker"): FieldTable => ({
    source: "production",
    table: "survey_submission",
    columns,
    filters:
      "Source: the link tags the finished survey kept (utm_tracker). Device: the price quote's, else the survey steps'. Country tier: the price quote's. New or returning: PostHog's visit (posthog_session_id). Funnel: all are the free survey's.",
    watch:
      "The team's own surveys (an @loveiq.org account, or one that used the team's test code) and our test runs are left out. Sources are recorded from 19 Jul 2026.",
  }),
  pay: (columns = "status, amount, is_test, metadata.plan, personal_report_id"): FieldTable => ({
    source: "production",
    table: "payment",
    columns,
    filters: "Through the finisher it belongs to (personal_report → survey_submission).",
    watch: "Real sales only: status succeeded, not a test, over €0. Free unlocks are left out.",
  }),
  visits: (): FieldTable => ({
    source: "production",
    table: "funnel_event",
    columns:
      "event_type = unique_visitor, day, utm_source, landing_variant (pay to start's pages are left out: its own page counts them)",
    filters:
      "Source: Google Ads only (every Google Ads link tags utm_source; an untagged visit could be any other). Device, country tier and new or returning: none, so the figure is blank.",
    watch:
      "One row per browser per day, written by our server for everyone (cookie banner or not) from 15 Jun 2026. Our probes are left out.",
  }),
  ads: (columns = "date, cost_eur, clicks, impressions"): FieldTable => ({
    source: "ads",
    table: "campaign_daily",
    columns,
    filters:
      "Source: Google Ads' own (another source has no ad spend). Device, country tier or new or returning: blank, except where Google Ads splits it itself (device and country tier rows).",
    watch:
      "The page adds up each day's Google Ads cost as Google Analytics imports it (the brain's daily copy, the same days campaign_daily lists): its campaigns add up to the same euros, give or take a cent of rounding. Meta's spend isn't read.",
  }),
  starts: (): FieldTable => ({
    source: "production",
    table: "survey_behavior_event",
    columns: "session_id, created_at, answered, direction, client_ip",
    filters:
      "Source: the draft's or the submission's link tags (an unfinished start keeps them only while its draft does, 30 days). Device: the steps' device (from 13 Oct 2026). Country tier and new or returning: none, so the figure is blank.",
    watch:
      "With survey_partial_save (the drafts: started_at, current_index, utm_tracker) and survey_submission. Complete from 18 Sep 2026; within the last 30 days the drafts hold the rest.",
  }),
  sessions: (): FieldTable => ({
    source: "production",
    table: "report_session",
    columns: "personal_report_id, started_at, ended_at, user_agent, user_id",
    filters: "Through the finisher whose report it is.",
    watch:
      "Bots and automated browsers (Google's AdsBot opened many report links) and the team's own sessions are left out.",
  }),
  posthog: (columns: string): FieldTable => ({
    source: "posthog",
    table: "events",
    columns,
    filters:
      "None: these splits are of all traffic, so a source, device, tier or visitor filter leaves them blank.",
    watch:
      "PostHog records only part of the visits (nearly every Google Ads one, far fewer of the rest), from 23 Aug 2026. Its first page view of each visit is read; the team's own people are left out.",
  }),
  answers: (columns: string): FieldTable => ({
    source: "production",
    table: "survey_submission_answer",
    columns,
    filters:
      "Through the finished survey the answer belongs to (its source, device and tier as on survey_submission).",
  }),
};

// ---------------------------------------------------------------------------------------------
// PostHog: the first page view of each live-site visit in the range, as the page reads it.

const FIRST_VIEWS = `SELECT $session_id AS sid, argMin(person_id, timestamp) AS pid, min(timestamp) AS first_ts,
         argMin(properties.$current_url, timestamp) AS url,
         lower(coalesce(argMin(properties.$referring_domain, timestamp), '')) AS first_ref,
         argMin(properties.$device_type, timestamp) AS device,
         argMin(properties.$geoip_country_code, timestamp) AS country,
         argMin(properties.$timezone_offset, timestamp) AS tz_offset
    FROM events
   WHERE event = '$pageview' AND properties.$host = 'www.loveiq.org' AND $session_id != ''
     AND properties.$pathname NOT LIKE '/admin%' AND properties.$pathname NOT LIKE '/jarvis%'
     AND properties.$pathname != '/login'
     AND timestamp >= toDateTime(:from, 'Europe/Berlin')
     AND timestamp < toDateTime(:to, 'Europe/Berlin') + INTERVAL 1 DAY
     -- The team's own people: those seen in the visit of a team account's finished survey.
     AND person_id NOT IN (SELECT person_id FROM events WHERE $session_id IN :team_visits)
   GROUP BY sid
   -- A visit that landed on a pay-to-start page is that funnel's (its own page counts it).
  HAVING argMin(properties.$pathname, timestamp) NOT LIKE '/sexual-archetype%'`;

/** What classifySource reads of a visit: its tags, click ids and (untagged only) referrer. */
const TAGS = `lower(extract(url, '[?&]utm_source=([^&#]*)')) AS src,
           lower(extract(url, '[?&]utm_medium=([^&#]*)')) AS med,
           if(url LIKE '%gclid=%' OR url LIKE '%gbraid=%' OR url LIKE '%wbraid=%', 1, 0) AS ads,
           if(url LIKE '%fbclid=%', 1, 0) AS fb,
           -- The referring site counts only on an untagged visit; our own sites and PostHog's
           -- "$direct" are no referrer.
           if(src = '' AND med = '' AND ads = 0 AND fb = 0 AND first_ref != '$direct'
                AND NOT match(first_ref, '${inHogql(OWN_HOST)}'), first_ref, '') AS ref`;

const HOGQL_WINDOW = `-- The range's first and last Berlin days are written in; the team's own people are left out by
-- the PostHog visits of their finished surveys (survey_submission.posthog_session_id of
-- a team account).`;

const hogBy = (value: string, note: string, from = `(${FIRST_VIEWS})`) => ({
  lang: "HogQL" as const,
  text: `${HOGQL_WINDOW}
-- ${note}
SELECT src, med, ads, fb, ref, value, count() AS visits
  FROM (SELECT ${TAGS}, ${value} AS value
          FROM ${from})
 GROUP BY src, med, ads, fb, ref, value
 ORDER BY visits DESC
 LIMIT 3000`,
});

/** A finisher's own answer to a question (with the profile's, where given, standing in). */
const ANSWER = (qid: string, profile?: string) => `(SELECT max(ao.option_text)
           FROM survey_submission_answer a
           JOIN survey_question sq ON sq.id = a.survey_question_id AND sq.frontend_qid = '${qid}'
           JOIN answer_option ao ON ao.id = a.answer_option_id
          WHERE a.survey_submission_id = f.id)${profile ? `, ${profile}` : ""}`;

/** The finishers' shares by a group. */
const shares = (ctes: string[], expr: string, joins = "") =>
  sql(
    [FINISHERS, ...ctes],
    `SELECT grp, count(*) AS finishers, round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS share_pct
  FROM (SELECT ${expr} AS grp
          FROM finishers f${joins}) x
 GROUP BY grp ORDER BY finishers DESC`
  );

const PROFILE_JOIN = `
          LEFT JOIN app_user u ON u.id = f.user_id
          LEFT JOIN user_profile up ON up.id = u.user_profile_id`;

/** A finisher's device, as the device rows read it: their own price quotes', else the steps'. */
const DEVICE = `devices AS (
  SELECT f.id,
         -- A tablet the survey steps flagged, told apart in ranges from 17 Oct 2026, as the page.
         CASE WHEN :from::date >= DATE '2026-10-17'
                   AND EXISTS (SELECT 1 FROM survey_behavior_event e
                                WHERE e.session_id = f.session_id AND e.is_tablet)
              THEN 'Tablet' ELSE
         coalesce(
           (SELECT q.device_type FROM report_price_quote q
             WHERE q.survey_submission_id = f.id AND q.device_type IS NOT NULL
               -- Not a quote a reminder job made (no browser, so "Desktop": one plan alone,
               -- over an hour after the survey, never used).
               AND NOT (q.device_type = 'Desktop' AND q.created_date_time > f.created_date_time + interval '1 hour'
                        AND q.paywall_reached_at IS NULL AND q.checkout_started_at IS NULL
                        AND NOT EXISTS (SELECT 1 FROM report_price_quote o
                                         WHERE o.survey_submission_id = q.survey_submission_id AND o.id <> q.id
                                           AND o.created_date_time BETWEEN q.created_date_time - interval '5 minutes'
                                                                       AND q.created_date_time + interval '5 minutes'))
             ORDER BY q.created_date_time DESC LIMIT 1),
           (SELECT e.device_type FROM survey_behavior_event e
             WHERE e.session_id = f.session_id AND e.device_type IS NOT NULL
             ORDER BY e.created_at DESC LIMIT 1)) END AS device
    FROM finishers f
)`;

/** How a visit dimension's shares are made, for its card. */
const STRATIFIED =
  "Each group's share of all visitors: PostHog's split of each source's visits (sorted into sources by our own rules: a Google click id is Google Ads, no tag and no referring site is Direct, and so on) applied to that source's own visitors in the visit log, added up. PostHog sees nearly every Google Ads visit but few of the rest, so its own split of all its visits would read mostly as Google Ads'.";

const PEOPLE = `people AS (
  -- The finishers' people: each signed-in person once, a finisher without one on their own.
  SELECT DISTINCT coalesce(user_id, -id) AS who, user_id FROM finishers
),
lifetime AS (
  -- Every sale of their reports, all time: paid or later refunded, not a test, over €0.
  SELECT s.user_id, p.amount, (p.status = 'refunded' OR coalesce(p.refund_amount, 0) > 0) AS refunded
    FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
    JOIN survey_submission s ON s.id = pr.survey_submission_id
   WHERE p.status IN ('succeeded', 'refunded') AND NOT coalesce(p.is_test, false) AND p.amount > 0
     AND s.user_id IN (SELECT user_id FROM people)
)`;

const READING = `sess AS (
  SELECT f.id AS sid, rs.started_at, rs.ended_at
    FROM finishers f
    JOIN personal_report pr ON pr.survey_submission_id = f.id
    JOIN report_session rs ON rs.personal_report_id = pr.id
   WHERE NOT EXISTS (SELECT 1 FROM ap_team_user t WHERE t.id = rs.user_id)
     -- Bots and automated browsers are not readers.
     AND coalesce(rs.user_agent, '') !~* '(adsbot|headless|bot[/;) ]|crawler|spider|^curl/|^wget/|python-requests|go-http-client|okhttp|node-fetch|axios/)'
),
reading AS (
  -- Each reader's time: their sessions with a plausible end (under 4 hours), each up to 30 minutes.
  SELECT sid, sum(least(extract(epoch FROM ended_at - started_at), 1800)) AS seconds
    FROM sess
   WHERE ended_at > started_at AND ended_at - started_at < interval '4 hours'
   GROUP BY sid
)`;

const FULL_PLANS = "('full_report', 'all_reports', 'core')";

/** The Initial plan: the EUR 1.99 Core Archetype, counted from 23 Oct 2026 (pay to start). */
const PRE_RULE =
  "The Initial plan is the €1.99 Core Archetype, on sale from the evening of 22 Oct 2026 (counted from 23 Oct, its first whole day) on pay to start's €1.99 page (the report's own €1.99 gate is switched off): over a range starting earlier the pre-unlock columns are blank, never 0.";

const BLENDED =
  "Blended where every source's finishers are counted: the All row and the scorecard set Google Ads' spend against everyone's finishers, and under All sources so do the device and country-tier rows, so they read cheaper than Google Ads' own row, which sets its spend against its own finishers. Channels that pay for no ads read —.";

/** A chart point's first day: the day, week or month (:grain, by the range's length, as drawn). */
const WEEK = "date_trunc(:grain, DAY)::date";

/**
 * The running tests the page reads, each arm in its window: from the test's first whole day (or
 * the range's), to the range's end or yesterday.
 */
const EXP = `tests (test, arm, control, first_day) AS (VALUES
  ('Landing hero', 'white_card', true, DATE '2026-10-14'),
  ('Landing hero', 'white_video', false, DATE '2026-10-14'),
  ('Pricing 3.0', 'A3', true, DATE '2026-10-08'),
  ('Pricing 3.0', 'B3', false, DATE '2026-10-08'),
  ('Email question', 'control', true, DATE '2026-10-09'),
  ('Email question', 'anonymous', false, DATE '2026-10-09')
),
win AS (
  SELECT *, greatest(:from::date, first_day) AS from_day,
         least(:to::date, (now() AT TIME ZONE 'Europe/Berlin')::date - 1) AS to_day
    FROM tests
),
price_arm AS (
  -- The Pricing 3.0 arm each finisher was dealt: their first price quote's, before any re-sync.
  SELECT DISTINCT ON (q.survey_submission_id) q.survey_submission_id AS sid,
         coalesce(h.old_experiment_group, q.experiment_group) AS arm
    FROM report_price_quote q
    LEFT JOIN LATERAL (SELECT old_experiment_group FROM report_price_quote_arm_history
                        WHERE quote_id = q.id ORDER BY changed_at, id LIMIT 1) h ON true
   WHERE q.survey_submission_id IN (SELECT id FROM finishers)
     AND coalesce(h.old_experiment_group, q.experiment_group) IS NOT NULL
   ORDER BY q.survey_submission_id, q.created_date_time, q.id
),
arm_finishers AS (
  -- Each arm's finishers: the landing version and the email arm their link tags kept; the price
  -- arm of those who finished after Pricing 3.0 restarted (8 Oct 2026, 17:23).
  SELECT w.test, w.arm, f.id
    FROM win w
    JOIN finishers f ON (f.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN w.from_day AND w.to_day
    LEFT JOIN price_arm pa ON pa.sid = f.id
   WHERE CASE w.test
           WHEN 'Landing hero' THEN f.j->>'landing_variant' = w.arm
           WHEN 'Email question' THEN f.j->>'contact_question_arm' = w.arm
           ELSE pa.arm = w.arm AND f.created_date_time >= timestamptz '2026-10-08 15:23:00+00' END
     -- A survey bought before it was taken (pay to start): no arm decided its sale.
     AND NOT EXISTS (SELECT 1 FROM prepaid_report_access p2
                      WHERE p2.consumed_submission_id = f.id AND p2.offer IS NOT NULL
                        AND p2.paid_at IS NOT NULL AND p2.status IN ('succeeded', 'refunded'))
),
arms AS (
  SELECT w.test, w.arm, w.control,
         -- The landing versions' visits (the visit log records the version).
         (SELECT count(*) FROM funnel_event fe
           WHERE w.test = 'Landing hero' AND fe.event_type = 'unique_visitor' AND fe.landing_variant = w.arm
             AND fe.day BETWEEN w.from_day AND w.to_day
             AND lower(trim(coalesce(fe.utm_source, ''))) NOT IN ${TEST_SOURCES}) AS visitors,
         (SELECT count(*) FROM starts st
           WHERE (st.started_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN w.from_day AND w.to_day
             AND pg_input_is_valid(st.tracker, 'jsonb') AND st.tracker::jsonb->>'landing_variant' = w.arm) AS starts,
         (SELECT count(*) FROM starts st
           WHERE (st.started_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN w.from_day AND w.to_day
             AND pg_input_is_valid(st.tracker, 'jsonb') AND st.tracker::jsonb->>'contact_question_arm' = w.arm
             AND st.email_reached) AS reached_email,
         (SELECT count(*) FROM starts st
           WHERE (st.started_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN w.from_day AND w.to_day
             AND pg_input_is_valid(st.tracker, 'jsonb') AND st.tracker::jsonb->>'contact_question_arm' = w.arm
             AND st.email_reached AND st.finished) AS finished_after_email,
         (SELECT count(*) FROM arm_finishers a WHERE a.test = w.test AND a.arm = w.arm) AS submissions,
         (SELECT count(DISTINCT x.sid) FROM arm_finishers a JOIN sales x ON x.sid = a.id
           WHERE a.test = w.test AND a.arm = w.arm) AS payers,
         (SELECT coalesce(sum(x.amount), 0) FROM arm_finishers a JOIN sales x ON x.sid = a.id
           WHERE a.test = w.test AND a.arm = w.arm) AS revenue
    FROM win w
)`;

const EXP_TABLE = sql(
  [FINISHERS, SALES, STARTS, EXP],
  `SELECT test, arm, visitors, starts, round(starts::numeric / nullif(visitors, 0), 3) AS start_cvr,
       submissions, payers, round(payers::numeric / nullif(submissions, 0), 4) AS payment_cvr,
       round(revenue / nullif(submissions, 0), 2) AS revenue_per_submission,
       round(revenue / nullif(visitors, 0), 4) AS revenue_per_visitor, reached_email, finished_after_email
  FROM arms ORDER BY test, NOT control`
);

/**
 * Each test's arm B against its control on the test's primary metric: start CVR (landing),
 * payment CVR (pricing), finishing after the email question (email). Pooled two-proportion z;
 * the normal curve by Abramowitz and Stegun's formula, as the page works it out.
 */
const EXP_STATS = sql(
  [FINISHERS, SALES, STARTS, EXP],
  `, rates AS (
  SELECT test, control,
         CASE test WHEN 'Landing hero' THEN starts WHEN 'Pricing 3.0' THEN payers ELSE finished_after_email END AS k,
         CASE test WHEN 'Landing hero' THEN visitors WHEN 'Pricing 3.0' THEN submissions ELSE reached_email END AS n
    FROM arms
), ab AS (
  SELECT a.test, a.k AS ka, a.n AS na, b.k AS kb, b.n AS nb,
         (b.k::numeric / nullif(b.n, 0)) / nullif(a.k::numeric / nullif(a.n, 0), 0) - 1 AS lift,
         (b.k::numeric / nullif(b.n, 0) - a.k::numeric / nullif(a.n, 0))
           / nullif(sqrt(((a.k + b.k)::numeric / (a.n + b.n)) * (1 - (a.k + b.k)::numeric / (a.n + b.n))
                         * (1.0 / a.n + 1.0 / b.n)), 0) AS z
    FROM rates a JOIN rates b ON b.test = a.test AND a.control AND NOT b.control
), phi AS (
  -- Φ(x) = ½ (1 + erf(x / √2)), erf by Abramowitz and Stegun 7.1.26.
  SELECT *, 1 / (1 + 0.3275911 * abs(z) / sqrt(2)) AS t FROM ab
)
-- Blank ("Too few to call") under 50 people in both arms, or under 5 in any arm's yes or no.
SELECT test, ka, na, kb, nb, round(lift, 4) AS lift, round(z, 4) AS z,
       CASE WHEN na + nb < 50 OR least(ka, na - ka, kb, nb - kb) < 5 THEN NULL ELSE
       round((0.5 * (1 + sign(z) * (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-z * z / 2))))::numeric, 3) END AS chance_to_beat,
       CASE WHEN na + nb < 50 OR least(ka, na - ka, kb, nb - kb) < 5 THEN NULL ELSE
       round((1 - 2 * (1 - 0.5 * (1 + (1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-z * z / 2)))))::numeric, 3) END AS confidence
  FROM phi ORDER BY test`
);

const COHORT = `firsts AS (
  -- New users: people whose first finished survey ever is one of the range's.
  SELECT f.user_id, f.created_date_time AS first_at, f.j
    FROM finishers f
   WHERE f.user_id IS NOT NULL
     AND f.created_date_time = (SELECT min(s.created_date_time) FROM survey_submission s
                                 WHERE s.user_id = f.user_id AND s.status = 'completed')
),
cohort_pays AS (
  -- Every sale of their reports, all time (paid or later refunded; not a test; over €0).
  SELECT s.user_id, coalesce(p.payment_date_time, p.created_date_time) AS at, p.amount,
         (p.status = 'refunded' OR coalesce(p.refund_amount, 0) > 0) AS refunded
    FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
    JOIN survey_submission s ON s.id = pr.survey_submission_id
   WHERE p.status IN ('succeeded', 'refunded') AND NOT coalesce(p.is_test, false) AND p.amount > 0
     AND s.user_id IN (SELECT user_id FROM firsts)
)`;

/** Revenue per new user within N days of their first finished survey, of those N days on. */
const cohortDay = (days: number) =>
  sql(
    [FINISHERS, COHORT],
    `SELECT count(*) AS people_${days}_days_on,
       round(sum((SELECT coalesce(sum(c.amount), 0) FROM cohort_pays c
                   WHERE c.user_id = x.user_id AND NOT c.refunded
                     AND c.at <= x.first_at + interval '${days + 1} days'))
             / nullif(count(*), 0), 2) AS revenue_per_user
  FROM firsts x
 WHERE x.first_at + interval '${days + 1} days' <= now()`
  );

/** Google Ads finishers and buyers by the keyword their link passed (the keyword cards' rows). */
const KEYWORD_ROWS = sql(
  [FINISHERS, SALES],
  `-- Google Ads finishers by the campaign and keyword their link passed (the clicks: keyword_view,
-- as Clicks' query reads them).
SELECT lower(f.j->>'utm_campaign') AS campaign, lower(f.j->>'utm_term') AS keyword,
   count(DISTINCT f.id) AS finished_surveys, count(DISTINCT x.sid) AS buyers
  FROM finishers f LEFT JOIN sales x ON x.sid = f.id
 WHERE (coalesce(f.j->>'gclid', '') <> '' OR coalesce(f.j->>'gbraid', '') <> '' OR coalesce(f.j->>'wbraid', '') <> ''
    OR (lower(f.j->>'utm_source') = 'google' AND lower(f.j->>'utm_medium') IN ('cpc', 'ppc', 'paid', 'ads')))
   AND coalesce(f.j->>'utm_term', '') <> ''
   AND (f.created_date_time AT TIME ZONE 'Europe/Berlin')::date >= DATE '2026-08-27'
 GROUP BY 1, 2 ORDER BY 3 DESC`
);

// ---------------------------------------------------------------------------------------------

const ratio = (num: string, den: string, mult?: string) => ({
  num,
  den,
  ...(mult ? { mult } : {}),
});

const SO_FAR =
  "Purchases are this range's finishers' purchases so far (a cohort), not payments by the day they were made: a recent range keeps rising as people buy later.";
const STAFF =
  "The team's own surveys (an @loveiq.org account, or one that used the team's test code) and our test runs are left out.";
const VISITOR_NOTE =
  "Visitors are the visit log's: one per browser per day, counted by our server for everyone (cookie banner or not), from 15 Jun 2026.";
const SPEND_NOTE =
  "Spend is Google Ads' only (Meta's isn't read), as Google Analytics imports it; the last day or two can still move.";
const CONTRIB_NOTE =
  "Contribution uses the assumptions typed on the page (payment fee 2.9% + €0.25, €0.05 per report, 0% VAT to start); the 12-week line uses those starting values.";

export const fields: FieldRegistry = {
  // ---- Attribution coverage
  "traffic.withSource": {
    label: "Visitors with a source",
    what: "The share of this range's visitors we can tie to where they came from: an ad, a search, an email, an AI assistant or another site. The rest arrive as Direct, so every split by source below is only as good as this.",
    good: "up",
    stat: "Share",
    per: "per visitor (one per browser per day)",
    formula: ratio("Visitors − Direct visitors", "Visitors (the visit log)", "× 100"),
    caveat:
      "Direct is an estimate: the visit log keeps only the link's tag, so its untagged visits are split by the sources of the untagged visits PostHog recorded (only a small part of them). A paid click that loses its tags lands in Direct. Blank under any filter, and for a range starting before 23 Aug 2026, when PostHog starts. Buyers are tied to a source by their own finished survey's link tags (recorded from 19 Jul 2026): the Performance table by channel shows who paid from each.",
    tables: [
      T.visits(),
      T.posthog("$session_id, $current_url (utm tags, click ids), $referring_domain, timestamp"),
    ],
    query: {
      lang: "HogQL",
      text: `${HOGQL_WINDOW}
-- 1 · PostHog: the share of its untagged visits (no utm_source, no Google click id) that are
-- Direct: no medium, no Meta click id and no referring site (our own sites aside).
SELECT countIf(med = '' AND fb = 0 AND ref = '') AS direct,
       countIf(med != 'probe') AS untagged_seen,
       direct / untagged_seen AS direct_share
  FROM (SELECT ${TAGS} FROM (${FIRST_VIEWS}))
 WHERE src = '' AND ads = 0
-- 2 · Production (SQL): the visit log's untagged visits, which that share splits.
--   SELECT count(*) FILTER (WHERE coalesce(utm_source, '') = '') AS untagged, count(*) AS visitors
--     FROM funnel_event WHERE event_type = 'unique_visitor' AND coalesce(landing_variant, '') <> 'pay_to_start' AND day BETWEEN :from AND :to
--      AND lower(trim(coalesce(utm_source, ''))) NOT IN ${TEST_SOURCES};
-- Direct visitors = untagged × direct_share; visitors with a source = 1 − Direct ÷ visitors.`,
    },
    related: ["traffic.unattributed", "traffic.visitors"],
  },
  "traffic.unattributed": {
    label: "Unattributed visitors",
    what: "How many of this range's visitors came with no trace of where from (Direct), out of all visitors. Paid clicks that arrive without their tags land here too.",
    good: "down",
    stat: "Count (estimated)",
    per: "per visitor (one per browser per day)",
    formula: {
      num: "Untagged visits in the visit log × Direct's share of PostHog's untagged visits",
    },
    caveat:
      "An estimate (\"≈\"): the visit log can't tell an untagged visit's source, so PostHog's untagged visits, sorted by our own rules, split it. Blank under any filter, and for a range starting before 23 Aug 2026, when PostHog starts.",
    tables: [T.visits(), T.posthog("$session_id, $current_url, $referring_domain, timestamp")],
    query: {
      lang: "SQL",
      text: `-- Part 1, production (SQL): the visit log's untagged visits (the share below splits these).
SELECT count(*) FILTER (WHERE coalesce(utm_source, '') = '') AS untagged, count(*) AS visitors
  FROM funnel_event
 WHERE event_type = 'unique_visitor' AND coalesce(landing_variant, '') <> 'pay_to_start' AND day BETWEEN :from AND :to
   AND lower(trim(coalesce(utm_source, ''))) NOT IN ${TEST_SOURCES};

-- Part 2, PostHog (HogQL): Direct's share of its untagged visits (no utm_source, no Google
-- click id): no medium, no Meta click id and no referring site, as Visitors with a source reads it.
${HOGQL_WINDOW}
SELECT countIf(med = '' AND fb = 0 AND ref = '') AS direct,
       countIf(med != 'probe') AS untagged_seen,
       direct / untagged_seen AS direct_share
  FROM (SELECT ${TAGS} FROM (${FIRST_VIEWS}))
 WHERE src = '' AND ads = 0
-- Unattributed visitors ≈ untagged (part 1) × direct_share (part 2).`,
    },
    related: ["traffic.withSource", "traffic.visitors"],
  },
  // ---- The nine headline figures
  "traffic.spend": {
    label: "Ad spend",
    what: "What we paid Google Ads in the range. Meta's spend isn't read, so it isn't in here.",
    stat: "Sum",
    per: "per day, added up over the range",
    formula: { num: "Google Ads cost of every day in the range" },
    caveat: `${SPEND_NOTE} Under a device, tier or new-or-returning filter it is blank (the headline figures don't split spend that way; Performance › Device and Tier show Google's own split). Under a source filter other than Google Ads it reads "—": Meta's ads aren't read, and the other sources have no ad spend.`,
    tables: [T.ads("date, cost_eur")],
    query: sql([ADS], "SELECT round(spend, 2) AS ad_spend FROM ads"),
    related: ["traffic.cpc", "traffic.roas", "traffic.rowSpend"],
  },
  "traffic.cpc": {
    label: "CPC",
    what: "What one click on a Google Ads ad cost us on average in the range. Cheap clicks only help if those people go on to finish and buy.",
    good: "down",
    stat: "Average (ratio of sums)",
    per: "per ad click",
    formula: ratio("Ad spend", "Google Ads clicks"),
    caveat: `${SPEND_NOTE} Clicks are Google's own count, all of its clicks.`,
    tables: [T.ads("date, cost_eur, clicks")],
    query: sql(
      [ADS],
      "SELECT round(spend, 2) AS ad_spend, clicks, round(spend / nullif(clicks, 0), 2) AS cpc FROM ads"
    ),
    related: ["traffic.spend", "traffic.ctr", "traffic.qualityX"],
  },
  "traffic.visitors": {
    label: "Visitors",
    what: "How many people visited the live site in the range, counted once per browser per day. Everything per visitor on this page divides by it.",
    good: "up",
    stat: "Count",
    per: "per visitor (one per browser per day)",
    formula: { num: "Rows of the visit log in the range" },
    caveat: `${VISITOR_NOTE} One person on two days counts twice. In the Performance table each row's visitors are its own: Google Ads' and the landing versions' are counted, the other sources', campaigns', keywords', devices' and tiers' are PostHog's split of the count (\"Sample split\").`,
    tables: [T.visits()],
    query: sql([VISITS], "SELECT n AS visitors FROM visits"),
    related: ["traffic.submitCvr", "traffic.withSource", "traffic.startCvr"],
  },
  "traffic.submitCvr": {
    label: "Survey submission CVR",
    what: "Of the range's visitors, the share who finished the survey. It says how well the site turns visits into finished surveys.",
    good: "up",
    stat: "Share",
    per: "per visitor",
    formula: ratio("Finished surveys", "Visitors", "× 100"),
    caveat: `${STAFF} ${VISITOR_NOTE} People who visit on one day and finish on another count on both sides of their own days.`,
    tables: [T.subs(), T.visits()],
    query: sql(
      [FINISHERS, VISITS],
      `SELECT c.n AS finished_surveys, v.n AS visitors, round(100.0 * c.n / nullif(v.n, 0), 2) AS cvr_pct
  FROM (SELECT count(*) AS n FROM finishers) c, visits v`
    ),
    related: ["traffic.completes", "traffic.visitors", "traffic.startCvr"],
  },
  "traffic.contribPerVisitor": {
    label: "Contribution / visitor",
    what: "What each visitor left us after payment fees, the reports' running cost and the ads, on average. Below zero, the traffic costs more than it brings in.",
    good: "up",
    stat: "Average (ratio of sums)",
    per: "per visitor",
    formula: ratio("Contribution", "Visitors"),
    caveat: `${CONTRIB_NOTE} ${SO_FAR} ${SPEND_NOTE}`,
    tables: [T.subs(), T.pay(), T.ads("date, cost_eur"), T.visits()],
    query: sql(
      [FINISHERS, SALES, ADS, CONTRIB, VISITS],
      `SELECT k.contribution, v.n AS visitors,
       round(k.contribution / nullif(v.n, 0), 3) AS contribution_per_visitor
  FROM contrib k, visits v`
    ),
    related: ["traffic.contribution", "traffic.cpv", "traffic.visitors"],
  },
  "traffic.revPerVisitor": {
    label: "Revenue / visitor",
    what: "What the range's finishers paid so far, spread over every visitor of the range. It joins how many people buy and what they pay into one figure per visit.",
    good: "up",
    stat: "Average (ratio of sums)",
    per: "per visitor",
    formula: ratio("Revenue of the range's finishers, so far", "Visitors"),
    caveat: `${SO_FAR} A sale refunded in full leaves it; one refunded in part stays in whole. ${STAFF}`,
    tables: [T.subs(), T.pay(), T.visits()],
    query: sql(
      [FINISHERS, SALES, VISITS],
      `SELECT r.revenue, v.n AS visitors, round(r.revenue / nullif(v.n, 0), 4) AS revenue_per_visitor
  FROM ${REV}, visits v`
    ),
    related: ["traffic.rpv", "traffic.revenue", "traffic.visitorToPaid"],
  },
  "traffic.roas": {
    label: "ROAS",
    what: "Revenue for each euro of Google Ads spend: 1.00× pays the ads back, before fees and the reports' running cost.",
    good: "up",
    stat: "Ratio",
    per: "per euro of ad spend",
    formula: ratio("Revenue of the range's finishers, so far", "Ad spend"),
    caveat: `Revenue is every source's finishers' (organic buyers too), set against Google Ads spend alone, so it reads better than the ads alone earn. ${SO_FAR}`,
    tables: [T.subs(), T.pay(), T.ads("date, cost_eur")],
    query: sql(
      [FINISHERS, SALES, ADS],
      `SELECT r.revenue, round(a.spend, 2) AS ad_spend, round(r.revenue / nullif(a.spend, 0), 2) AS roas
  FROM ${REV}, ads a`
    ),
    related: ["traffic.spend", "traffic.revenue", "traffic.cac"],
  },
  "traffic.visitorToPaid": {
    label: "Visitor → paid",
    what: "Of the range's visitors, the share that became a paying customer: finishing the survey and buying, in one figure.",
    good: "up",
    stat: "Share",
    per: "per visitor",
    formula: ratio("Finishers who paid, so far", "Visitors", "× 100"),
    caveat: `${SO_FAR} A buyer is a finished survey with a real sale on its report, counted once however many they bought. ${VISITOR_NOTE}`,
    tables: [T.subs(), T.pay(), T.visits()],
    query: sql(
      [FINISHERS, SALES, VISITS],
      `SELECT r.buyers, v.n AS visitors, round(100.0 * r.buyers / nullif(v.n, 0), 3) AS visitor_to_paid_pct
  FROM ${REV}, visits v`
    ),
    related: ["traffic.purchaseCvr", "traffic.buyers", "traffic.visitors"],
  },
  "traffic.purchaseCvr": {
    label: "Purchase CVR",
    what: "Of the people who finished the survey in the range, the share who bought (so far). It says how well the report and its paywall sell.",
    good: "up",
    stat: "Share",
    per: "per finished survey",
    formula: ratio("Finishers who paid, so far", "Finished surveys", "× 100"),
    caveat: `${SO_FAR} ${STAFF}`,
    tables: [T.subs(), T.pay()],
    query: sql(
      [FINISHERS, SALES],
      `SELECT r.buyers, c.n AS finished_surveys, round(100.0 * r.buyers / nullif(c.n, 0), 2) AS purchase_cvr_pct
  FROM ${REV}, (SELECT count(*) AS n FROM finishers) c`
    ),
    related: ["traffic.buyers", "traffic.completes", "traffic.visitorToPaid"],
  },
  // ---- The scorecard
  "traffic.starts": {
    label: "Survey starts",
    what: "How many survey runs began in the range: someone answered at least the first question. It is the step between a visit and a finished survey.",
    good: "up",
    stat: "Count",
    per: "per survey run (a browser session)",
    formula: { num: "Runs that answered a question (or finished), by the day they began" },
    caveat:
      "A run is told by its survey steps, its saved draft or its finished survey. The team's own runs (their account, or the network their own surveys came from) and our test runs are left out. A range starting before 18 Sep 2026 is left blank, with the reason: before then the steps missed people who declined cookies, and drafts are cleared after 30 days, so its starts are incomplete.",
    tables: [T.starts(), T.subs("session_id, start_date_time, status, user_id, utm_tracker")],
    query: sql([STARTS], "SELECT count(*) AS survey_starts FROM starts"),
    related: ["traffic.startCvr", "traffic.completionCvr", "traffic.completes"],
  },
  "traffic.completes": {
    label: "Completes",
    what: "How many surveys were finished in the range. On this page a user is a person who finished the survey.",
    good: "up",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Finished surveys, by the Berlin day they were finished" },
    caveat: `${STAFF} A person who finishes twice counts twice here (Assessments / user counts them once).`,
    tables: [T.subs()],
    query: sql([FINISHERS], "SELECT count(*) AS completes FROM finishers"),
    related: ["traffic.submitCvr", "traffic.completionCvr", "traffic.costPerComplete"],
  },
  "traffic.buyers": {
    label: "Buyers",
    what: "How many of the range's finishers have paid for their report so far. Each counts once, however many purchases they made (the line under it counts the purchases).",
    good: "up",
    stat: "Count",
    per: "per finished survey with a real sale",
    formula: { num: "Finished surveys whose report has a real sale" },
    caveat: `${SO_FAR} Free unlocks and test payments are not sales.`,
    tables: [T.subs(), T.pay()],
    query: sql(
      [FINISHERS, SALES],
      "SELECT count(DISTINCT sid) AS buyers, count(*) AS purchases FROM sales"
    ),
    related: ["traffic.purchaseCvr", "traffic.cac", "traffic.revenue"],
  },
  "traffic.revenue": {
    label: "Revenue",
    what: "What the range's finishers have paid so far, all their reports' sales together, before fees.",
    good: "up",
    stat: "Sum",
    per: "per payment, added up",
    formula: { num: "Amounts of the finishers' real sales, so far" },
    caveat: `${SO_FAR} VAT is in it (the contribution takes it out at the rate typed in).`,
    tables: [T.subs(), T.pay()],
    query: sql([FINISHERS, SALES], "SELECT coalesce(sum(amount), 0) AS revenue FROM sales"),
    related: ["traffic.aov", "traffic.roas", "traffic.revPerVisitor"],
  },
  "traffic.contribution": {
    label: "Contribution",
    what: "What the range's finishers left us after VAT, payment fees, the reports' running cost and the Google Ads spend: the profit before fixed costs.",
    good: "up",
    stat: "Sum",
    per: "per range (a row's own in the table)",
    formula: {
      num: "Revenue ÷ (1 + VAT) − (revenue × fee % + payments × fee) − finished surveys × report cost − ad spend",
    },
    caveat: `${CONTRIB_NOTE} ${SO_FAR} In the table, channels that pay for no ads count no ad spend, and Meta Ads' reads — (its spend isn't read).`,
    tables: [T.subs(), T.pay(), T.ads("date, cost_eur")],
    query: sql([FINISHERS, SALES, ADS, CONTRIB], "SELECT * FROM contrib"),
    related: ["traffic.contribPerVisitor", "traffic.cpv", "traffic.revenue"],
  },
  // ---- The Performance table's columns (each row's own; the query is the "All" row)
  "traffic.rowSpend": {
    label: "Spend",
    what: "What the row cost in Google Ads spend. Google Ads' row carries all of it; the campaign, keyword, device and country-tier rows show Google Ads' own split of it.",
    stat: "Sum",
    per: "per row, over the range",
    formula: { num: "Google Ads cost of the row's clicks over the range" },
    caveat: `${SPEND_NOTE} Organic search, AI, Social, Referral, Email, Direct and Not recorded pay for no ads, so their spend reads — (not €0, which would rank them cheapest). Device rows add Google's other screens (connected TVs) under Other devices; per-day cents make Google's splits differ from the total by a few cents.`,
    tables: [
      T.ads("date, cost_eur"),
      {
        source: "ads",
        table: "device_daily",
        columns: "date, device, cost_eur, clicks, impressions",
        filters:
          "Shown for All sources or Google Ads only, without a device, tier or visitor filter.",
      },
      {
        source: "ads",
        table: "geo_daily",
        columns: "date, country, cost_eur, clicks, impressions",
        filters: "As device_daily; each country put in its price tier as the pricing code does.",
      },
    ],
    query: sql([ADS], "SELECT round(spend, 2) AS spend FROM ads"),
    related: ["traffic.spend", "traffic.cac", "traffic.costPerComplete"],
  },
  "traffic.cpm": {
    label: "CPM",
    what: "What a thousand showings of our Google ads cost: how expensive it is to be seen, before anyone clicks.",
    good: "down",
    stat: "Average (ratio of sums)",
    per: "per 1,000 ad impressions",
    formula: ratio("Ad spend", "Ad impressions", "× 1,000"),
    caveat: `${SPEND_NOTE} Only Google Ads' rows have impressions; the others read —.`,
    tables: [T.ads("date, cost_eur, impressions")],
    query: sql(
      [ADS],
      "SELECT round(spend, 2) AS spend, impressions, round(1000 * spend / nullif(impressions, 0), 2) AS cpm FROM ads"
    ),
    related: ["traffic.ctr", "traffic.cpc"],
  },
  "traffic.ctr": {
    label: "CTR",
    what: "Of the times our Google ads were shown, the share that got a click: how well the ads catch attention.",
    good: "up",
    stat: "Share",
    per: "per ad impression",
    formula: ratio("Ad clicks", "Ad impressions", "× 100"),
    caveat: "Google's own counts; only Google Ads' rows have them.",
    tables: [T.ads("date, clicks, impressions")],
    query: sql(
      [ADS],
      "SELECT clicks, impressions, round(100.0 * clicks / nullif(impressions, 0), 1) AS ctr_pct FROM ads"
    ),
    related: ["traffic.cpm", "traffic.cpc", "traffic.clicks"],
  },
  "traffic.startCvr": {
    label: "Start CVR",
    what: "Of the row's visitors, the share who began the survey (answered its first question). It says whether the landing page gets people going.",
    good: "up",
    stat: "Share",
    per: "per visitor",
    formula: ratio("Survey starts", "Visitors", "× 100"),
    caveat: `${VISITOR_NOTE} Where a row's visitors are PostHog's estimate ("Sample split") the rate is an estimate too; an unfinished start keeps its source only while its draft does (30 days).`,
    tables: [T.starts(), T.visits()],
    query: sql(
      [STARTS, VISITS],
      `SELECT s.n AS survey_starts, v.n AS visitors, round(100.0 * s.n / nullif(v.n, 0), 1) AS start_cvr_pct
  FROM (SELECT count(*) AS n FROM starts) s, visits v`
    ),
    related: ["traffic.starts", "traffic.completionCvr", "traffic.submitCvr"],
  },
  "traffic.completionCvr": {
    label: "Completion CVR",
    what: "Of the survey runs begun, the share finished: how many people the survey itself keeps to the end.",
    good: "up",
    stat: "Share",
    per: "per survey run",
    formula: ratio("Finished surveys", "Survey starts", "× 100"),
    caveat:
      "Finishers are counted by the day they finished, starts by the day they began, so a range's edges shift a few. A range starting before 18 Sep 2026 is left blank, with the reason: its starts are incomplete (cookie refusers' unfinished runs are missing).",
    tables: [T.subs(), T.starts()],
    query: sql(
      [FINISHERS, STARTS],
      `SELECT c.n AS finished_surveys, s.n AS survey_starts,
       round(100.0 * c.n / nullif(s.n, 0), 1) AS completion_cvr_pct
  FROM (SELECT count(*) AS n FROM finishers) c, (SELECT count(*) AS n FROM starts) s`
    ),
    related: ["traffic.starts", "traffic.completes", "traffic.startCvr"],
  },
  "traffic.costPerComplete": {
    label: "Cost / complete",
    what: "Google Ads spend for each finished survey: what a finished survey costs us in ads.",
    good: "down",
    stat: "Average (ratio of sums)",
    per: "per finished survey",
    formula: ratio("Ad spend", "Finished surveys"),
    caveat: `${BLENDED} ${SPEND_NOTE}`,
    tables: [T.ads("date, cost_eur"), T.subs()],
    query: sql(
      [ADS, FINISHERS],
      `SELECT round(a.spend, 2) AS spend, c.n AS finished_surveys,
       round(a.spend / nullif(c.n, 0), 2) AS cost_per_complete
  FROM ads a, (SELECT count(*) AS n FROM finishers) c`
    ),
    related: ["traffic.cac", "traffic.costPerSub", "traffic.completes"],
  },
  "traffic.preRate": {
    label: "Pre-unlock rate",
    what: "Of the finishers, the share who pre-unlocked their Core Archetype (the €1.99 Initial plan), so far.",
    good: "up",
    stat: "Share",
    per: "per finished survey",
    formula: ratio("Finishers who bought the Initial plan, so far", "Finished surveys", "× 100"),
    caveat: `${PRE_RULE} ${SO_FAR}`,
    tables: [T.subs(), T.pay("metadata.plan, status, amount, is_test")],
    query: sql(
      [FINISHERS, SALES],
      `SELECT count(DISTINCT sid) FILTER (WHERE plan = 'initial') AS pre_buyers, c.n AS finished_surveys,
       -- Blank for a range starting before 23 Oct 2026: nobody could pre-unlock its first days.
       CASE WHEN :from >= DATE '2026-10-23'
            THEN round(100.0 * count(DISTINCT sid) FILTER (WHERE plan = 'initial') / nullif(c.n, 0), 1) END AS pre_rate_pct
  FROM (SELECT count(*) AS n FROM finishers) c LEFT JOIN sales ON true
 GROUP BY c.n`
    ),
    related: ["traffic.fullRate", "traffic.costPerPre"],
  },
  "traffic.fullRate": {
    label: "Full unlock rate",
    what: "Of the finishers, the share who bought a full unlock of their report (Full, Full All or the retired Core), first or as an upgrade later.",
    good: "up",
    stat: "Share",
    per: "per finished survey",
    formula: ratio("Finishers who bought a full unlock, so far", "Finished surveys", "× 100"),
    caveat: SO_FAR,
    tables: [T.subs(), T.pay()],
    query: sql(
      [FINISHERS, SALES],
      `SELECT count(DISTINCT sid) FILTER (WHERE plan IN ${FULL_PLANS}) AS full_buyers, c.n AS finished_surveys,
       round(100.0 * count(DISTINCT sid) FILTER (WHERE plan IN ${FULL_PLANS}) / nullif(c.n, 0), 1) AS full_rate_pct
  FROM (SELECT count(*) AS n FROM finishers) c LEFT JOIN sales ON true
 GROUP BY c.n`
    ),
    related: ["traffic.purchaseCvr", "traffic.costPerFull"],
  },
  "traffic.aov": {
    label: "AOV",
    what: "What one purchase brought in on average: the average order value.",
    good: "up",
    stat: "Average",
    per: "per payment",
    formula: ratio("Revenue", "Purchases"),
    caveat: `${SO_FAR} An upgrade is its own purchase.`,
    tables: [T.subs(), T.pay()],
    query: sql(
      [FINISHERS, SALES],
      "SELECT coalesce(sum(amount), 0) AS revenue, count(*) AS purchases, round(sum(amount) / nullif(count(*), 0), 2) AS aov FROM sales"
    ),
    related: ["traffic.revenue", "traffic.buyers"],
  },
  "traffic.cac": {
    label: "CAC",
    what: "Google Ads spend for each paying customer: what winning one buyer cost us in ads.",
    good: "down",
    stat: "Average (ratio of sums)",
    per: "per paying customer (a finisher who paid)",
    formula: ratio("Ad spend", "Buyers"),
    caveat: `Buyers are every source's (organic ones too), so on the All row it reads cheaper than the ads alone win. ${BLENDED} ${SO_FAR}`,
    tables: [T.ads("date, cost_eur"), T.subs(), T.pay()],
    query: sql(
      [ADS, FINISHERS, SALES],
      `SELECT round(a.spend, 2) AS spend, r.buyers, round(a.spend / nullif(r.buyers, 0), 0) AS cac
  FROM ads a, ${REV}`
    ),
    related: ["traffic.buyers", "traffic.roas", "traffic.qualityY"],
  },
  "traffic.costPerPre": {
    label: "Cost / pre-unlock",
    what: "Google Ads spend for each finisher who pre-unlocked their Core Archetype (the €1.99 Initial plan).",
    good: "down",
    stat: "Average (ratio of sums)",
    per: "per pre-unlock buyer",
    formula: ratio("Ad spend", "Finishers who bought the Initial plan"),
    caveat: `${PRE_RULE} ${BLENDED} ${SO_FAR}`,
    tables: [T.ads("date, cost_eur"), T.subs(), T.pay("metadata.plan, status, amount, is_test")],
    query: sql(
      [ADS, FINISHERS, SALES],
      `SELECT round(a.spend, 2) AS spend, f.n AS pre_buyers, round(a.spend / nullif(f.n, 0), 0) AS cost_per_pre
  FROM ads a, (SELECT count(DISTINCT sid) AS n FROM sales WHERE plan = 'initial') f`
    ),
    related: ["traffic.preRate", "traffic.costPerFull"],
  },
  "traffic.costPerFull": {
    label: "Cost / full unlock",
    what: "Google Ads spend for each finisher who bought a full unlock.",
    good: "down",
    stat: "Average (ratio of sums)",
    per: "per full-unlock buyer",
    formula: ratio("Ad spend", "Finishers who bought a full unlock"),
    caveat: `${BLENDED} ${SO_FAR}`,
    tables: [T.ads("date, cost_eur"), T.pay()],
    query: sql(
      [ADS, FINISHERS, SALES],
      `SELECT round(a.spend, 2) AS spend, f.n AS full_buyers, round(a.spend / nullif(f.n, 0), 0) AS cost_per_full
  FROM ads a, (SELECT count(DISTINCT sid) AS n FROM sales WHERE plan IN ${FULL_PLANS}) f`
    ),
    related: ["traffic.fullRate", "traffic.cac"],
  },
  "traffic.revPerUser": {
    label: "Rev. / user",
    what: "What each finisher paid on average so far, those who bought nothing included (a user is a person who finished the survey).",
    good: "up",
    stat: "Average (ratio of sums)",
    per: "per finished survey",
    formula: ratio("Revenue of the finishers, so far", "Finished surveys"),
    caveat: SO_FAR,
    tables: [T.subs(), T.pay()],
    query: sql(
      [FINISHERS, SALES],
      `SELECT r.revenue, c.n AS finished_surveys, round(r.revenue / nullif(c.n, 0), 2) AS revenue_per_user
  FROM ${REV}, (SELECT count(*) AS n FROM finishers) c`
    ),
    related: ["traffic.clv", "traffic.aov"],
  },
  "traffic.rpv": {
    label: "Rev. / visitor",
    what: "What the row's finishers paid so far, spread over the row's visitors: buying and paying in one figure per visit.",
    good: "up",
    stat: "Average (ratio of sums)",
    per: "per visitor",
    formula: ratio("Revenue of the row's finishers, so far", "The row's visitors"),
    caveat: `${SO_FAR} Rows whose visitors are PostHog's estimate give an estimate.`,
    tables: [T.subs(), T.pay(), T.visits()],
    query: sql(
      [FINISHERS, SALES, VISITS],
      `SELECT r.revenue, v.n AS visitors, round(r.revenue / nullif(v.n, 0), 3) AS revenue_per_visitor
  FROM ${REV}, visits v`
    ),
    related: ["traffic.revPerVisitor", "traffic.cpv"],
  },
  "traffic.refundRate": {
    label: "Refund rate",
    what: "Of all the sales the row's people ever made, the share refunded (in full or in part).",
    good: "down",
    stat: "Share",
    per: "per sale",
    formula: ratio("Their refunded sales", "All their sales, all time", "× 100"),
    caveat:
      "Every sale of the row's people's reports, before or after the range: a person's whole history. Blank while they have no sale.",
    tables: [T.subs(), T.pay("status, refund_amount, amount, is_test, personal_report_id")],
    query: sql(
      [FINISHERS, PEOPLE],
      `SELECT count(*) FILTER (WHERE refunded) AS refunded, count(*) AS sales,
       round(100.0 * count(*) FILTER (WHERE refunded) / nullif(count(*), 0), 1) AS refund_rate_pct
  FROM lifetime`
    ),
    related: ["traffic.clv", "traffic.cohortRefund"],
  },
  "traffic.cpv": {
    label: "Contrib. / visitor",
    what: "The row's contribution spread over its visitors: what each visit from it leaves us after fees, report cost and ads.",
    good: "up",
    stat: "Average (ratio of sums)",
    per: "per visitor",
    formula: ratio("The row's contribution", "The row's visitors"),
    caveat: `${CONTRIB_NOTE} ${SO_FAR}`,
    tables: [T.subs(), T.pay(), T.ads("date, cost_eur"), T.visits()],
    query: sql(
      [FINISHERS, SALES, ADS, CONTRIB, VISITS],
      `SELECT k.contribution, v.n AS visitors, round(k.contribution / nullif(v.n, 0), 3) AS contribution_per_visitor
  FROM contrib k, visits v`
    ),
    related: ["traffic.contribPerVisitor", "traffic.contribution"],
  },
  "traffic.medianRead": {
    label: "Median read",
    what: "How long the middle reader spent in their report (half read longer, half shorter): a sign of whether the report holds people.",
    good: "up",
    stat: "Median",
    per: "per reader (a finisher with a reading session that ended plausibly)",
    formula: { num: "The middle of the readers' reading times" },
    caveat:
      "A reader's time adds up their sessions with a plausible end (under 4 hours), each counted up to 30 minutes (a tab left open would drag it). Finishers who never opened the report, bots and the team are left out.",
    tables: [T.sessions(), T.subs()],
    query: sql(
      [FINISHERS, READING],
      `SELECT count(*) AS readers,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds)) AS median_read_seconds
  FROM reading`
    ),
    related: ["traffic.completes", "traffic.clv"],
  },
  "traffic.apu": {
    label: "Assessments / user",
    what: "How many surveys each person in the row finished in the range, on average: above 1.00 means people come back to take it again.",
    good: "up",
    stat: "Average",
    per: "per person",
    formula: ratio("Finished surveys", "People who finished"),
    caveat:
      "Only the range's own finished surveys count. A finisher with no account counts as a person of their own.",
    tables: [T.subs()],
    query: sql(
      [FINISHERS],
      `SELECT count(*) AS finished_surveys, count(DISTINCT coalesce(user_id, -id)) AS people,
       round(count(*)::numeric / nullif(count(DISTINCT coalesce(user_id, -id)), 0), 2) AS assessments_per_user
  FROM finishers`
    ),
    related: ["traffic.completes", "traffic.repeat"],
  },
  "traffic.clv": {
    label: "CLV / user",
    what: "What the row's people have paid us over their whole history, per person: their lifetime value so far.",
    good: "up",
    stat: "Average",
    per: "per person",
    formula: ratio("Everything their people paid, all time (refunds out)", "People who finished"),
    caveat:
      "Every sale of their reports counts, whenever it was made (before the range too). Refunded sales are left out.",
    tables: [T.subs(), T.pay("status, refund_amount, amount, is_test, personal_report_id")],
    query: sql(
      [FINISHERS, PEOPLE],
      `SELECT coalesce(sum(l.amount) FILTER (WHERE NOT l.refunded), 0) AS lifetime_revenue, p.n AS people,
       round(coalesce(sum(l.amount) FILTER (WHERE NOT l.refunded), 0) / nullif(p.n, 0), 2) AS clv_per_user
  FROM (SELECT count(*) AS n FROM people) p LEFT JOIN lifetime l ON true
 GROUP BY p.n`
    ),
    related: ["traffic.clvRatio", "traffic.revPerUser", "traffic.refundRate"],
  },
  "traffic.clvRatio": {
    label: "CLV : cost / user",
    what: "Lifetime value per person against the Google Ads spend per finisher: above 1.0× the ads earn back more than they cost per person who finishes.",
    good: "up",
    stat: "Ratio",
    per: "per person (a finisher)",
    formula: ratio("CLV / user", "Ad spend ÷ finished surveys (cost per finisher)"),
    caveat:
      "The design calls it CLV : CAC, but its own formula divides by spend per finisher, not per paying customer (CAC), and so does this. Named for what it divides by: per buyer it would read far lower. Blank for rows with no ad spend.",
    tables: [T.subs(), T.pay("status, refund_amount, amount, is_test"), T.ads("date, cost_eur")],
    query: sql(
      [FINISHERS, PEOPLE, ADS],
      `SELECT x.clv, round(a.spend / nullif(c.n, 0), 2) AS cost_per_user,
       round(x.clv / nullif(a.spend / nullif(c.n, 0), 0), 2) AS clv_to_cost
  FROM (SELECT coalesce(sum(l.amount) FILTER (WHERE NOT l.refunded), 0) / nullif(p.n, 0) AS clv
          FROM (SELECT count(*) AS n FROM people) p LEFT JOIN lifetime l ON true GROUP BY p.n) x,
       ads a, (SELECT count(*) AS n FROM finishers) c`
    ),
    related: ["traffic.clv", "traffic.cac", "traffic.costPerComplete"],
  },
  // ---- Traffic and submissions by channel
  "traffic.chartVisitors": {
    label: "Visitors per week",
    what: "The range's visitors point by point (days for a range up to two weeks, weeks up to four months, months beyond), stacked by the channel they came from, with each channel's share of the point.",
    stat: "Count (stacked)",
    per: "per visitor (one per browser per day), per day, week or month",
    formula: { num: "Visitors of each whole day, week or month, split by channel" },
    caveat: `Each point's height is the visit log's count, and its channels add up to it in whole visitors. Its split by channel is partly an estimate: Google Ads, email and AI-assistant links name their source and are counted; the untagged visits are split by the sources of the untagged visits PostHog recorded in that period ("Sample split"). Only whole weeks or months are drawn: one cut short by the range would read as a drop. ${VISITOR_NOTE}`,
    tables: [T.visits(), T.posthog("$session_id, $current_url, $referring_domain, timestamp")],
    query: {
      lang: "SQL",
      text: `-- The visit log per day, week or month (as the chart): each point's height.
SELECT ${WEEK.replace("DAY", "day")} AS period, count(*) AS visitors,
       count(*) FILTER (WHERE lower(utm_source) = 'google') AS google_ads,
       count(*) FILTER (WHERE coalesce(utm_source, '') = '') AS untagged
  FROM funnel_event
 WHERE event_type = 'unique_visitor' AND coalesce(landing_variant, '') <> 'pay_to_start' AND day BETWEEN :from AND :to
   AND lower(trim(coalesce(utm_source, ''))) NOT IN ${TEST_SOURCES}
 GROUP BY 1 ORDER BY 1`,
    },
    related: ["traffic.visitors", "traffic.withSource", "traffic.chartLast"],
  },
  "traffic.chartSubmissions": {
    label: "Survey submissions per week",
    what: "The range's finished surveys point by point (days, weeks or months, by the range's length), stacked by the channel the person came from, with the average Google Ads cost per submission as a dotted line.",
    stat: "Count (stacked)",
    per: "per finished survey, per day, week or month",
    formula: {
      num: "Finished surveys of each whole day, week or month, by the channel their link tags name",
    },
    caveat: `${STAFF} A finisher whose source wasn't recorded (before 19 Jul 2026) is in no channel. Only whole weeks or months are drawn.`,
    tables: [T.subs()],
    query: sql(
      [FINISHERS],
      `SELECT ${WEEK.replace("DAY", "(created_date_time AT TIME ZONE 'Europe/Berlin')::date")} AS period,
       count(*) AS submissions
  FROM finishers
 -- In a channel only when the source was recorded: from 19 Jul 2026, or a link that carried one.
 WHERE created_date_time >= timestamptz '2026-07-19 00:00 Europe/Berlin'
    OR concat(j->>'utm_source', j->>'utm_medium', j->>'gclid', j->>'gbraid', j->>'wbraid',
              j->>'fbclid', j->>'referrer_host') <> ''
 GROUP BY 1 ORDER BY 1`
    ),
    related: ["traffic.completes", "traffic.costPerSub", "traffic.chartLast"],
  },
  "traffic.costPerSub": {
    label: "Avg. cost per survey submission",
    what: "Each point's Google Ads spend divided by its finished surveys (a day, week or month, as the chart): what a submission cost in ads then.",
    good: "down",
    stat: "Average (ratio of sums)",
    per: "per finished survey, per day, week or month",
    formula: ratio("The period's ad spend", "The period's finished surveys"),
    caveat: `Every source's finishers are counted, so it reads cheaper than Google Ads' own. ${SPEND_NOTE} Blank for a period whose spend isn't complete.`,
    tables: [T.ads("date, cost_eur"), T.subs()],
    query: sql(
      [FINISHERS],
      `, spend AS (
  SELECT ${WEEK.replace("DAY", "(meta->>'day')::date")} AS period, sum((meta->>'ad_cost')::numeric) AS spend
    FROM brain_chunk
   WHERE source = 'ga4' AND meta->>'grain' = 'day' AND (meta->>'day')::date BETWEEN :from AND :to
   GROUP BY 1
)
SELECT s.period, round(s.spend, 2) AS spend, count(f.id) AS submissions,
       round(s.spend / nullif(count(f.id), 0), 2) AS cost_per_submission
  FROM spend s
  LEFT JOIN finishers f ON ${WEEK.replace("DAY", "(f.created_date_time AT TIME ZONE 'Europe/Berlin')::date")} = s.period
 GROUP BY s.period, s.spend ORDER BY 1`
    ),
    related: ["traffic.costPerComplete", "traffic.chartSubmissions"],
  },
  "traffic.chartLast": {
    label: "The last point by channel",
    what: "Beside each chart (under it on a phone): each channel's visitors or submissions at the chart's last point (its last whole day, week or month), and its share of it.",
    stat: "Count and share",
    per: "per day, week or month (the chart's last point)",
    formula: ratio(
      "The channel's visitors (or submissions) at the last point",
      "Everyone's at the last point",
      "× 100"
    ),
    caveat:
      "As the charts count them: visitors per channel partly estimated from PostHog's untagged visits, submissions by the channel their link tags name. Google Ads' visitors are counted: its links tag every click.",
    tables: [T.visits(), T.subs()],
    query: sql(
      [FINISHERS],
      `-- The chart's last point: the range's last whole day, week or month (as drawn). Its
-- visitors (Google Ads' counted, the untagged ones split as the chart's card says) and its
-- finished surveys.
, last_point AS (
  SELECT p AS first_day, (p + ('1 ' || :grain)::interval - interval '1 day')::date AS last_day
    FROM (SELECT (date_trunc(:grain, :to::date + 1) - ('1 ' || :grain)::interval)::date AS p) x
)
SELECT (SELECT count(*) FROM funnel_event, last_point
         WHERE event_type = 'unique_visitor' AND coalesce(landing_variant, '') <> 'pay_to_start' AND day BETWEEN first_day AND last_day
           AND lower(trim(coalesce(utm_source, ''))) NOT IN ${TEST_SOURCES}) AS visitors,
       (SELECT count(*) FROM funnel_event, last_point
         WHERE event_type = 'unique_visitor' AND coalesce(landing_variant, '') <> 'pay_to_start' AND day BETWEEN first_day AND last_day
           AND lower(utm_source) = 'google') AS google_ads_visitors,
       (SELECT count(*) FROM finishers, last_point
         WHERE (created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN first_day AND last_day) AS submissions,
       (SELECT count(*) FROM finishers, last_point
         WHERE (created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN first_day AND last_day
           AND (coalesce(j->>'gclid', '') <> '' OR coalesce(j->>'gbraid', '') <> '' OR coalesce(j->>'wbraid', '') <> ''
                OR (lower(j->>'utm_source') = 'google' AND lower(j->>'utm_medium') IN ('cpc', 'ppc', 'paid', 'ads')))) AS google_ads_submissions`
    ),
    related: ["traffic.chartVisitors", "traffic.chartSubmissions"],
  },
  // ---- Buyers vs curiosity clicks (keywords)
  "traffic.clicks": {
    label: "Clicks",
    what: "How many clicks each keyword's ads got in the range, as Google Ads counts them.",
    stat: "Count",
    per: "per ad click",
    formula: { num: "Google Ads clicks on ads matched to the keyword" },
    caveat:
      "Search ads only: Performance Max shows no keyword, so its clicks aren't in any row (the rows add up to less than all clicks).",
    tables: [
      {
        source: "ads",
        table: "keyword_daily",
        columns: "date, campaign_name, keyword, clicks, impressions, cost_eur",
        filters:
          "Source: Google Ads' own; blank under another source's or a device, tier or visitor filter.",
      },
    ],
    query: {
      lang: "GAQL",
      text: `SELECT campaign.name, ad_group_criterion.keyword.text, metrics.clicks, metrics.impressions,
       metrics.cost_micros
  FROM keyword_view
 WHERE segments.date BETWEEN :from AND :to`,
    },
    related: ["traffic.ctr", "traffic.clickToComplete", "traffic.clickToPaid"],
  },
  "traffic.clickToComplete": {
    label: "Click → complete",
    what: "Of a keyword's ad clicks, the share that ended in a finished survey: whether the people the keyword brings go through with it.",
    good: "up",
    stat: "Share",
    per: "per ad click",
    formula: ratio(
      "Finished surveys whose link named the keyword",
      "The keyword's ad clicks",
      "× 100"
    ),
    caveat:
      "A finisher is tied to the keyword their ad link passed (utm_term), from 27 Aug 2026: before, the tag held the ad group's name. A click and its survey can fall in different ranges at the edges.",
    tables: [
      T.subs("created_date_time, utm_tracker (gclid, utm_campaign, utm_term)"),
      {
        source: "ads",
        table: "keyword_daily",
        columns: "date, campaign_name, keyword, clicks",
        filters: "Source: Google Ads' own.",
      },
    ],
    query: KEYWORD_ROWS,
    related: ["traffic.clicks", "traffic.clickToPaid", "traffic.completes"],
  },
  "traffic.clickToPaid": {
    label: "Click → paid",
    what: "Of a keyword's ad clicks, the share that ended in a purchase: the keywords that bring buyers rather than curious clicks.",
    good: "up",
    stat: "Share",
    per: "per ad click",
    formula: ratio(
      "Buyers whose link named the keyword, so far",
      "The keyword's ad clicks",
      "× 100"
    ),
    caveat: `${SO_FAR} Tied by the link's keyword tag, from 27 Aug 2026.`,
    tables: [
      T.subs("created_date_time, utm_tracker (gclid, utm_campaign, utm_term)"),
      T.pay(),
      {
        source: "ads",
        table: "keyword_daily",
        columns: "date, campaign_name, keyword, clicks",
        filters: "Source: Google Ads' own.",
      },
    ],
    query: KEYWORD_ROWS,
    related: ["traffic.clickToComplete", "traffic.buyerIndex", "traffic.cac"],
  },
  "traffic.buyerIndex": {
    label: "Buyer index",
    what: "A keyword's click-to-paid rate against the keywords' average (1.0): 1.3 or more marks buyers, 0.6 or less curiosity clicks.",
    good: "up",
    stat: "Ratio",
    per: "per keyword",
    formula: ratio(
      "The keyword's click → paid",
      "All keywords' click → paid (their buyers ÷ their clicks)"
    ),
    caveat: "Blank for every keyword while none of their clicks has led to a purchase.",
    tables: [
      T.subs("utm_tracker (utm_campaign, utm_term)"),
      T.pay(),
      {
        source: "ads",
        table: "keyword_daily",
        columns: "date, campaign_name, keyword, clicks",
        filters: "Source: Google Ads' own.",
      },
    ],
    query: KEYWORD_ROWS,
    related: ["traffic.clickToPaid", "traffic.clicks"],
  },
  // ---- Cohorts by acquisition source (new users: their first finished survey is in the range)
  "traffic.cohortDay0": {
    label: "Rev. / user day 0",
    what: "What each new user paid on day 0, within a day of their first finished survey, on average: how much is earned straight away.",
    good: "up",
    stat: "Average",
    per: "per new user (their first finished survey in the range)",
    formula: ratio(
      "Their sales within 1 day of their first finished survey (refunds out)",
      "New users 1 day on"
    ),
    caveat:
      "A new user is a person whose first finished survey ever falls in the range, by the source of that survey. Each column counts only the people that many days on (the grey count under it). The query adds every source together; the rows split it by source.",
    tables: [
      T.subs("user_id, created_date_time, utm_tracker"),
      T.pay("status, refund_amount, amount, is_test, created_date_time"),
    ],
    query: cohortDay(0),
    related: ["traffic.cohortDay7", "traffic.cohortGrowth", "traffic.clv"],
  },
  "traffic.cohortDay7": {
    label: "Day 7",
    what: "What each new user paid by day 7 after their first finished survey (day 0 being that day), on average: day 0's sales and what came in that week.",
    good: "up",
    stat: "Average",
    per: "per new user 7 days on",
    formula: ratio(
      "Their sales within 8 days of their first finished survey (refunds out)",
      "New users 8 days on"
    ),
    caveat: "Counts only the people at least 8 days past their first finished survey.",
    tables: [
      T.subs("user_id, created_date_time, utm_tracker"),
      T.pay("status, refund_amount, amount, is_test, created_date_time"),
    ],
    query: cohortDay(7),
    related: ["traffic.cohortDay0", "traffic.cohortDay30"],
  },
  "traffic.cohortDay30": {
    label: "Day 30",
    what: "What each new user paid by day 30 after their first finished survey (day 0 being that day), on average.",
    good: "up",
    stat: "Average",
    per: "per new user 30 days on",
    formula: ratio(
      "Their sales within 31 days of their first finished survey (refunds out)",
      "New users 31 days on"
    ),
    caveat:
      "Counts only the people at least 31 days past their first finished survey: blank for a recent range.",
    tables: [
      T.subs("user_id, created_date_time, utm_tracker"),
      T.pay("status, refund_amount, amount, is_test, created_date_time"),
    ],
    query: cohortDay(30),
    related: ["traffic.cohortDay7", "traffic.cohortDay90"],
  },
  "traffic.cohortDay90": {
    label: "Day 90",
    what: "What each new user paid by day 90 after their first finished survey (day 0 being that day), on average: the sources whose people keep paying stand out here.",
    good: "up",
    stat: "Average",
    per: "per new user 90 days on",
    formula: ratio(
      "Their sales within 91 days of their first finished survey (refunds out)",
      "New users 91 days on"
    ),
    caveat:
      "Counts only the people at least 91 days past their first finished survey: blank for a recent range.",
    tables: [
      T.subs("user_id, created_date_time, utm_tracker"),
      T.pay("status, refund_amount, amount, is_test, created_date_time"),
    ],
    query: cohortDay(90),
    related: ["traffic.cohortDay30", "traffic.cohortGrowth"],
  },
  "traffic.cohortGrowth": {
    label: "Day 90 ÷ day 0",
    what: "How much a source's new users' revenue grows between their first day and their first 90: 1.00× means nothing more after day 0.",
    good: "up",
    stat: "Ratio",
    per: "per new user 90 days on",
    formula: ratio("Their revenue within 91 days", "The same people's revenue within 1 day"),
    caveat: "Only the people 91 days on, and only where they paid on day 0: blank otherwise.",
    tables: [
      T.subs("user_id, created_date_time"),
      T.pay("status, refund_amount, amount, is_test, created_date_time"),
    ],
    query: sql(
      [FINISHERS, COHORT],
      `, old AS (SELECT * FROM firsts WHERE first_at + interval '91 days' <= now())
SELECT count(*) AS people_91_days_on,
       round(sum((SELECT coalesce(sum(amount), 0) FROM cohort_pays c WHERE c.user_id = o.user_id
                   AND NOT c.refunded AND c.at <= o.first_at + interval '91 days'))
             / nullif(sum((SELECT coalesce(sum(amount), 0) FROM cohort_pays c WHERE c.user_id = o.user_id
                   AND NOT c.refunded AND c.at <= o.first_at + interval '1 day')), 0), 2) AS growth
  FROM old o`
    ),
    related: ["traffic.cohortDay0", "traffic.cohortDay90"],
  },
  "traffic.repeat": {
    label: "Repeat assessment",
    what: "Of a source's new users, the share who have finished the survey more than once, ever.",
    good: "up",
    stat: "Share",
    per: "per new user",
    formula: ratio("New users with 2 or more finished surveys, all time", "New users", "× 100"),
    caveat: "A later survey counts whenever it was finished, even after the range.",
    tables: [T.subs("user_id, status, created_date_time")],
    query: sql(
      [FINISHERS, COHORT],
      `SELECT count(*) AS new_users,
       count(*) FILTER (WHERE (SELECT count(*) FROM survey_submission s WHERE s.user_id = x.user_id AND s.status = 'completed') >= 2) AS repeaters,
       round(100.0 * count(*) FILTER (WHERE (SELECT count(*) FROM survey_submission s WHERE s.user_id = x.user_id AND s.status = 'completed') >= 2)
             / nullif(count(*), 0), 1) AS repeat_pct
  FROM firsts x`
    ),
    related: ["traffic.apu", "traffic.crossSell"],
  },
  "traffic.crossSell": {
    label: "Cross-sell rate",
    what: "Of a source's new users, the share who have bought twice or more (another report, or an upgrade), ever.",
    good: "up",
    stat: "Share",
    per: "per new user",
    formula: ratio("New users with 2 or more sales kept (not refunded)", "New users", "× 100"),
    caveat: "Every sale of their reports counts, whenever it was made; refunded ones don't.",
    tables: [T.subs("user_id"), T.pay("status, refund_amount, amount, is_test")],
    query: sql(
      [FINISHERS, COHORT],
      `SELECT count(*) AS new_users,
       count(*) FILTER (WHERE (SELECT count(*) FROM cohort_pays c WHERE c.user_id = x.user_id AND NOT c.refunded) >= 2) AS cross_sold,
       round(100.0 * count(*) FILTER (WHERE (SELECT count(*) FROM cohort_pays c WHERE c.user_id = x.user_id AND NOT c.refunded) >= 2)
             / nullif(count(*), 0), 1) AS cross_sell_pct
  FROM firsts x`
    ),
    related: ["traffic.repeat", "traffic.clv"],
  },
  "traffic.cohortRefund": {
    label: "Refund rate",
    what: "Of all the sales a source's new users made, the share refunded (in full or in part).",
    good: "down",
    stat: "Share",
    per: "per sale",
    formula: ratio("Their refunded sales", "All their sales, all time", "× 100"),
    caveat:
      "New users only (the Performance table's refund rate counts every finisher's person). Blank while they have no sale.",
    tables: [T.subs("user_id"), T.pay("status, refund_amount, amount, is_test")],
    query: sql(
      [FINISHERS, COHORT],
      `SELECT count(*) FILTER (WHERE refunded) AS refunded, count(*) AS sales,
       round(100.0 * count(*) FILTER (WHERE refunded) / nullif(count(*), 0), 1) AS refund_rate_pct
  FROM cohort_pays`
    ),
    related: ["traffic.refundRate", "traffic.crossSell"],
  },
  // ---- Experiments (each arm in its test's window)
  "traffic.expVisitors": {
    label: "Visitors",
    what: "How many visitors each landing version had while its test ran: the visit log records the version each visitor saw.",
    stat: "Count",
    per: "per visitor (one per browser per day)",
    formula: { num: "Visits of the arm's landing version in the test's window" },
    caveat:
      "The landing test only: pricing and the email question are dealt after the visit (at the report, in the survey), so they have no visitors. The window starts on the test's first whole day.",
    tables: [T.visits()],
    query: EXP_TABLE,
    related: ["traffic.expStartCvr", "traffic.lift"],
  },
  "traffic.expStartCvr": {
    label: "Start CVR",
    what: "Of an arm's visitors, the share who began the survey: the landing test's primary metric.",
    good: "up",
    stat: "Share",
    per: "per visitor",
    formula: ratio("Survey starts of the arm's version", "The arm's visitors", "× 100"),
    caveat:
      "A start keeps its landing version only while its draft does (30 days) and from 20 Sep 2026, so older windows are blank.",
    tables: [T.starts(), T.visits()],
    query: EXP_TABLE,
    related: ["traffic.expVisitors", "traffic.lift", "traffic.startCvr"],
  },
  "traffic.expSubmissions": {
    label: "Submissions",
    what: "How many surveys each arm's people finished while its test ran.",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Finished surveys of the arm in the test's window" },
    caveat:
      "The landing version and the email arm are the ones the finisher's link tags kept; the price arm is the one their first price quote was dealt, for those who finished after Pricing 3.0 restarted (8 Oct 2026, 17:23).",
    tables: [
      T.subs(),
      {
        source: "production",
        table: "report_price_quote",
        columns: "survey_submission_id, experiment_group, created_date_time",
        filters: "Through the finisher it belongs to.",
      },
    ],
    query: EXP_TABLE,
    related: ["traffic.expPaymentCvr", "traffic.expRevPerSub"],
  },
  "traffic.expPaymentCvr": {
    label: "Payment CVR",
    what: "Of an arm's finishers, the share who bought (so far): Pricing 3.0's primary metric.",
    good: "up",
    stat: "Share",
    per: "per finished survey",
    formula: ratio("The arm's finishers who paid, so far", "The arm's finished surveys", "× 100"),
    caveat: SO_FAR,
    tables: [T.subs(), T.pay()],
    query: EXP_TABLE,
    related: ["traffic.expSubmissions", "traffic.purchaseCvr"],
  },
  "traffic.expRevPerSub": {
    label: "Rev. / submission",
    what: "What each of an arm's finishers paid on average so far, those who bought nothing included.",
    good: "up",
    stat: "Average (ratio of sums)",
    per: "per finished survey",
    formula: ratio("Revenue of the arm's finishers, so far", "The arm's finished surveys"),
    caveat: SO_FAR,
    tables: [T.subs(), T.pay()],
    query: EXP_TABLE,
    related: ["traffic.expPaymentCvr", "traffic.revPerUser"],
  },
  "traffic.expRevPerVisitor": {
    label: "Rev. / visitor",
    what: "What a landing version's finishers paid so far, spread over the version's visitors.",
    good: "up",
    stat: "Average (ratio of sums)",
    per: "per visitor",
    formula: ratio("Revenue of the arm's finishers, so far", "The arm's visitors"),
    caveat: `The landing test only (the others have no visitors). ${SO_FAR}`,
    tables: [T.subs(), T.pay(), T.visits()],
    query: EXP_TABLE,
    related: ["traffic.expVisitors", "traffic.rpv"],
  },
  "traffic.lift": {
    label: "Lift vs control",
    what: "How much better (or worse) an arm does than its control on the test's primary metric: +10% means its rate is a tenth higher.",
    good: "up",
    stat: "Ratio (relative difference)",
    per: "per arm, on the test's primary metric",
    formula: ratio("The arm's rate", "The control's rate", "− 1, × 100"),
    caveat:
      "Primary metrics: start CVR (landing), payment CVR (pricing), finishing after the email question (email, of the runs that reached it). A lift with low confidence can be chance.",
    tables: [T.starts(), T.subs(), T.visits()],
    query: EXP_STATS,
    related: ["traffic.chance", "traffic.confidence"],
  },
  "traffic.chance": {
    label: "Chance to beat",
    what: "How likely the arm is truly better than its control, on the test's primary metric: 50% is a coin toss.",
    good: "up",
    stat: "Probability",
    per: "per arm",
    formula: {
      num: "The normal curve at z = (arm's rate − control's) ÷ the pooled standard error",
    },
    caveat:
      'A two-proportion test on the counts so far. Blank ("too few to call") while the two arms have fewer than 50 people together, or a cell has under 5 successes or failures, as Pricing 3.0 has.',
    tables: [T.starts(), T.subs(), T.visits()],
    query: EXP_STATS,
    related: ["traffic.lift", "traffic.confidence"],
  },
  "traffic.confidence": {
    label: "Confidence",
    what: "How sure we can be that the difference isn't chance: 95% or more counts as a credible result.",
    good: "up",
    stat: "Probability (1 − p)",
    per: "per arm",
    formula: { num: "1 − the two-sided p-value of the pooled two-proportion test" },
    caveat:
      'Low until the arms have many people: read the lift as a hint, not a result, below 95%. Blank ("too few to call") while the two arms have fewer than 50 people together, or a cell has under 5 successes or failures.',
    tables: [T.starts(), T.subs(), T.visits()],
    query: EXP_STATS,
    related: ["traffic.lift", "traffic.chance"],
  },
  // ---- Audience by source
  "traffic.audCountry": {
    label: "Country · all sources",
    what: "Where the range's visitors were, as shares of all visitors, largest first: the countries the traffic comes from.",
    stat: "Share (estimated)",
    per: "per visitor",
    formula: ratio("A country's estimated visitors", "All visitors", "× 100"),
    caveat: `${STRATIFIED} The country is PostHog's (from the visitor's network address): PostHog's twelve most common are read, the six with the largest shares named, the rest under Other.`,
    tables: [
      T.posthog("$session_id, $geoip_country_code, $current_url, $referring_domain"),
      T.visits(),
    ],
    query: hogBy(
      `if(coalesce(country, '') = '', '', if(country IN (SELECT country FROM (${FIRST_VIEWS}) WHERE country != '' GROUP BY country ORDER BY count() DESC LIMIT 12), country, 'Other'))`,
      "PostHog's visits by what their first page carried and by country (its 12 most common named)."
    ),
    related: ["traffic.audVisitsBySource", "traffic.audCompleteRate", "traffic.visitors"],
  },
  "traffic.audDevice": {
    label: "Device · all sources",
    what: "The range's visitors by the kind of device they used, as shares of all visitors.",
    stat: "Share (estimated)",
    per: "per visitor",
    formula: ratio("A device's estimated visitors", "All visitors", "× 100"),
    caveat: `${STRATIFIED} PostHog counts an iPad as a desktop (it presents itself as a Mac), so tablets read low.`,
    tables: [T.posthog("$session_id, $device_type, $current_url, $referring_domain"), T.visits()],
    query: hogBy(
      "coalesce(device, '')",
      "PostHog's visits by what their first page carried and by device."
    ),
    related: ["traffic.audVisitsBySource", "traffic.audCompleteRate"],
  },
  "traffic.audVisitor": {
    label: "New vs returning · all sources",
    what: "The range's visitors split into new and returning, as shares of all visitors.",
    stat: "Share (estimated)",
    per: "per visitor",
    formula: ratio("New (or returning) visitors, estimated", "All visitors", "× 100"),
    caveat: `${STRATIFIED} Returning: PostHog saw the person more than half an hour before this visit (it began recording on 23 Aug 2026, so early visits read new).`,
    tables: [
      T.posthog("$session_id, person_id, timestamp, $current_url, $referring_domain"),
      T.visits(),
    ],
    query: hogBy(
      "if(isNull(f.first_seen), '', if(f.first_seen < first_ts - INTERVAL 30 MINUTE, 'returning', 'new'))",
      "PostHog's visits by what their first page carried and whether PostHog had seen the person over 30 minutes before.",
      `(${FIRST_VIEWS}) v
          LEFT JOIN (SELECT person_id, min(timestamp) AS first_seen FROM events
                      WHERE properties.$host = 'www.loveiq.org'
                        AND timestamp >= toDateTime('2026-08-23 00:00:00', 'UTC')
                      GROUP BY person_id) f ON f.person_id = v.pid`
    ),
    related: ["traffic.audVisitsBySource", "traffic.audCompleteRate"],
  },
  "traffic.audDaypart": {
    label: "Time of day · all sources",
    what: "When in their own day the range's visitors came: morning, afternoon, evening or night where they were.",
    stat: "Share (estimated)",
    per: "per visitor",
    formula: ratio("Visitors in that part of their day, estimated", "All visitors", "× 100"),
    caveat: `${STRATIFIED} The local hour is the visit's start in the browser's own time zone; the finishers' local time isn't kept, so this group has no complete, unlock or reading rates.`,
    tables: [
      T.posthog("$session_id, timestamp, $timezone_offset, $current_url, $referring_domain"),
      T.visits(),
    ],
    query: hogBy(
      "if(isNull(tz_offset), '', multiIf(h < 6, 'Night', h < 12, 'Morning', h < 18, 'Afternoon', 'Evening'))",
      "PostHog's visits by what their first page carried and by the hour where the visitor was (UTC − the browser's offset).",
      `(SELECT *, toHour(toTimeZone(first_ts, 'UTC') - toIntervalMinute(toInt(tz_offset))) AS h
                  FROM (${FIRST_VIEWS}))`
    ),
    related: ["traffic.audVisitsBySource"],
  },
  "traffic.audGender": {
    label: "Gender · all sources",
    what: "The range's finishers by the gender they gave in the survey, as shares of all finishers.",
    stat: "Share",
    per: "per finished survey",
    formula: ratio("Finishers who gave that answer", "Finished surveys", "× 100"),
    caveat: `Question 15010; their profile's answer where the survey recorded none. "Other / not shown" holds Other, "I'd rather not label this" and no answer. ${STAFF}`,
    tables: [
      T.answers("survey_question_id (15010), answer_option_id → option_text"),
      T.subs("user_id (→ user_profile.gender)"),
    ],
    query: shares(
      [],
      `CASE WHEN g IN ('Woman', 'Man') THEN g WHEN g ~* '^non-?binary$' THEN 'Non-binary'
                       ELSE 'Other / not shown' END`,
      `${PROFILE_JOIN},
               LATERAL (SELECT coalesce(${ANSWER("15010", "up.gender")}) AS g) a`
    ),
    related: ["traffic.audFinishersBySource", "traffic.audAge"],
  },
  "traffic.audAge": {
    label: "Age · all sources",
    what: "The range's finishers by the age band they gave in the survey, as shares of all finishers.",
    stat: "Share",
    per: "per finished survey",
    formula: ratio("Finishers in that age band", "Finished surveys", "× 100"),
    caveat: `Question 15003 (the latest answer where there are two). "Not shown": no answer. ${STAFF}`,
    tables: [T.answers("survey_question_id (15003), answer_option_id → option_text")],
    query: shares(
      [],
      `coalesce((SELECT ao.option_text FROM survey_submission_answer a
                    JOIN survey_question sq ON sq.id = a.survey_question_id AND sq.frontend_qid = '15003'
                    JOIN answer_option ao ON ao.id = a.answer_option_id
                   WHERE a.survey_submission_id = f.id ORDER BY a.id DESC LIMIT 1), 'Not shown')`
    ),
    related: ["traffic.audFinishersBySource", "traffic.audGender"],
  },
  "traffic.audRelationship": {
    label: "Relationship · all sources",
    what: "The range's finishers by the relationship they said they are in, as shares of all finishers.",
    stat: "Share",
    per: "per finished survey",
    formula: ratio("Finishers who gave that answer", "Finished surveys", "× 100"),
    caveat: `Question 15004 in short words (the old "Monogamous" wording kept apart); their profile's answer where the survey recorded none. ${STAFF}`,
    tables: [
      T.answers("survey_question_id (15004), answer_option_id → option_text"),
      T.subs("user_id (→ user_profile.relationship_status)"),
    ],
    query: shares(
      [],
      `CASE WHEN r IS NULL THEN 'Not stated'
                       WHEN r ~* '^single' THEN 'Single'
                       WHEN r ~* 'mostly exclusive' THEN 'Mostly exclusive'
                       WHEN r ~* 'one exclusive|exclusive relationship' THEN 'Exclusive relationship'
                       WHEN r ~* 'figuring|doesn.t fit' THEN 'Figuring it out'
                       WHEN r ~* 'polyamor' THEN 'Polyamorous'
                       WHEN r ~* '''open''|non-exclusive' THEN 'Open'
                       WHEN r ~* 'independence|multiple connections' THEN 'Multiple, independent'
                       WHEN r ~* 'monogam' THEN 'Monogamous (old wording)'
                       ELSE r END`,
      `${PROFILE_JOIN},
               LATERAL (SELECT coalesce(${ANSWER("15004", "up.relationship_status")}) AS r) a`
    ),
    related: ["traffic.audFinishersBySource"],
  },
  "traffic.audArchetype": {
    label: "Archetype · all sources",
    what: "The range's finishers by the archetype their report gave them, as shares of all finishers.",
    stat: "Share",
    per: "per finished survey",
    formula: ratio("Finishers with that archetype", "Finished surveys", "× 100"),
    caveat: `The report's result (the newer scoring where there is one). The eight largest are named, the rest under Other. ${STAFF}`,
    tables: [
      {
        source: "production",
        table: "scoring_result",
        columns: "survey_submission_id, v5_primary_archetype, primary_archetype",
        filters: "Through the finished survey it scores.",
      },
    ],
    query: shares(
      [],
      `coalesce((SELECT coalesce(sr.v5_primary_archetype, sr.primary_archetype) FROM scoring_result sr
                   WHERE sr.survey_submission_id = f.id ORDER BY sr.id DESC LIMIT 1), 'Not scored')`
    ),
    related: ["traffic.audFinishersBySource"],
  },
  "traffic.audVisitsBySource": {
    label: "Share of each source's people (visits)",
    what: "Each source's own visits split by the group (country, device …), so sources can be compared: green over-represented against all sources, red under-represented.",
    stat: "Share",
    per: "per visit PostHog recorded",
    formula: ratio("The source's PostHog visits in the group", "All its PostHog visits", "× 100"),
    caveat:
      "PostHog's own visits of each source (under the column its count of them), sorted into sources by our own rules: a sample, small for every source but Google Ads.",
    tables: [
      T.posthog(
        "$session_id, $current_url (utm tags, click ids), $referring_domain, $geoip_country_code, $device_type"
      ),
    ],
    query: hogBy(
      `if(coalesce(country, '') = '', '', if(country IN (SELECT country FROM (${FIRST_VIEWS}) WHERE country != '' GROUP BY country ORDER BY count() DESC LIMIT 12), country, 'Other'))`,
      "As Country · all sources reads them: each source's own rows give its column (Google Ads: ads = 1)."
    ),
    related: ["traffic.audCountry", "traffic.audDevice"],
  },
  "traffic.audFinishersBySource": {
    label: "Share of each source's people (finishers)",
    what: "Each source's own finishers split by their survey answer, so sources can be compared: green over-represented against all sources, red under-represented.",
    stat: "Share",
    per: "per finished survey",
    formula: ratio("The source's finishers who gave the answer", "All its finishers", "× 100"),
    caveat: `A finisher's source is the one their link tags name (Google Ads: a Google click id, or google with a paid medium). The query is the Gender column of Google Ads. ${STAFF}`,
    tables: [T.subs(), T.answers("survey_question_id (15010), option_text")],
    query: shares(
      [],
      `CASE WHEN g IN ('Woman', 'Man') THEN g WHEN g ~* '^non-?binary$' THEN 'Non-binary'
                       ELSE 'Other / not shown' END`,
      `${PROFILE_JOIN},
               LATERAL (SELECT coalesce(${ANSWER("15010", "up.gender")}) AS g) a
         WHERE coalesce(f.j->>'gclid', '') <> '' OR coalesce(f.j->>'gbraid', '') <> '' OR coalesce(f.j->>'wbraid', '') <> ''
            OR (lower(f.j->>'utm_source') = 'google' AND lower(f.j->>'utm_medium') IN ('cpc', 'ppc', 'paid', 'ads'))`
    ),
    related: ["traffic.audGender", "traffic.audAge"],
  },
  "traffic.audCompleteRate": {
    label: "Complete rate",
    what: "Of a group's visitors (a country, a device, new or returning), the share who finished the survey.",
    good: "up",
    stat: "Share (estimated)",
    per: "per visitor",
    formula: ratio("The group's finished surveys", "The group's estimated visitors", "× 100"),
    caveat:
      "The two sides are grouped differently: finishers by their own answers (the country they named, the device of their price quote or survey steps), visitors by PostHog (where it places the visit, the device it reports), so a group can read high or low (Bosnia's 0.5%: 3 finishers named it, PostHog placed about 587 visits there, many the team's). The visitors are the group's estimate (each source's PostHog split applied to its own visitors). Blank for tablets (PostHog counts an iPad as a desktop, the survey as a tablet), the time of day (the finishers' local time isn't kept) and every survey group (only finishers answered).",
    tables: [
      T.subs("price quote's or survey steps' device"),
      T.posthog("$session_id, $device_type, $geoip_country_code"),
    ],
    query: sql(
      [FINISHERS, DEVICE],
      `-- The numerator for Device: finishers by device (iOS and Android are Mobile); the
-- denominators are the groups' visitors, as Device · all sources' query estimates them.
SELECT CASE WHEN device IN ('iOS', 'Android') THEN 'Mobile' WHEN device = 'Desktop' THEN 'Desktop'
            WHEN device = 'Tablet' THEN 'Tablet' ELSE 'Not recorded' END AS device, count(*) AS finishers
  FROM devices GROUP BY 1 ORDER BY 2 DESC`
    ),
    related: ["traffic.audDevice", "traffic.audCountry", "traffic.submitCvr"],
  },
  // ---- Cost vs quality (Google Ads campaigns)
  "traffic.qualityX": {
    label: "Cost per click",
    what: "Across: what a click on each Google Ads campaign cost on average. Further right is dearer.",
    good: "down",
    stat: "Average (ratio of sums)",
    per: "per ad click",
    formula: ratio("The campaign's cost", "The campaign's clicks"),
    caveat:
      "The Ads API's own cost and clicks per campaign; campaigns without a click in the range aren't drawn.",
    tables: [T.ads("date, campaign_name, cost_eur, clicks")],
    query: {
      lang: "GAQL",
      text: `SELECT campaign.name, metrics.cost_micros, metrics.clicks
  FROM campaign
 WHERE segments.date BETWEEN :from AND :to`,
    },
    related: ["traffic.cpc", "traffic.qualityY"],
  },
  "traffic.qualityY": {
    label: "Click → paid conversion",
    what: "Up: of each campaign's clicks, the share that ended in a purchase. Higher up means the campaign's clicks buy; the curves join campaigns of equal CAC.",
    good: "up",
    stat: "Share",
    per: "per ad click",
    formula: ratio(
      "Buyers whose link named the campaign, so far",
      "The campaign's clicks",
      "× 100"
    ),
    caveat: `${SO_FAR} A finisher is tied to the campaign their link named (utm_campaign, on every click from 27 Aug 2026); those with no campaign tag are in no dot (the note under the chart counts them).`,
    tables: [
      T.subs("utm_tracker (gclid, utm_campaign)"),
      T.pay(),
      T.ads("date, campaign_name, clicks"),
    ],
    query: sql(
      [FINISHERS, SALES],
      `-- Google Ads finishers and buyers by the campaign their link named (the clicks: Cost per
-- click's query).
SELECT lower(f.j->>'utm_campaign') AS campaign, count(DISTINCT f.id) AS finished_surveys,
       count(DISTINCT x.sid) AS buyers
  FROM finishers f LEFT JOIN sales x ON x.sid = f.id
 WHERE coalesce(f.j->>'gclid', '') <> '' OR coalesce(f.j->>'gbraid', '') <> '' OR coalesce(f.j->>'wbraid', '') <> ''
    OR (lower(f.j->>'utm_source') = 'google' AND lower(f.j->>'utm_medium') IN ('cpc', 'ppc', 'paid', 'ads'))
 GROUP BY 1 ORDER BY 2 DESC`
    ),
    related: ["traffic.qualityX", "traffic.cac", "traffic.clickToPaid"],
  },
};
