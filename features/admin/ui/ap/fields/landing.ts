/**
 * The Landing page's fields (Assessment A): its six headline tiles, the tests table's columns
 * and the engagement table's. Each query was run read-only for 21 Sep – 20 Oct 2026 and gave the
 * page's own figures at "Last 30 days" (checked 21 Oct 2026). SQL reads the production database,
 * HogQL PostHog; `:from` and `:to` are the first and last Berlin day.
 */
import { addDays } from "@features/admin/server/ap/days";
import {
  LANDING_HERO_VIDEO_LAUNCH_DAY,
  LANDING_TEST_START_DAY,
} from "@shared/experiments/landingVariant";

import type { FieldDef, FieldRegistry, FieldTable } from "./types";

/** Our own test runs, by their links' tags: never counted. */
const PROBES = "('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')";

const STAFF = `staff AS (                 -- the team's accounts
  SELECT id FROM ap_team_user
)`;

const TEAM_NETWORKS = `team_networks AS (         -- the networks the team's own finished surveys came from
  SELECT e.client_ip FROM survey_behavior_event e
    JOIN survey_submission s ON s.session_id = e.session_id
   WHERE s.user_id IN (SELECT id FROM staff) AND e.client_ip IS NOT NULL
  UNION
  SELECT d.client_ip FROM survey_partial_save d
    JOIN survey_submission s ON s.session_id = d.session_id
   WHERE s.user_id IN (SELECT id FROM staff) AND d.client_ip IS NOT NULL
)`;

const STARTS = `signs AS (                 -- every record of a survey run: its steps, drafts and submission
  SELECT session_id, created_at AS at, (answered OR direction = 'complete') AS answered,
         client_ip IN (SELECT client_ip FROM team_networks) AS team_network,
         NULL::text AS tracker, NULL::timestamptz AS saved_at, false AS finished,
         NULL::bigint AS user_id
    FROM survey_behavior_event
  UNION ALL
  SELECT session_id, started_at, current_index >= 1,
         client_ip IN (SELECT client_ip FROM team_networks),
         utm_tracker, saved_at, false, NULL
    FROM survey_partial_save
  UNION ALL
  SELECT session_id, start_date_time, status = 'completed', false,
         utm_tracker, 'infinity', status = 'completed', user_id
    FROM survey_submission
),
runs AS (                  -- one row per survey run
  SELECT session_id,
         min(at) AS started_at,                 -- its first record
         bool_or(answered) AS answered,         -- got past question 1
         bool_or(finished) AS finished,
         bool_or(team_network) AS team_network,
         bool_or(user_id IN (SELECT id FROM staff)) AS team_user,
         -- its link's tags and landing version: the submission's, else the latest draft's
         (array_agg(CASE WHEN pg_input_is_valid(tracker, 'jsonb') THEN tracker::jsonb END
                    ORDER BY saved_at DESC NULLS LAST)
            FILTER (WHERE tracker IS NOT NULL))[1] AS tags
    FROM signs
   WHERE session_id IS NOT NULL
   GROUP BY session_id
),
starts AS (                -- survey starts, by the Berlin day they began
  SELECT (started_at AT TIME ZONE 'Europe/Berlin')::date AS day,
         tags->>'landing_variant' AS version
    FROM runs
   WHERE answered
     AND NOT coalesce(team_user, false)
     -- an unfinished run from the team's networks is the team testing
     AND (finished OR NOT coalesce(team_network, false))
     AND coalesce(lower(trim(tags->>'utm_source')), '') NOT IN ${PROBES}
     AND coalesce(lower(trim(tags->>'utm_medium')), '') <> 'probe'
)`;

const FINISHED = `finished AS (              -- finished surveys, by the Berlin day they were submitted
  SELECT s.id, (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day,
         t.tags->>'landing_variant' AS version
    FROM survey_submission s
   CROSS JOIN LATERAL (SELECT CASE WHEN pg_input_is_valid(s.utm_tracker, 'jsonb')
                                   THEN s.utm_tracker::jsonb END AS tags) t
   WHERE s.status = 'completed'
     AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
     AND coalesce(lower(trim(t.tags->>'utm_source')), '') NOT IN ${PROBES}
     AND coalesce(lower(trim(t.tags->>'utm_medium')), '') <> 'probe'
)`;

const VISITS = `visits AS (                -- our visit log: one row per browser per day, on any page
  SELECT landing_variant AS version
    FROM funnel_event
   WHERE event_type = 'unique_visitor' AND coalesce(landing_variant, '') <> 'pay_to_start'
     AND day BETWEEN :from AND :to
     AND coalesce(lower(trim(utm_source)), '') NOT IN ${PROBES}
)`;

const PAID = `paid AS (                  -- each finished survey's sales so far, on any day
  SELECT pr.survey_submission_id AS id, sum(p.amount) AS eur,
         -- a full unlock: Full, Full All or Core
         bool_or(p.metadata->>'plan' IN ('full_report', 'all_reports', 'core')) AS full_unlock,
         -- a pre-unlock: the EUR 1.99 Core Archetype (plan 'initial')
         bool_or(p.metadata->>'plan' = 'initial') AS pre_unlock
    FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
   WHERE p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
   GROUP BY 1
)`;

const SALES = `sales AS (                 -- sales paid in the range, by the Berlin day of payment
  SELECT p.amount
    FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
    JOIN finished f ON f.id = pr.survey_submission_id
   WHERE p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
     AND (coalesce(p.payment_date_time, p.created_date_time) AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
)`;

const Q_START_CVR = `-- Survey start CVR: survey starts ÷ visits
WITH ${STAFF},
${TEAM_NETWORKS},
${STARTS},
${VISITS}
SELECT s.n AS survey_starts, v.n AS visits,
       round(100.0 * s.n / nullif(v.n, 0), 2) AS start_cvr_pct
  FROM (SELECT count(*) AS n FROM starts WHERE day BETWEEN :from AND :to) s,
       (SELECT count(*) AS n FROM visits) v;`;

const Q_COMPLETE_CVR = `-- Survey complete CVR: finished surveys ÷ survey starts
WITH ${STAFF},
${TEAM_NETWORKS},
${STARTS},
${FINISHED}
SELECT f.n AS finished_surveys, s.n AS survey_starts,
       round(100.0 * f.n / nullif(s.n, 0), 1) AS complete_cvr_pct
  FROM (SELECT count(*) AS n FROM finished WHERE day BETWEEN :from AND :to) f,
       (SELECT count(*) AS n FROM starts WHERE day BETWEEN :from AND :to) s;`;

const Q_PRE_CVR = `-- Pre-unlock CVR: the range's finished surveys whose Core Archetype was pre-unlocked (EUR 1.99
-- paid, plan 'initial') so far ÷ all of them. Blank before 23 Oct 2026, its first whole day on sale.
WITH ${STAFF},
${FINISHED},
pre AS (
  SELECT DISTINCT pr.survey_submission_id AS id
    FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
   WHERE p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
     AND p.metadata->>'plan' = 'initial'
)
SELECT count(*) FILTER (WHERE x.id IS NOT NULL) AS pre_unlocked,
       count(*) AS finished_surveys,
       -- Blank for a range starting before 23 Oct 2026: nobody could pre-unlock its first days.
       CASE WHEN :from >= DATE '2026-10-23'
            THEN round(100.0 * count(*) FILTER (WHERE x.id IS NOT NULL) / nullif(count(*), 0), 2) END
         AS pre_unlock_cvr_pct
  FROM finished f
  LEFT JOIN pre x ON x.id = f.id
 WHERE f.day BETWEEN :from AND :to;`;

const Q_FULL_CVR = `-- Full-unlock CVR: the range's finished surveys with a full unlock bought so far ÷ all of them
WITH ${STAFF},
${FINISHED},
${PAID}
SELECT count(*) FILTER (WHERE p.full_unlock) AS full_unlock_buyers,
       count(*) AS finished_surveys,
       round(100.0 * count(*) FILTER (WHERE p.full_unlock) / nullif(count(*), 0), 2)
         AS full_unlock_cvr_pct
  FROM finished f
  LEFT JOIN paid p ON p.id = f.id
 WHERE f.day BETWEEN :from AND :to;`;

const Q_REV_VISIT = `-- Revenue / visitor: sales paid in the range ÷ visits
WITH ${STAFF},
${FINISHED},
${SALES},
${VISITS}
SELECT r.eur AS revenue, v.n AS visits, round(r.eur / nullif(v.n, 0), 4) AS revenue_per_visit
  FROM (SELECT coalesce(sum(amount), 0) AS eur FROM sales) r,
       (SELECT count(*) AS n FROM visits) v;`;

const Q_REV_SUB = `-- Revenue / survey complete: sales paid in the range ÷ finished surveys
WITH ${STAFF},
${FINISHED},
${SALES}
SELECT r.eur AS revenue, f.n AS finished_surveys,
       round(r.eur / nullif(f.n, 0), 2) AS revenue_per_finished_survey
  FROM (SELECT coalesce(sum(amount), 0) AS eur FROM sales) r,
       (SELECT count(*) AS n FROM finished WHERE day BETWEEN :from AND :to) f;`;

const Q_ARMS = `-- Each version of the landing test per run, over the run's days inside the range (one table
-- row each). A is the question card (white_card), B the presenter video (white_video).
WITH ${STAFF},
${TEAM_NETWORKS},
${STARTS},
${FINISHED},
${PAID},
test_runs AS (             -- the test's runs and their days inside the range; the running one to today
  SELECT run, greatest(r_from, :from) AS r_from, least(r_to, :to) AS r_to
    FROM (VALUES ('run 2', DATE '${LANDING_TEST_START_DAY}', (now() AT TIME ZONE 'Europe/Berlin')::date),
                 ('run 1', DATE '${LANDING_HERO_VIDEO_LAUNCH_DAY}', DATE '${addDays(LANDING_TEST_START_DAY, -1)}'))
         AS t(run, r_from, r_to)
),
day_visits AS (            -- our visit log: one row per browser per day, on any page
  SELECT day, landing_variant AS version
    FROM funnel_event
   WHERE event_type = 'unique_visitor' AND coalesce(landing_variant, '') <> 'pay_to_start'
     AND coalesce(lower(trim(utm_source)), '') NOT IN ${PROBES}
)
SELECT r.run, r.r_from AS first_day, r.r_to AS last_day, a.version,
       v.n AS visits,
       s.n AS survey_starts,
       round(100.0 * s.n / nullif(v.n, 0), 1) AS start_cvr_pct,
       f.n AS finished_surveys,
       round(100.0 * f.n / nullif(v.n, 0), 1) AS submit_cvr_pct,
       -- blank for a run whose days here reach back before 23 Oct 2026 (the EUR 1.99 on sale)
       CASE WHEN r.r_from >= DATE '2026-10-23' THEN f.pre_unlocks END AS pre_unlocks,
       CASE WHEN r.r_from >= DATE '2026-10-23'
            THEN round(100.0 * f.pre_unlocks / nullif(v.n, 0), 2) END AS pre_unlock_cvr_pct,
       f.full_unlocks,
       round(100.0 * f.full_unlocks / nullif(v.n, 0), 2) AS full_unlock_cvr_pct,
       f.eur AS revenue,
       round(f.eur / nullif(v.n, 0), 3) AS eur_per_visit
  FROM test_runs r
 CROSS JOIN (VALUES ('white_card'), ('white_video')) a(version)
 CROSS JOIN LATERAL (SELECT count(*) AS n FROM day_visits
                      WHERE version = a.version AND day BETWEEN r.r_from AND r.r_to) v
 CROSS JOIN LATERAL (SELECT count(*) AS n FROM starts
                      WHERE version = a.version AND day BETWEEN r.r_from AND r.r_to) s
 CROSS JOIN LATERAL (SELECT count(*) AS n, count(*) FILTER (WHERE p.full_unlock) AS full_unlocks,
                            count(*) FILTER (WHERE p.pre_unlock) AS pre_unlocks,
                            coalesce(sum(p.eur), 0) AS eur
                       FROM finished x LEFT JOIN paid p ON p.id = x.id
                      WHERE x.version = a.version AND x.day BETWEEN r.r_from AND r.r_to) f
 WHERE r.r_from <= r.r_to
 ORDER BY r.r_from DESC, a.version;`;

/** The pay-to-start pages' steps, as the Pay to start page counts them (its Step by step card). */
const Q_PAY_FIRST = `-- Each pay-to-start page's steps over the range, as the Pay to start page counts them, a row
-- each: 'full' (/sexual-archetype, €29.99) and 'pre' (/sexual-archetype/initial, €1.99). Test
-- purchases, the team's and our own probes are left out. The pages went live on 22 Oct 2026: a
-- range ending before has no row.
WITH b AS (
  SELECT (:from::date::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
         ((:to::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
),
pages (offer, page) AS (VALUES ('full', '/sexual-archetype · €29.99'),
                               ('pre', '/sexual-archetype/initial · €1.99')),
buy AS (
  SELECT p.* FROM prepaid_report_access p
   WHERE p.offer IN ('full', 'pre') AND NOT coalesce(p.is_test, false)
     AND NOT coalesce(p.customer_email ~* '@loveiq\\.org$', false)
     AND coalesce(lower(trim(CASE WHEN pg_input_is_valid(p.utm_tracker, 'jsonb')
                                  THEN p.utm_tracker::jsonb->>'utm_source' END)), '') NOT IN ${PROBES}
     AND NOT EXISTS (SELECT 1 FROM survey_submission s JOIN ap_team_user t ON t.id = s.user_id
                      WHERE s.id = p.consumed_submission_id)
)
SELECT pg.page,
  -- the page's visitors, counted apart by page from 24 Oct 2026
  (SELECT count(*) FROM funnel_event
    WHERE event_type = 'unique_visitor' AND landing_variant = 'pay_to_start' AND offer = pg.offer
      AND day BETWEEN :from AND :to
      AND coalesce(lower(trim(utm_source)), '') NOT IN ${PROBES}) AS visitors,
  -- a checkout opened, or paid, in the range
  (SELECT count(*) FROM buy, b
    WHERE buy.offer = pg.offer
      AND ((buy.created_at >= b.since_ts AND buy.created_at < b.until_ts)
           OR (buy.paid_at >= b.since_ts AND buy.paid_at < b.until_ts))) AS started_checkout,
  -- paid more than EUR 0 in the range, and kept (not refunded)
  (SELECT count(*) FROM buy, b
    WHERE buy.offer = pg.offer AND buy.paid_at >= b.since_ts AND buy.paid_at < b.until_ts
      AND buy.status = 'succeeded' AND coalesce(buy.amount_cents, 0) > 0) AS paid,
  -- every purchase completed in the range (a 100% code's EUR 0 one too) whose survey was finished
  (SELECT count(*) FROM buy
     JOIN survey_submission s ON s.id = buy.consumed_submission_id AND s.status = 'completed', b
    WHERE buy.offer = pg.offer AND buy.paid_at >= b.since_ts AND buy.paid_at < b.until_ts
      AND buy.status IN ('succeeded', 'refunded')) AS finished_survey
  FROM pages pg
 WHERE :to >= DATE '2026-10-22'
 ORDER BY pg.offer;`;

const T_PREPAID: FieldTable = {
  source: "production",
  table: "prepaid_report_access",
  columns:
    "offer, status, amount_cents, created_at, paid_at, consumed_submission_id, is_test, customer_email, utm_tracker",
  filters: "Period (created_at, paid_at; Berlin days). Nothing else: all traffic.",
  watch:
    "A checkout left unpaid is bound to the survey too: only a completed purchase (paid, kept or refunded) is a buyer.",
};
const T_PTS_VISITS: FieldTable = {
  source: "production",
  table: "funnel_event",
  columns:
    "event_type (unique_visitor), landing_variant ('pay_to_start'), offer ('full' or 'pre'), day, utm_source",
  filters: "Period, by day (Berlin). Nothing else: all traffic.",
  watch:
    "The two pages are counted apart from 24 Oct 2026 (offer); earlier visits to them are in neither page's figure, and an offer that sold on such a day has no rate per visit.",
};

/** PostHog's range and the team left out, as every PostHog figure on the page reads them. */
const PH_RANGE = `properties.$host = 'www.loveiq.org'
    AND timestamp >= toDateTime(':from 00:00:00', 'Europe/Berlin')
    AND timestamp < toDateTime(':to 00:00:00', 'Europe/Berlin') + INTERVAL 1 DAY
    AND person_id NOT IN (SELECT person_id FROM events WHERE $session_id IN :team_visits)`;

/** A PostHog row's version: each run of the landing test's own, by the day it happened. */
const PH_RUN = (
  at: string
) => `multiIf(${at} >= toDateTime('${LANDING_TEST_START_DAY}', 'Europe/Berlin'), 'run 2',
                    ${at} >= toDateTime('${LANDING_HERO_VIDEO_LAUNCH_DAY}', 'Europe/Berlin'), 'run 1', '')`;
const PH_VERSION = `arrayJoin([if(arm IN ('white_card', 'white_video') AND run != '',
                          concat(run, ' · ', arm), ''), 'All landing pages'])`;

const Q_PH_VISITS = `-- PostHog's visits that saw the landing page: per version of each run of the landing test
-- (the table's rows, over the run's days inside the range), and every one of them over the
-- whole range ("All landing pages"). The team's own people are left out.
SELECT version,
       count() AS visits,
       countIf(clicks = 0 AND ctas = 0 AND other_pages = 0) AS bounced,
       round(100 * bounced / visits, 1) AS bounce_pct,
       countIf(ctas > 0) AS clicked_cta,
       round(100 * clicked_cta / visits, 1) AS cta_pct
FROM (
  SELECT clicks, ctas, other_pages, ${PH_VERSION} AS version
  FROM (
    SELECT $session_id AS visit,
           argMax(properties.landing_variant, timestamp) AS arm,
           ${PH_RUN("min(timestamp)")} AS run,
           -- clicks on the page; the cookie banner's own buttons don't count
           countIf(event = '$autocapture' AND NOT match(elements_chain, '(^|[^a-zA-Z])cky-')) AS clicks,
           countIf(event = 'cta_click') AS ctas,
           countIf(event = '$pageview' AND properties.$pathname != '/') AS other_pages,
           countIf(event = 'landing_page_view') AS landings
    FROM events
    WHERE ${PH_RANGE}
    GROUP BY visit
    HAVING landings > 0
  )
)
WHERE version != ''
GROUP BY version
ORDER BY version
LIMIT 20`;

const Q_PH_VIEWS = `-- Views of the landing page that ended (the visitor left, or opened the next page, which
-- records how long the page was open and how far down it was scrolled): per version of each
-- run, and all of them ("All landing pages"), as for Bounce.
SELECT version,
       count() AS views,
       quantile(0.5)(secs) AS median_seconds,
       round(100 * countIf(scrolled >= 0.25) / views, 1) AS scrolled_25_pct,
       round(100 * countIf(scrolled >= 0.5) / views, 1) AS scrolled_50_pct,
       round(100 * countIf(scrolled >= 0.75) / views, 1) AS scrolled_75_pct,
       round(100 * countIf(scrolled >= 0.99) / views, 1) AS scrolled_100_pct
FROM (
  SELECT secs, scrolled, ${PH_VERSION} AS version
  FROM (
    SELECT properties.$prev_pageview_duration AS secs,
           properties.$prev_pageview_max_scroll_percentage AS scrolled,
           properties.landing_variant AS arm,
           ${PH_RUN("timestamp")} AS run
    FROM events
    WHERE event IN ('$pageleave', '$pageview') AND properties.$prev_pageview_pathname = '/'
      AND ${PH_RANGE}
  )
)
WHERE version != ''
GROUP BY version
ORDER BY version
LIMIT 20`;

const ALL_TRAFFIC =
  "Nothing else: this page reads all traffic (source, device, tier and visitor are fixed). Under the Funnel filter's Free survey, surveys bought before they were taken (pay to start) are left out with their money.";

const T_VISITS: FieldTable = {
  source: "production",
  table: "funnel_event",
  columns:
    "event_type (unique_visitor), day, utm_source, landing_variant (pay to start's pages are left out: its own page counts them)",
  filters: `Period, by day (Berlin). ${ALL_TRAFFIC}`,
  watch:
    "One row per browser per day, on any page of the site (the landing page, the survey, a report). Our test runs are left out by their utm_source.",
};
const T_VISITS_ARM: FieldTable = {
  ...T_VISITS,
  columns: "event_type (unique_visitor), day, landing_variant, utm_source",
  filters: `The test's days inside the period, by day (Berlin), and the version (landing_variant). ${ALL_TRAFFIC}`,
  watch:
    "One row per browser per day, on any page, in the version its cookie holds. Our test runs are left out by their utm_source.",
};
const T_STEPS: FieldTable = {
  source: "production",
  table: "survey_behavior_event",
  columns: "session_id, created_at, answered, direction, client_ip",
  filters: `Period, by the run's first record (Berlin day). ${ALL_TRAFFIC}`,
  watch:
    "Holds everyone's survey steps from 18 Sep 2026; before, only those of people who accepted cookies.",
};
const T_DRAFTS: FieldTable = {
  source: "production",
  table: "survey_partial_save",
  columns:
    "session_id, started_at, saved_at, current_index, utm_tracker (landing_variant), client_ip",
  filters: `Period, by the run's first record (Berlin day). ${ALL_TRAFFIC}`,
  watch:
    "Drafts of unfinished surveys are deleted after 30 days: an older unfinished start keeps no source or landing version.",
};
const T_SUBS: FieldTable = {
  source: "production",
  table: "survey_submission",
  columns: "id, session_id, status, start_date_time, created_date_time, user_id, utm_tracker",
  filters: `Period: a finished survey by created_date_time, a start by the run's first record (Berlin days). ${ALL_TRAFFIC}`,
};
const T_USERS: FieldTable = {
  source: "production",
  table: "ap_team_user",
  columns:
    "id (the team's own accounts: an @loveiq.org address, or one that used the team's test code)",
  filters: "None: it only tells the team's accounts apart.",
};
const T_PAYMENTS: FieldTable = {
  source: "production",
  table: "payment",
  columns:
    "amount, status, is_test, metadata (plan), payment_date_time, created_date_time, personal_report_id",
  filters: `Period, by the Berlin day it was paid (payment_date_time, else the row's created_date_time) for revenue in the range; any day for what a finished survey bought. ${ALL_TRAFFIC}`,
  watch:
    "Real payments over €0 only (succeeded, not is_test). A fully refunded payment turns 'refunded' and drops out; a partial refund is not taken off.",
};
const T_REPORTS: FieldTable = {
  source: "production",
  table: "personal_report",
  columns: "id, survey_submission_id",
  filters: "None: it links a payment to its finished survey.",
};
const T_PH_VISITS: FieldTable = {
  source: "posthog",
  table: "events",
  columns:
    "event (landing_page_view, cta_click, $autocapture, $pageview), timestamp, $session_id, person_id, properties.landing_variant, properties.$pathname, elements_chain",
  filters: `Period, by timestamp (Berlin days); a version's row reads its test's days. ${ALL_TRAFFIC}`,
  watch:
    "PostHog records only part of the visits: nearly every Google Ads visit, far fewer of the rest (blockers, declined cookies). Its version tag is reliable from 7 Oct 2026.",
};
const T_PH_VIEWS: FieldTable = {
  ...T_PH_VISITS,
  columns:
    "event ($pageleave, $pageview), timestamp, person_id, properties.$prev_pageview_pathname, $prev_pageview_duration, $prev_pageview_max_scroll_percentage, landing_variant",
};

const PER_VISIT = "per visit (a browser counts once a day)";
const POSTHOG_PART =
  "From PostHog, which records only part of the visits: nearly every Google Ads visit, far fewer of the rest (about a third of all visits lately).";
const UNDER_30 = "A version shows no figure where PostHog saw fewer than 30 of its visits.";
const STARTS_GAP =
  "Survey starts before 18 Sep 2026 are incomplete once their drafts are cleared (30 days on): blank for a range that starts earlier, and “No comparison: earlier starts incomplete” while the period before does.";
const LEFT_OUT = "The team's own surveys and our test runs are left out.";
const PF_SAME =
  "The Pay to start page's own Step by step figure for the page, all traffic, so the two pages agree; the query gives a row for each page. Test purchases, the team's and our probes are left out. The pages went live on 22 Oct 2026: a range ending before is blank, and so is the Free survey filter, which leaves pay to start out.";
const SALES_RULES =
  "A fully refunded sale drops out, a partial refund isn't taken off; test payments and €0 unlocks are never revenue.";

const SCROLL_KEYS = [
  "landing.scroll-25",
  "landing.scroll-50",
  "landing.scroll-75",
  "landing.scroll-100",
];

/** The engagement table's four scroll columns, each its own depth. */
function scroll(pct: 25 | 50 | 75 | 100, how: string, at: string): FieldDef {
  return {
    label: `Scroll depth reached · ${pct}%`,
    what: `The share of the landing page's views scrolled ${how} before the visitor left or opened the next page. It shows how much of the page people see.`,
    good: "up",
    stat: "Share",
    per: "per view of the landing page",
    formula: {
      num: `Views scrolled at least ${at} down`,
      den: "Views of the landing page that ended",
      mult: "× 100",
    },
    caveat: `${POSTHOG_PART} A view counts once it ends: the visitor leaves, or opens the next page. ${UNDER_30} The All landing pages row is every view in the range, all versions together.`,
    tables: [T_PH_VIEWS],
    query: { lang: "HogQL", text: Q_PH_VIEWS },
    related: [...SCROLL_KEYS.filter((k) => k !== `landing.scroll-${pct}`), "landing.median-time"],
  };
}

export const fields: FieldRegistry = {
  "landing.start-cvr": {
    label: "Survey start CVR",
    what: "The share of visits that started the survey, that is answered at least its first question. It shows how well the site turns visitors into survey takers.",
    good: "up",
    stat: "Share",
    per: PER_VISIT,
    formula: { num: "Survey starts", den: "Visits", mult: "× 100" },
    caveat: `Visits are our own visit log: one per browser per day on any page of the site, so a visitor who comes back on another day counts again. ${STARTS_GAP} The team's own runs (their accounts, and unfinished runs from the networks their surveys came from) and our test runs are left out.`,
    tables: [T_VISITS, T_STEPS, T_DRAFTS, T_SUBS, T_USERS],
    query: { lang: "SQL", text: Q_START_CVR },
    related: ["landing.complete-cvr", "landing.arm-start-cvr", "landing.rev-visit"],
  },
  "landing.complete-cvr": {
    label: "Survey complete CVR",
    what: "Finished surveys for every survey started in the range. It shows how many of the people who begin the survey see it through to their free report.",
    good: "up",
    stat: "Share",
    per: "per survey start",
    formula: { num: "Finished surveys", den: "Survey starts", mult: "× 100" },
    caveat: `A finished survey counts on the day it was sent, a start on the day it began, so a survey begun just before the range and finished in it counts only as finished. ${STARTS_GAP} ${LEFT_OUT}`,
    tables: [T_SUBS, T_STEPS, T_DRAFTS, T_USERS],
    query: { lang: "SQL", text: Q_COMPLETE_CVR },
    related: ["landing.start-cvr", "landing.full-cvr", "landing.arm-submit-cvr"],
  },
  "landing.pf-visitors": {
    label: "Visitors",
    what: "Visitors to the pay-to-start page in the range: the top of its funnel.",
    stat: "Count",
    per: "per visitor-day (a visitor counts once a day)",
    formula: { num: "The page's visitors each day, added up over the range" },
    caveat: `${PF_SAME} Counted apart by page from 24 Oct 2026.`,
    tables: [T_PTS_VISITS],
    query: { lang: "SQL", text: Q_PAY_FIRST },
    related: ["landing.pf-v2p", "landing.pf-checkout"],
  },
  "landing.pf-checkout": {
    label: "Started checkout",
    what: "Checkouts opened on the page in the range: people who pressed to pay.",
    stat: "Count",
    per: "per checkout",
    formula: { num: "The page's checkouts opened, or paid, in the range" },
    caveat: `${PF_SAME} A checkout reopened later keeps its first day, so one paid in the range counts too.`,
    tables: [T_PREPAID],
    query: { lang: "SQL", text: Q_PAY_FIRST },
    related: ["landing.pf-paid", "landing.pf-visitors"],
  },
  "landing.pf-paid": {
    label: "Paid",
    what: "Purchases on the page paid in the range and kept: the page's price paid, not refunded.",
    good: "up",
    stat: "Count",
    per: "per purchase",
    formula: { num: "Purchases paid in the range, above €0, not refunded" },
    caveat: `${PF_SAME} A 100% code's €0 purchase is no sale here (its buyer still counts as finished).`,
    tables: [T_PREPAID],
    query: { lang: "SQL", text: Q_PAY_FIRST },
    related: ["landing.pf-v2p", "landing.pf-finished"],
  },
  "landing.pf-v2p": {
    label: "Visitor → paid",
    what: "The share of the page's visitors who paid: its conversion, before anyone has taken the survey.",
    good: "up",
    stat: "Share",
    per: "per visitor-day",
    formula: { num: "Paid", den: "Visitors", mult: "× 100" },
    caveat: `${PF_SAME} Blank when the page sold on a day its visitors weren't counted apart yet.`,
    tables: [T_PTS_VISITS, T_PREPAID],
    query: { lang: "SQL", text: Q_PAY_FIRST },
    related: ["landing.pf-paid", "landing.pf-visitors"],
  },
  "landing.pf-finished": {
    label: "Finished survey",
    what: "Buyers on the page in the range who then finished the survey their purchase unlocks.",
    good: "up",
    stat: "Count",
    per: "per purchase",
    formula: { num: "Purchases completed in the range whose survey was finished" },
    caveat: `${PF_SAME} Every completed purchase counts here, a 100% code's €0 one and a refunded one too, so it is no share of Paid.`,
    tables: [T_PREPAID, T_SUBS],
    query: { lang: "SQL", text: Q_PAY_FIRST },
    related: ["landing.pf-paid", "landing.pf-checkout"],
  },
  "landing.pre-cvr": {
    label: "Pre-unlock CVR",
    what: "The share of the range's finished surveys whose Core Archetype was pre-unlocked (the €1.99 Initial plan), so far.",
    good: "up",
    stat: "Share",
    per: "per finished survey",
    formula: {
      num: "Finished surveys that bought the Initial plan",
      den: "Finished surveys",
      mult: "× 100",
    },
    caveat: `On sale from the evening of 22 Oct 2026, counted from 23 Oct, its first whole day (pay to start's €1.99 page; the report's own €1.99 gate is switched off): a range starting earlier is blank, never 0%. It counts the range's own finishers, whenever they bought. ${LEFT_OUT}`,
    tables: [T_SUBS, T_PAYMENTS, T_USERS],
    query: { lang: "SQL", text: Q_PRE_CVR },
    related: ["landing.full-cvr", "landing.arm-pre-cvr"],
  },
  "landing.full-cvr": {
    label: "Full-unlock CVR",
    what: "The share of the range's finished surveys whose person has bought a full unlock (Full, Full All or Core) so far. It shows how well the free report and its paywall sell the full report.",
    good: "up",
    stat: "Share",
    per: "per finished survey",
    formula: {
      num: "Finished surveys with a full unlock bought",
      den: "Finished surveys",
      mult: "× 100",
    },
    caveat: `Counts the range's finishers whenever they paid, so a recent range still grows as people buy; the period before is read at the same age. A sale in the range to someone who finished earlier isn't counted here (it is in Revenue / visitor). An upgrade from Essentials counts. Test payments and €0 unlocks never count. ${LEFT_OUT}`,
    tables: [T_SUBS, T_PAYMENTS, T_REPORTS, T_USERS],
    query: { lang: "SQL", text: Q_FULL_CVR },
    related: ["landing.pre-cvr", "landing.rev-sub", "landing.arm-full-cvr"],
  },
  "landing.rev-visit": {
    label: "Revenue / visitor",
    what: "The money taken in the range for every visit. It puts how many visitors buy and what they pay into one number, so periods can be compared fairly.",
    good: "up",
    stat: "Average",
    per: PER_VISIT,
    formula: { num: "Revenue (sales paid in the range)", den: "Visits" },
    caveat: `Visitors here are visits: the visit log counts a browser once a day (the count Survey start CVR divides by), so a visitor who comes back on another day counts again; it isn't people over the whole range. Revenue is every sale paid in the range, by the payment's day, including sales to people who finished earlier. ${SALES_RULES} ${LEFT_OUT}`,
    tables: [T_PAYMENTS, T_REPORTS, T_SUBS, T_VISITS, T_USERS],
    query: { lang: "SQL", text: Q_REV_VISIT },
    related: ["landing.rev-sub", "landing.start-cvr", "landing.arm-rev-visit"],
  },
  "landing.rev-sub": {
    label: "Revenue / survey complete",
    what: "The money taken in the range for every survey finished in it. It shows what a finished survey is worth.",
    good: "up",
    stat: "Average",
    per: "per finished survey",
    formula: { num: "Revenue (sales paid in the range)", den: "Finished surveys" },
    caveat: `Revenue is by the payment's day and includes sales to people who finished before the range, so it isn't only what these finishers paid. ${SALES_RULES} ${LEFT_OUT}`,
    tables: [T_PAYMENTS, T_REPORTS, T_SUBS, T_USERS],
    query: { lang: "SQL", text: Q_REV_SUB },
    related: ["landing.rev-visit", "landing.full-cvr", "landing.complete-cvr"],
  },
  "landing.visits": {
    label: "Visits",
    what: "Visits from browsers that were given this version of the landing page, over the test's days in the range. Every other figure of the version is divided by it.",
    stat: "Count",
    per: PER_VISIT,
    formula: { num: "Visits of this version" },
    caveat:
      "Our own visit log: one per browser per day on any page, in the version its cookie holds, so a visitor who comes back on another day counts again. Only the test's days inside the range are read; a running test's last day is yesterday (today too in a range that runs through today). Our test runs are left out.",
    tables: [T_VISITS_ARM],
    query: { lang: "SQL", text: Q_ARMS },
    related: ["landing.arm-start-cvr", "landing.arm-submit-cvr", "landing.arm-rev-visit"],
  },
  "landing.arm-start-cvr": {
    label: "Start CVR",
    what: "The share of this version's visits that started the survey (answered at least its first question). It shows which version gets more visitors into the survey.",
    good: "up",
    stat: "Share",
    per: PER_VISIT,
    formula: {
      num: "Survey starts of this version",
      den: "Visits of this version",
      mult: "× 100",
    },
    caveat:
      "A start's version comes from its saved draft or its finished survey, which keep it from 20 Sep 2026; unfinished drafts are deleted after 30 days, so a test's days more than 30 days back show no start CVR. The team's runs and our test runs are left out.",
    tables: [T_VISITS_ARM, T_DRAFTS, T_SUBS, T_STEPS, T_USERS],
    query: { lang: "SQL", text: Q_ARMS },
    related: ["landing.start-cvr", "landing.visits", "landing.arm-submit-cvr"],
  },
  "landing.arm-submit-cvr": {
    label: "Submit CVR",
    what: "The share of this version's visits that ended in a finished survey over the test's days. It shows which version brings more people all the way to their free report.",
    good: "up",
    stat: "Share",
    per: PER_VISIT,
    formula: {
      num: "Finished surveys of this version",
      den: "Visits of this version",
      mult: "× 100",
    },
    caveat: `Per visit, not per start: the Survey complete CVR tile divides by starts. A finished survey's version is the one its browser held when it was sent. ${LEFT_OUT}`,
    tables: [T_SUBS, T_VISITS_ARM, T_USERS],
    query: { lang: "SQL", text: Q_ARMS },
    related: ["landing.complete-cvr", "landing.arm-start-cvr", "landing.visits"],
  },
  "landing.arm-pre-cvr": {
    label: "Pre-unlock CVR",
    what: "The share of this version's visits whose finished survey pre-unlocked its Core Archetype (the €1.99 Initial plan), so far.",
    good: "up",
    stat: "Share",
    per: PER_VISIT,
    formula: {
      num: "Initial-plan buyers of this version",
      den: "Visits of this version",
      mult: "× 100",
    },
    caveat:
      "Per visit here; the Pre-unlock CVR tile is per finished survey. Blank for a test run whose days in the range reach back before 23 Oct 2026, the €1.99's first whole day on sale.",
    tables: [T_SUBS, T_VISITS_ARM, T_PAYMENTS],
    query: { lang: "SQL", text: Q_ARMS },
    related: ["landing.pre-cvr", "landing.arm-full-cvr"],
  },
  "landing.arm-full-cvr": {
    label: "Full-unlock CVR",
    what: "The share of this version's visits whose finished survey has bought a full unlock (Full, Full All or Core) so far. It shows which version sells more full reports.",
    good: "up",
    stat: "Share",
    per: PER_VISIT,
    formula: {
      num: "Finished surveys of this version with a full unlock bought",
      den: "Visits of this version",
      mult: "× 100",
    },
    caveat:
      "Per visit here; the Full-unlock CVR tile is per finished survey. Purchases count whenever they came, so a running test's figure still grows. Test payments, €0 unlocks and the team never count.",
    tables: [T_SUBS, T_PAYMENTS, T_REPORTS, T_VISITS_ARM],
    query: { lang: "SQL", text: Q_ARMS },
    related: ["landing.full-cvr", "landing.arm-rev-visit", "landing.visits"],
  },
  "landing.arm-rev-visit": {
    label: "€ / visit",
    what: "The money paid by the people this version brought, for every visit of this version. It compares the versions on what they earn.",
    good: "up",
    stat: "Average",
    per: PER_VISIT,
    formula: {
      num: "Revenue from this version's finished surveys (paid on any day)",
      den: "Visits of this version",
    },
    caveat: `What this version's finishers have paid so far, on any day: not the sales paid in the range (that is the Revenue / visitor tile). A running test's figure still grows as people buy. ${SALES_RULES}`,
    tables: [T_PAYMENTS, T_REPORTS, T_SUBS, T_VISITS_ARM],
    query: { lang: "SQL", text: Q_ARMS },
    related: ["landing.rev-visit", "landing.arm-full-cvr", "landing.visits"],
  },
  "landing.bounce": {
    label: "Bounce",
    what: "The share of PostHog's visits to the landing page that left without a click, a survey button or another page. Lower is better: fewer visitors leave without doing anything.",
    good: "down",
    stat: "Share",
    per: "per visit PostHog recorded",
    formula: {
      num: "Visits that left without a click",
      den: "Visits that saw the landing page",
      mult: "× 100",
    },
    caveat: `${POSTHOG_PART} ${UNDER_30} The version is PostHog's own tag (reliable from 7 Oct 2026). Clicks on the cookie banner don't count. The All landing pages row is every landing visit PostHog recorded in the range, all versions together.`,
    tables: [T_PH_VISITS],
    query: { lang: "HogQL", text: Q_PH_VISITS },
    related: ["landing.cta", "landing.median-time"],
  },
  "landing.median-time": {
    label: "Median time",
    what: "How long the typical view of the landing page lasts before the visitor leaves or opens the next page: half the views are shorter, half longer. In whole seconds.",
    good: "up",
    stat: "Median",
    per: "per view of the landing page",
    formula: { num: "The middle value of the views' seconds on the landing page" },
    caveat: `A median, not an average: a few tabs left open for a long time pull the average far up (about 14 times the median lately), so the average is in the export only, each view counted up to 30 minutes. ${POSTHOG_PART} ${UNDER_30} The All landing pages row is the median of every view in the range, not an average of the versions.`,
    tables: [T_PH_VIEWS],
    query: { lang: "HogQL", text: Q_PH_VIEWS },
    related: ["landing.bounce", "landing.cta", "landing.scroll-50"],
  },
  "landing.cta": {
    label: "CTA clicks",
    what: "The share of PostHog's visits to the landing page that pressed a button to the survey. It shows how many visitors the page moves to act.",
    good: "up",
    stat: "Share",
    per: "per visit PostHog recorded",
    formula: {
      num: "Visits that pressed a survey button",
      den: "Visits that saw the landing page",
      mult: "× 100",
    },
    caveat: `A visit counts once, however many buttons it pressed. ${POSTHOG_PART} ${UNDER_30} The All landing pages row is every landing visit PostHog recorded in the range.`,
    tables: [T_PH_VISITS],
    query: { lang: "HogQL", text: Q_PH_VISITS },
    related: ["landing.bounce", "landing.arm-start-cvr"],
  },
  "landing.tests": {
    label: "Tests and variants",
    what: "Every landing test running in the range, its versions side by side: how many visits each got and how many of them started, finished and paid. It shows which version of the page brings more people through.",
    stat: "Count",
    per: "per visit (a browser counts once a day), per version of the page; its rates are shares of those visits",
    formula: {
      num: "Each version's visits, starts, finished surveys and sales",
      den: "That version's visits",
    },
    caveat: `Each test is read over its own days inside the range; a version's visits are those the visit log tagged with it. ${LEFT_OUT} Bounce, CTA clicks, time and scroll are PostHog's, which sees only part of the visits.`,
    tables: [T_VISITS_ARM, T_STEPS, T_DRAFTS, T_SUBS, T_PAYMENTS],
    query: { lang: "SQL", text: Q_ARMS },
    related: ["landing.arm-start-cvr", "landing.engagement"],
  },
  "landing.engagement": {
    label: "Engagement per landing page",
    what: "How visitors behave on each version of the landing page: who leaves at once, who presses a survey button, how long a view lasts and how far down they scroll.",
    stat: "Share",
    per: "per visit PostHog recorded (its time column is a median, per view)",
    formula: {
      num: "Visits that bounced or pressed a survey button",
      den: "Visits PostHog recorded that saw the landing page",
    },
    caveat: `${POSTHOG_PART} ${UNDER_30} The All landing pages row is every landing visit PostHog recorded in the range, not an average of the versions. Time and scroll are read from the page's views, not its visits: the query below is the visits'; their own columns' cards hold the views' query.`,
    tables: [
      {
        ...T_PH_VISITS,
        columns: `${T_PH_VISITS.columns}; for the views: $pageleave, properties.$prev_pageview_pathname, $prev_pageview_duration, $prev_pageview_max_scroll_percentage`,
      },
    ],
    query: { lang: "HogQL", text: Q_PH_VISITS },
    related: ["landing.bounce", "landing.cta", "landing.median-time"],
  },
  "landing.scroll-25": scroll(25, "at least a quarter of the way down", "25%"),
  "landing.scroll-50": scroll(50, "at least half way down", "50%"),
  "landing.scroll-75": scroll(75, "at least three quarters of the way down", "75%"),
  "landing.scroll-100": scroll(100, "to the bottom (99% or more)", "99%"),
};
