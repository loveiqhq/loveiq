/**
 * The Dashboard's fields: its three tiles, the funnel comparison, the six charts and their
 * legend figures, and the assessments. Each query was run read-only for 21 Sep – 20 Oct 2026
 * and gave the page's own figure at "Last 30 days" (scratchpad impl/focus/checks.md).
 */
import type { FieldRegistry, FieldTable } from "./types";

const SUBMISSIONS: FieldTable = {
  source: "production",
  table: "survey_submission",
  columns: "id, status ('completed'), created_date_time, user_id",
  filters:
    "Period (created_date_time, Berlin day); source (utm_tracker); device and tier (the reader's price quote); visitor (the PostHog visit it was finished in); assessment (only A is live)",
};
const PAYMENTS: FieldTable = {
  source: "production",
  table: "payment",
  columns:
    "amount, status ('succeeded'), is_test, payment_date_time, created_date_time, personal_report_id",
  filters:
    "Period: the Berlin day it was paid (payment_date_time, else the row's created_date_time); source, device, tier and visitor through the survey whose report it unlocks",
  watch:
    "Test payments and free (€0) unlocks are left out. A payment refunded in full is no longer 'succeeded'.",
};
const REPORTS: FieldTable = {
  source: "production",
  table: "personal_report",
  columns: "id, survey_submission_id",
  filters: "None: it links a payment or a reading session to its survey",
};
const USERS: FieldTable = {
  source: "production",
  table: "ap_team_user",
  columns:
    "id (the team's own accounts: an @loveiq.org address, or one that used the team's test code)",
  filters: "None",
};
const VISITS: FieldTable = {
  source: "production",
  table: "funnel_event",
  columns:
    "event_type ('unique_visitor'), day, utm_source, landing_variant (pay to start's pages are left out: its own page counts them)",
  filters:
    "Period (day). Source: Google Ads only, by utm_source (its links tag every click); a device, tier or visitor filter blanks it",
  watch:
    "One row per visitor per day, written by the server for every visitor from 15 Jun 2026 (from 23 May only those who accepted cookies). Our own probe visits tag themselves and are left out.",
};
// The page reads Google Ads' cost as Google Analytics imports it, kept with each day of the
// brain's GA4 copy (no column of a catalog table): Google Ads' own copy, campaign_daily, is the
// table that shows it, and adds up to the same within a cent.
const SPEND: FieldTable = {
  source: "ads",
  table: "campaign_daily",
  columns: "cost_eur (the page reads the same cost as Google Analytics imports it: ad_cost)",
  filters:
    "Period (the day). Under a source other than Google Ads it is blank (Meta's spend isn't read, the others have none); a device, tier or visitor filter blanks it",
  watch:
    "Kept with each day's row of the company brain's copy of Google Analytics (brain_chunk, copied every 15 minutes). Only Google Ads spend: Meta's isn't read.",
};
const STEPS: FieldTable = {
  source: "production",
  table: "survey_behavior_event",
  columns: "session_id, created_at, answered, direction, client_ip",
  filters:
    "Period (the run's first moment, Berlin day). Source only from the run's draft or survey (30 days); device from 13 Oct 2026 (the steps' own), tablets from 17 Oct; no tier or visitor",
  watch: "Written for everyone from 18 Sep 2026; before, only for people who accepted cookies.",
};
const DRAFTS: FieldTable = {
  source: "production",
  table: "survey_partial_save",
  columns: "session_id, started_at, current_index, client_ip",
  filters: "As the steps: the run's first moment; it also holds the run's source (utm_tracker)",
  watch: "Drafts of runs that never finish are deleted after 30 days.",
};
const SESSIONS: FieldTable = {
  source: "production",
  table: "report_session",
  columns: "personal_report_id, started_at, ended_at, user_id, user_agent",
  filters: "Through the finisher whose report it is",
  watch:
    "Every visit is recorded from 18 Sep 2026 (before, only with cookie consent). Robots that open reports are left out by their user agent.",
};
const RATINGS: FieldTable = {
  source: "production",
  table: "report_section_feedback",
  columns: "feedback ('up' or 'down'), created_at, survey_submission_id",
  filters: "Period (created_at, Berlin day) only: not split by source, device, tier or visitor",
};

const PREPAID: FieldTable = {
  source: "production",
  table: "prepaid_report_access",
  columns: "offer, status, amount_cents, paid_at, consumed_submission_id, is_test, customer_email",
  filters: "Period (paid_at, Berlin day): the purchase made on a pay-to-start page",
  watch:
    "A survey is pay to start's when a completed purchase (paid, kept or refunded) claimed it; a checkout left unpaid is bound to the survey too, and doesn't count.",
};
const ADS_LANDING: FieldTable = {
  source: "ads",
  table: "landing_page_view",
  columns: "unexpanded_final_url, segments.date, metrics.cost_micros, metrics.clicks",
  filters: "Period (the day); read live from Google Ads",
  watch: "Its cost adds up to Google Analytics' ad cost to the cent.",
};

/** The funnel comparison: the Pay to start page's figures, said once. */
const FC_SAME =
  "The Pay to start page's own figures for the range, all traffic, so the two pages agree; its card shows the free survey's row (pay after the report), the one the others are read against.";

/** The free survey's row of the funnel comparison, as the Pay to start page counts it. */
const FC_FREE = `-- The free survey's row (pay after the report), as the Pay to start page counts it: the range's
-- finished surveys that weren't bought first and didn't meet the report's EUR 1.99 gate, and
-- the free landing pages' visitors. The team's surveys and our own probes are left out.
WITH b AS (
  SELECT (:from::date::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
         ((:to::date + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
),
-- Bought first: claimed by a completed pay-to-start purchase (a 100% code's EUR 0 one too).
bought AS (
  SELECT DISTINCT consumed_submission_id AS sid FROM prepaid_report_access
   WHERE consumed_submission_id IS NOT NULL AND offer IS NOT NULL
     AND paid_at IS NOT NULL AND status IN ('succeeded', 'refunded')
),
free AS (
  SELECT s.id, (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day,
         -- Met the EUR 1.99 gate: its report was put in the gate's cohort when it was submitted.
         EXISTS (SELECT 1 FROM personal_report pr
                  WHERE pr.survey_submission_id = s.id
                    AND pr.initial_gate_cohort_at >= s.created_date_time - interval '1 minute'
                    AND pr.initial_gate_cohort_at < s.created_date_time + interval '1 hour') AS gate
    FROM survey_submission s, b
   WHERE s.status = 'completed'
     AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
     AND s.id NOT IN (SELECT sid FROM bought)
     AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                      WHERE t.id = s.user_id)
     AND lower(btrim(CASE WHEN pg_input_is_valid(s.utm_tracker, 'jsonb')
                          THEN coalesce(s.utm_tracker::jsonb->>'utm_source', '') ELSE '' END))
         NOT IN ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')
),
-- What each one paid so far (real payments, above EUR 0, not refunded in full).
paid AS (
  SELECT pr.survey_submission_id AS sid, sum(p.amount) AS eur
    FROM payment p JOIN personal_report pr ON pr.id = p.personal_report_id
   WHERE p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
     AND pr.survey_submission_id IN (SELECT id FROM free)
   GROUP BY 1
),
-- The free landing pages' visitors, each day less the gate's share of that day's finishers.
visits AS (
  SELECT f.day, count(*) AS n
    FROM funnel_event f
   WHERE f.event_type = 'unique_visitor' AND f.day BETWEEN :from AND :to
     AND coalesce(f.landing_variant, '') <> 'pay_to_start'
     AND lower(btrim(coalesce(f.utm_source, ''))) NOT IN
         ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')
   GROUP BY 1
),
share AS (
  SELECT day, avg(CASE WHEN gate THEN 1.0 ELSE 0.0 END) AS gate FROM free GROUP BY 1
),
after AS (
  SELECT (SELECT round(sum(v.n * (1 - coalesce(sh.gate, 0)))) FROM visits v
            LEFT JOIN share sh ON sh.day = v.day) AS visitors,
         count(*) FILTER (WHERE p.eur > 0) AS paying_customers,
         coalesce(sum(p.eur), 0) AS revenue
    FROM free f LEFT JOIN paid p ON p.sid = f.id
   WHERE NOT f.gate
)
`;
const FC_FREE_VISITS = `SELECT visitors FROM after;
`;
const FC_FREE_MONEY = `SELECT paying_customers, revenue FROM after;
`;
/** Who of the free survey's row paid money, refunded since or not, and who got money back. */
const FC_FREE_REFUNDS = `-- Refunded: a real payment refunded in full or in part, whenever it was paid. A full refund
-- takes the sale away, so its buyer is counted back among those who paid.
SELECT count(*) FILTER (WHERE r.sid IS NOT NULL) AS refunded_customers,
       count(*) FILTER (WHERE p.eur > 0 OR r.sid IS NOT NULL) AS customers_who_paid,
       round(100.0 * count(*) FILTER (WHERE r.sid IS NOT NULL)
             / nullif(count(*) FILTER (WHERE p.eur > 0 OR r.sid IS NOT NULL), 0), 1) AS refund_rate_pct
  FROM free f
  LEFT JOIN paid p ON p.sid = f.id
  LEFT JOIN (SELECT DISTINCT pr.survey_submission_id AS sid
               FROM payment x JOIN personal_report pr ON pr.id = x.personal_report_id
              WHERE (x.status = 'refunded' OR (x.status = 'succeeded' AND coalesce(x.refund_amount, 0) > 0))
                AND NOT coalesce(x.is_test, false) AND x.amount > 0) r ON r.sid = f.id
 WHERE NOT f.gate;
`;
const FC_FREE_RATES = `SELECT visitors, paying_customers, revenue,
       round(100.0 * paying_customers / nullif(visitors, 0), 3) AS visitor_to_paid_pct,
       round(revenue / nullif(visitors, 0), 3) AS revenue_per_visitor
  FROM after;
`;

/** The grouping windows, said once for every chart. */
const WINDOWS =
  "Daily covers the range; Weekly the 15 weeks (Monday to Sunday) up to its last day; Monthly every month from May 2026. A longer range is shown whole.";
const WINDOW_CAVEAT =
  "Weekly and Monthly reach back before the range, and their last week or month runs only to its last day, so a count reads low there. Their legend figures cover their own points, from the first one with a figure; points before a filter or a record can be followed are blank and the note under the chart says why. The thin dashed line is the least-squares trend: it reads flat when it starts at nothing or doesn't move, and grey under 3%.";

export const fields: FieldRegistry = {
  "focus.revenue": {
    label: "Revenue",
    what: "The money taken from report sales in the range, each payment on the day it was made. It is what the ad spend has to earn back.",
    good: "up",
    stat: "Sum",
    per: "per payment, on the day it was paid",
    formula: { num: "Real payments in the range (euros)" },
    caveat:
      "A payment counts on the day it was made, whoever's survey it unlocks: someone who finished in June and paid in October counts in October. Test payments, free (€0) unlocks and the team's own are left out. A sale refunded in full drops out; a partial refund still counts in full. Shown in whole euros. Under a source, device, tier or visitor filter, the payer's own survey decides.",
    tables: [PAYMENTS, REPORTS, { ...SUBMISSIONS, columns: "id, user_id" }, USERS],
    query: {
      lang: "SQL",
      text: `-- Real payments in the range, by the Berlin day they were paid; the team's own left out.
SELECT coalesce(sum(p.amount), 0) AS revenue
FROM payment p
JOIN personal_report pr ON pr.id = p.personal_report_id
JOIN survey_submission s ON s.id = pr.survey_submission_id
WHERE p.status = 'succeeded'
  AND NOT coalesce(p.is_test, false)
  AND p.amount > 0
  AND (coalesce(p.payment_date_time, p.created_date_time) AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
  AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                  WHERE t.id = s.user_id);`,
    },
    related: ["focus.spend", "focus.rev-per-sub", "focus.fc-roas"],
  },

  "focus.spend": {
    label: "Ad spend",
    what: "What Google Ads cost over the range: the cost side of every per-submission and per-customer figure on this page.",
    stat: "Sum",
    per: "per day of the range",
    formula: { num: "Google Ads cost of each day in the range (euros)" },
    caveat:
      "Only Google Ads spend: Meta's isn't read. It is Google Analytics' import of the Ads cost, so the last day can still move. A range is shown only when every one of its days has a figure; otherwise it is blank and says from when spend is recorded. Neither good nor bad by itself, so its change is grey. Shown in whole euros.",
    tables: [SPEND],
    query: {
      lang: "SQL",
      text: `-- Google Ads spend per day as GA4 imports it, in the company brain's daily GA4 copy.
-- In cents, as the page rounds it; shown only when every day of the range has its row.
SELECT round(sum((meta->>'ad_cost')::numeric), 2) AS ad_spend,
       count(DISTINCT meta->>'day') AS days_read
FROM brain_chunk
WHERE source = 'ga4' AND meta->>'grain' = 'day'
  AND (meta->>'day')::date BETWEEN :from AND :to;`,
    },
    related: ["focus.cost-per-sub", "focus.fc-cpp", "focus.fc-roas"],
  },

  "focus.new-users": {
    label: "New users",
    what: "People who finished the survey for the first time ever in the range. Someone who comes back for another assessment is not new.",
    good: "up",
    stat: "Count",
    per: "per person",
    formula: { num: "People whose first finished survey falls in the range" },
    caveat:
      "Counted by account: a person who finished twice in the range counts once, and one who first finished before the range is not new. A finished survey without an account is not counted. The team's own are left out.",
    tables: [
      { ...SUBMISSIONS, columns: "user_id, status ('completed'), created_date_time" },
      USERS,
    ],
    query: {
      lang: "SQL",
      text: `-- People whose first finished survey ever falls in the range (the team's own left out).
SELECT count(*) AS new_users
FROM (
  SELECT s.user_id, min(s.created_date_time) AS first_at
  FROM survey_submission s
  WHERE s.status = 'completed' AND s.user_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
  GROUP BY s.user_id
) first_finish
WHERE (first_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to;`,
    },
    related: ["focus.subs", "focus.per-user"],
  },

  "focus.fc-visitors": {
    label: "Visitors",
    what: "Visitors to each funnel's own pages in the range: the free survey's landing pages, and each pay-to-start page. What the comparison divides by to compare funnels per visitor.",
    stat: "Count",
    per: "per visitor-day (a visitor counts once a day)",
    formula: { num: "Visitors each day, added up over the range" },
    caveat: `${FC_SAME} The free survey's visitors are every visitor of its landing pages; while the report's €1.99 gate runs, its share of each day's finished surveys goes to the gate's row. Pay to start's pages are counted apart from 24 Oct 2026: earlier visits to them are in neither offer.`,
    tables: [VISITS],
    query: { lang: "SQL", text: FC_FREE + FC_FREE_VISITS },
    related: ["focus.fc-v2p", "focus.fc-rpv", "focus.fc-paying"],
  },

  "focus.fc-spend": {
    label: "Ad spend",
    what: "Google Ads spend on each funnel's own pages in the range: the free survey's landing pages, and each pay-to-start page, by the page the ad lands on.",
    stat: "Sum",
    per: "per euro",
    formula: { num: "Google Ads cost of the ads that land on the funnel's pages" },
    caveat: `${FC_SAME} Google's cost by landing page adds up to the whole account's (Google Analytics' ad cost) to the cent. While the report's €1.99 gate runs, its share of each day's finished surveys takes that share of the free survey's spend.`,
    tables: [ADS_LANDING],
    query: {
      lang: "GAQL",
      text: `-- Google Ads cost per landing page and day: the pay-to-start pages are /sexual-archetype
-- (full) and /sexual-archetype/initial (EUR 1.99); every other page is the free survey's.
SELECT landing_page_view.unexpanded_final_url, segments.date, metrics.cost_micros, metrics.clicks
FROM landing_page_view
WHERE segments.date BETWEEN :from AND :to`,
    },
    related: ["focus.fc-cpp", "focus.fc-roas", "focus.spend"],
  },

  "focus.fc-paying": {
    label: "Paying customers",
    what: "The range's finishers of each funnel who paid so far: the free survey's (the reference) and those who bought on a pay-to-start page in the range.",
    good: "up",
    stat: "Count",
    per: "per finished survey (pay to start: per purchase)",
    formula: { num: "The funnel's finishers (pay to start: buyers) who paid more than €0 so far" },
    caveat: `${FC_SAME} A cohort figure: a recent range keeps rising as late buyers pay. A purchase refunded in full no longer counts; a 100% code's €0 purchase counts once something is paid after it.`,
    tables: [SUBMISSIONS, PAYMENTS, REPORTS, USERS, PREPAID],
    query: { lang: "SQL", text: FC_FREE + FC_FREE_MONEY },
    related: ["focus.fc-v2p", "focus.fc-cpp", "focus.fc-visitors"],
  },

  "focus.fc-v2p": {
    label: "Visitor → paid",
    what: "The share of the funnel's visitors who became paying customers: it compares funnels fairly even though they ask for payment at different points.",
    good: "up",
    stat: "Share",
    per: "per visitor-day",
    formula: { num: "Paying customers", den: "Visitors", mult: "× 100" },
    caveat: `${FC_SAME} A visitor who came on several days counts each time, so the share reads lower than per person.`,
    tables: [VISITS, SUBMISSIONS, PAYMENTS, REPORTS, USERS, PREPAID],
    query: { lang: "SQL", text: FC_FREE + FC_FREE_RATES },
    related: ["focus.fc-paying", "focus.fc-visitors", "focus.fc-rpv"],
  },

  "focus.fc-rpv": {
    label: "Revenue / visitor",
    what: "What each of the funnel's visitors earned on average: conversion and price in one figure, the fairest way to compare funnels.",
    good: "up",
    stat: "Average",
    per: "per visitor-day",
    formula: { num: "Revenue of the funnel's paying customers so far", den: "Visitors" },
    caveat: `${FC_SAME} Written in euros with three decimals, as the figures are small.`,
    tables: [VISITS, SUBMISSIONS, PAYMENTS, REPORTS, USERS, PREPAID],
    query: { lang: "SQL", text: FC_FREE + FC_FREE_RATES },
    related: ["focus.fc-v2p", "focus.fc-visitors", "focus.fc-roas"],
  },

  "focus.fc-cpp": {
    label: "Cost / paying customer",
    what: "What one paying customer cost in Google Ads spend on the funnel's own pages. Below what a customer pays, the ads earn their cost.",
    good: "down",
    stat: "Average",
    per: "per paying customer",
    formula: { num: "Ad spend on the funnel's pages", den: "Paying customers" },
    caveat: `${FC_SAME} Every paying customer counts, not only those who came from an ad. Blank with no paying customer or when Google Ads can't be read. The spend is the Ad spend column's (Google Ads, by landing page); the query gives the customers.`,
    tables: [ADS_LANDING, SUBMISSIONS, PAYMENTS, REPORTS, USERS, PREPAID],
    query: { lang: "SQL", text: FC_FREE + FC_FREE_MONEY },
    related: ["focus.fc-spend", "focus.fc-paying", "focus.fc-roas"],
  },

  "focus.fc-roas": {
    label: "ROAS",
    what: "Return on ad spend: the funnel's revenue for each euro of Google Ads spend on its pages. From 1× the ads pay for themselves.",
    good: "up",
    stat: "Ratio",
    per: "per euro of ad spend",
    formula: {
      num: "Revenue of the funnel's paying customers so far",
      den: "Ad spend on its pages",
    },
    caveat: `${FC_SAME} All of the funnel's revenue counts, also from people who never clicked an ad, so it reads high for the ads alone. Blank when the spend is €0 or can't be read. The spend is the Ad spend column's; the query gives the revenue.`,
    tables: [ADS_LANDING, SUBMISSIONS, PAYMENTS, REPORTS, USERS, PREPAID],
    query: { lang: "SQL", text: FC_FREE + FC_FREE_MONEY },
    related: ["focus.fc-spend", "focus.fc-rpv", "focus.fc-cpp"],
  },

  "focus.fc-refund": {
    label: "Refund rate",
    what: "The share of the funnel's paying customers who got money back: a full or a partial refund of any of their payments. Lower is better.",
    good: "down",
    stat: "Share",
    per: "per paying customer",
    formula: {
      num: "Customers refunded, in full or in part",
      den: "Customers who paid money, refunded ones included",
      mult: "× 100",
    },
    caveat: `${FC_SAME} A cohort figure, like the rest of the row: a refund that comes later still raises it. A chargeback (dispute) is no refund here. Blank with no customer who paid.`,
    tables: [
      SUBMISSIONS,
      {
        ...PAYMENTS,
        columns:
          "amount, status ('succeeded', 'refunded'), refund_amount, is_test, personal_report_id",
        filters: "None: every payment of the funnel's customers, whenever it was paid",
        watch:
          "Test payments and free (€0) unlocks are left out. A refund in full turns the payment's status to 'refunded'; a partial one keeps 'succeeded' with refund_amount above 0.",
      },
      REPORTS,
      USERS,
      PREPAID,
    ],
    query: { lang: "SQL", text: FC_FREE + FC_FREE_REFUNDS },
    related: ["focus.fc-paying", "focus.fc-roas", "focus.fc-cpp"],
  },

  "focus.chart-submissions": {
    label: "Survey submissions",
    what: `Finished surveys per day, week or month, with what each one cost in Google Ads spend and earned in revenue. ${WINDOWS}`,
    stat: "Count, and averages per finished survey",
    per: "per day, week or month",
    formula: {
      num: "Each point: finished surveys; ad spend ÷ finished surveys; revenue ÷ finished surveys",
    },
    caveat: `Revenue is the payments made in the period, whoever's survey they unlock, so a point can earn more than its own surveys did. ${WINDOW_CAVEAT}`,
    tables: [SUBMISSIONS, SPEND, PAYMENTS, REPORTS, USERS],
    query: {
      lang: "SQL",
      text: `-- Per day (group by week or month for those views): finished surveys, and what each cost in
-- Google Ads spend and earned in revenue (payments that day).
WITH subs AS (
  SELECT (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day, count(*) AS n
  FROM survey_submission s
  WHERE s.status = 'completed'
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
  GROUP BY 1
), spend AS (
  SELECT (meta->>'day')::date AS day, round(sum((meta->>'ad_cost')::numeric), 2) AS eur
  FROM brain_chunk
  WHERE source = 'ga4' AND meta->>'grain' = 'day'
  GROUP BY 1
), revenue AS (
  SELECT (coalesce(p.payment_date_time, p.created_date_time) AT TIME ZONE 'Europe/Berlin')::date AS day, sum(p.amount) AS eur
  FROM payment p
  JOIN personal_report pr ON pr.id = p.personal_report_id
  JOIN survey_submission s ON s.id = pr.survey_submission_id
  WHERE p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
  GROUP BY 1
)
SELECT d.day::date AS day,
       coalesce(subs.n, 0) AS survey_submissions,
       round(coalesce(spend.eur, 0) / nullif(subs.n, 0), 2) AS cost_per_submission,
       round(coalesce(revenue.eur, 0) / nullif(subs.n, 0), 2) AS revenue_per_submission
FROM generate_series(:from::date, :to::date, interval '1 day') AS d(day)
LEFT JOIN subs ON subs.day = d.day::date
LEFT JOIN spend ON spend.day = d.day::date
LEFT JOIN revenue ON revenue.day = d.day::date
ORDER BY 1;`,
    },
    related: ["focus.subs", "focus.cost-per-sub", "focus.rev-per-sub"],
  },

  "focus.subs": {
    label: "Survey submissions",
    what: "Surveys finished and submitted: every report starts here.",
    good: "up",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Finished surveys in the range (or the chart's window)" },
    caveat:
      "Counts surveys, not people: someone who finished twice counts twice (Assessments per user says how often). Counted on the Berlin day they were submitted. The team's own are left out. In the chart, Weekly and Monthly count their own windows.",
    tables: [SUBMISSIONS, USERS],
    query: {
      lang: "SQL",
      text: `-- Finished surveys in the range, by the Berlin day they were submitted; the team's own left out.
SELECT count(*) AS survey_submissions
FROM survey_submission s
WHERE s.status = 'completed'
  AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
  AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                  WHERE t.id = s.user_id);`,
    },
    related: ["focus.new-users", "focus.per-user", "focus.completion"],
  },

  "focus.cost-per-sub": {
    label: "Cost per submission",
    what: "Google Ads spend for each finished survey: what a submission costs to win.",
    good: "down",
    stat: "Average",
    per: "per finished survey",
    formula: { num: "Ad spend", den: "Survey submissions" },
    caveat:
      "Every finished survey counts, not only those from ads, which makes each look cheaper. Only Google Ads spend. Blank when the spend isn't recorded for every day.",
    tables: [SPEND, SUBMISSIONS, USERS],
    query: {
      lang: "SQL",
      text: `-- Google Ads spend over finished surveys, both over the range.
WITH spend AS (
  SELECT round(sum((meta->>'ad_cost')::numeric), 2) AS eur
  FROM brain_chunk
  WHERE source = 'ga4' AND meta->>'grain' = 'day'
    AND (meta->>'day')::date BETWEEN :from AND :to
), subs AS (
  SELECT count(*) AS n
  FROM survey_submission s
  WHERE s.status = 'completed'
    AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
)
SELECT spend.eur AS ad_spend, subs.n AS survey_submissions,
       round(spend.eur / nullif(subs.n, 0), 2) AS cost_per_submission
FROM spend, subs;`,
    },
    related: ["focus.spend", "focus.subs", "focus.rev-per-sub"],
  },

  "focus.rev-per-sub": {
    label: "Revenue per submission",
    what: "Revenue for each finished survey. Set against the cost per submission, it says whether a submission pays for itself.",
    good: "up",
    stat: "Average",
    per: "per finished survey",
    formula: { num: "Revenue", den: "Survey submissions" },
    caveat:
      "Revenue is the payments made in the period by anyone, not what that period's own finishers paid (Paid CVR follows the same people). Test payments and the team's own are left out.",
    tables: [PAYMENTS, SUBMISSIONS, REPORTS, USERS],
    query: {
      lang: "SQL",
      text: `-- Revenue (payments in the range, whoever's survey they unlock) over finished surveys.
WITH revenue AS (
  SELECT coalesce(sum(p.amount), 0) AS eur
  FROM payment p
  JOIN personal_report pr ON pr.id = p.personal_report_id
  JOIN survey_submission s ON s.id = pr.survey_submission_id
  WHERE p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
    AND (coalesce(p.payment_date_time, p.created_date_time) AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
), subs AS (
  SELECT count(*) AS n
  FROM survey_submission s
  WHERE s.status = 'completed'
    AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
)
SELECT revenue.eur AS revenue, subs.n AS survey_submissions,
       round(revenue.eur / nullif(subs.n, 0), 2) AS revenue_per_submission
FROM revenue, subs;`,
    },
    related: ["focus.revenue", "focus.cost-per-sub", "focus.paid-cvr"],
  },

  "focus.chart-start": {
    label: "Visitor → survey start",
    what: `The share of visitors who started the survey, per day, week or month. ${WINDOWS}`,
    stat: "Share",
    per: "per visitor-day, each point",
    formula: { num: "Survey starts", den: "Visitors", mult: "× 100, each point" },
    caveat: `Survey starts are whole from 18 Sep 2026 (before, a start was kept only with its draft, cleared after 30 days) and visitors from 15 Jun 2026: earlier points are left out. A start can't be split by country tier or new and returning, and visits by source only for Google Ads. ${WINDOW_CAVEAT}`,
    tables: [
      VISITS,
      STEPS,
      DRAFTS,
      { ...SUBMISSIONS, columns: "session_id, status, start_date_time, user_id" },
    ],
    query: {
      lang: "SQL",
      text: `-- Per day: survey starts over visitors (group by week or month for those views).
WITH staff AS (SELECT id FROM ap_team_user),
-- The networks the team's own surveys came from: an unfinished run from one is a team test.
staff_ips AS (
  SELECT e.client_ip FROM survey_behavior_event e
  JOIN survey_submission s ON s.session_id = e.session_id
  WHERE s.user_id IN (SELECT id FROM staff) AND e.client_ip IS NOT NULL
  UNION
  SELECT d.client_ip FROM survey_partial_save d
  JOIN survey_submission s ON s.session_id = d.session_id
  WHERE s.user_id IN (SELECT id FROM staff) AND d.client_ip IS NOT NULL
),
-- Every run of the survey (a browser session): when it began, whether it answered its first
-- question (a step answered, a draft past question 1, or a finished survey).
runs AS (
  SELECT session_id, min(at) AS began, bool_or(answered) AS answered,
         bool_or(staff_ip) AS staff_ip
  FROM (
    SELECT session_id, created_at AS at, (answered IS TRUE OR direction = 'complete') AS answered,
           client_ip IN (SELECT client_ip FROM staff_ips) AS staff_ip
    FROM survey_behavior_event WHERE session_id IS NOT NULL
    UNION ALL
    SELECT session_id, started_at, coalesce(current_index, 0) >= 1,
           client_ip IN (SELECT client_ip FROM staff_ips)
    FROM survey_partial_save WHERE session_id IS NOT NULL
    UNION ALL
    SELECT session_id, start_date_time, status = 'completed', false
    FROM survey_submission WHERE session_id IS NOT NULL
  ) x
  GROUP BY session_id
),
finished AS (
  SELECT DISTINCT ON (session_id) session_id, user_id, status
  FROM survey_submission WHERE session_id IS NOT NULL
  ORDER BY session_id, (status = 'completed') DESC, id
),
-- A start: a run that answered, by the Berlin day it began; the team's own left out.
starts AS (
  SELECT (r.began AT TIME ZONE 'Europe/Berlin')::date AS day
  FROM runs r LEFT JOIN finished f ON f.session_id = r.session_id
  WHERE r.answered
    AND coalesce(f.user_id, 0) NOT IN (SELECT id FROM staff)
    AND (f.status = 'completed' OR NOT coalesce(r.staff_ip, false))
)
, visits AS (
  SELECT day, count(*) AS n
  FROM funnel_event
  WHERE event_type = 'unique_visitor' AND coalesce(landing_variant, '') <> 'pay_to_start'
    AND lower(btrim(coalesce(utm_source, ''))) NOT IN
        ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')
  GROUP BY day
)
SELECT v.day, (SELECT count(*) FROM starts s WHERE s.day = v.day) AS survey_starts,
       v.n AS visitors,
       round(100.0 * (SELECT count(*) FROM starts s WHERE s.day = v.day) / v.n, 2) AS start_cvr_pct
FROM visits v
WHERE v.day BETWEEN :from AND :to
ORDER BY v.day;`,
    },
    related: ["focus.start-cvr", "focus.fc-visitors", "focus.chart-completion"],
  },

  "focus.start-cvr": {
    label: "Start CVR",
    what: "The share of visitors who started the survey (answered its first question): how well the landing page turns a visit into a start.",
    good: "up",
    stat: "Share",
    per: "per visitor-day",
    formula: { num: "Survey starts", den: "Visitors", mult: "× 100" },
    caveat:
      "A start is a run of the survey that answered its first question, on the day it began. The team's own runs are left out: by their account, and unfinished ones by the networks the team's surveys came from. Visitors count once a day. Starts before 18 Sep 2026 were kept only with their draft (cleared after 30 days), so an older range is blank. Written with 2 decimals.",
    tables: [
      STEPS,
      DRAFTS,
      { ...SUBMISSIONS, columns: "session_id, status, start_date_time, user_id" },
      VISITS,
      USERS,
    ],
    query: {
      lang: "SQL",
      text: `-- Survey starts over visitors, both over the range.
WITH staff AS (SELECT id FROM ap_team_user),
-- The networks the team's own surveys came from: an unfinished run from one is a team test.
staff_ips AS (
  SELECT e.client_ip FROM survey_behavior_event e
  JOIN survey_submission s ON s.session_id = e.session_id
  WHERE s.user_id IN (SELECT id FROM staff) AND e.client_ip IS NOT NULL
  UNION
  SELECT d.client_ip FROM survey_partial_save d
  JOIN survey_submission s ON s.session_id = d.session_id
  WHERE s.user_id IN (SELECT id FROM staff) AND d.client_ip IS NOT NULL
),
-- Every run of the survey (a browser session): when it began, whether it answered its first
-- question (a step answered, a draft past question 1, or a finished survey).
runs AS (
  SELECT session_id, min(at) AS began, bool_or(answered) AS answered,
         bool_or(staff_ip) AS staff_ip
  FROM (
    SELECT session_id, created_at AS at, (answered IS TRUE OR direction = 'complete') AS answered,
           client_ip IN (SELECT client_ip FROM staff_ips) AS staff_ip
    FROM survey_behavior_event WHERE session_id IS NOT NULL
    UNION ALL
    SELECT session_id, started_at, coalesce(current_index, 0) >= 1,
           client_ip IN (SELECT client_ip FROM staff_ips)
    FROM survey_partial_save WHERE session_id IS NOT NULL
    UNION ALL
    SELECT session_id, start_date_time, status = 'completed', false
    FROM survey_submission WHERE session_id IS NOT NULL
  ) x
  GROUP BY session_id
),
finished AS (
  SELECT DISTINCT ON (session_id) session_id, user_id, status
  FROM survey_submission WHERE session_id IS NOT NULL
  ORDER BY session_id, (status = 'completed') DESC, id
),
-- A start: a run that answered, by the Berlin day it began; the team's own left out.
starts AS (
  SELECT (r.began AT TIME ZONE 'Europe/Berlin')::date AS day
  FROM runs r LEFT JOIN finished f ON f.session_id = r.session_id
  WHERE r.answered
    AND coalesce(f.user_id, 0) NOT IN (SELECT id FROM staff)
    AND (f.status = 'completed' OR NOT coalesce(r.staff_ip, false))
)
, visitors AS (
  SELECT count(*) AS n
  FROM funnel_event
  WHERE event_type = 'unique_visitor' AND coalesce(landing_variant, '') <> 'pay_to_start' AND day BETWEEN :from AND :to
    AND lower(btrim(coalesce(utm_source, ''))) NOT IN
        ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')
)
SELECT (SELECT count(*) FROM starts WHERE day BETWEEN :from AND :to) AS survey_starts,
       visitors.n AS visitors,
       round(100.0 * (SELECT count(*) FROM starts WHERE day BETWEEN :from AND :to)
             / nullif(visitors.n, 0), 2) AS start_cvr_pct
FROM visitors;`,
    },
    related: ["focus.completion", "focus.fc-visitors", "focus.subs"],
  },

  "focus.chart-completion": {
    label: "Survey completion",
    what: `The share of survey starts that were finished, per day, week or month. ${WINDOWS}`,
    stat: "Share",
    per: "per survey start, each point",
    formula: { num: "Survey submissions", den: "Survey starts", mult: "× 100, each point" },
    caveat: `A finished survey counts on the day it was submitted and a start on the day it began, so a day can pass 100%. Starts before 18 Sep 2026 are left out (see Start CVR). ${WINDOW_CAVEAT}`,
    tables: [SUBMISSIONS, STEPS, DRAFTS, USERS],
    query: {
      lang: "SQL",
      text: `-- Per day: finished surveys over survey starts (group by week or month for those views).
WITH staff AS (SELECT id FROM ap_team_user),
-- The networks the team's own surveys came from: an unfinished run from one is a team test.
staff_ips AS (
  SELECT e.client_ip FROM survey_behavior_event e
  JOIN survey_submission s ON s.session_id = e.session_id
  WHERE s.user_id IN (SELECT id FROM staff) AND e.client_ip IS NOT NULL
  UNION
  SELECT d.client_ip FROM survey_partial_save d
  JOIN survey_submission s ON s.session_id = d.session_id
  WHERE s.user_id IN (SELECT id FROM staff) AND d.client_ip IS NOT NULL
),
-- Every run of the survey (a browser session): when it began, whether it answered its first
-- question (a step answered, a draft past question 1, or a finished survey).
runs AS (
  SELECT session_id, min(at) AS began, bool_or(answered) AS answered,
         bool_or(staff_ip) AS staff_ip
  FROM (
    SELECT session_id, created_at AS at, (answered IS TRUE OR direction = 'complete') AS answered,
           client_ip IN (SELECT client_ip FROM staff_ips) AS staff_ip
    FROM survey_behavior_event WHERE session_id IS NOT NULL
    UNION ALL
    SELECT session_id, started_at, coalesce(current_index, 0) >= 1,
           client_ip IN (SELECT client_ip FROM staff_ips)
    FROM survey_partial_save WHERE session_id IS NOT NULL
    UNION ALL
    SELECT session_id, start_date_time, status = 'completed', false
    FROM survey_submission WHERE session_id IS NOT NULL
  ) x
  GROUP BY session_id
),
finished AS (
  SELECT DISTINCT ON (session_id) session_id, user_id, status
  FROM survey_submission WHERE session_id IS NOT NULL
  ORDER BY session_id, (status = 'completed') DESC, id
),
-- A start: a run that answered, by the Berlin day it began; the team's own left out.
starts AS (
  SELECT (r.began AT TIME ZONE 'Europe/Berlin')::date AS day
  FROM runs r LEFT JOIN finished f ON f.session_id = r.session_id
  WHERE r.answered
    AND coalesce(f.user_id, 0) NOT IN (SELECT id FROM staff)
    AND (f.status = 'completed' OR NOT coalesce(r.staff_ip, false))
)
, subs AS (
  SELECT (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day, count(*) AS n
  FROM survey_submission s
  WHERE s.status = 'completed'
    AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  GROUP BY 1
)
SELECT d.day::date AS day, coalesce(subs.n, 0) AS survey_submissions,
       (SELECT count(*) FROM starts s WHERE s.day = d.day::date) AS survey_starts,
       round(100.0 * coalesce(subs.n, 0)
             / nullif((SELECT count(*) FROM starts s WHERE s.day = d.day::date), 0), 1)
         AS completion_pct
FROM generate_series(:from::date, :to::date, interval '1 day') AS d(day)
LEFT JOIN subs ON subs.day = d.day::date
ORDER BY 1;`,
    },
    related: ["focus.completion", "focus.chart-start", "focus.subs"],
  },

  "focus.completion": {
    label: "Completion CVR",
    what: "The share of survey starts that ended in a finished survey: how many people the questions lose on the way.",
    good: "up",
    stat: "Share",
    per: "per survey start",
    formula: { num: "Survey submissions", den: "Survey starts", mult: "× 100" },
    caveat:
      "Finished surveys count on the day they were submitted, starts on the day they began. Starts before 18 Sep 2026 are incomplete once their drafts are cleared, so an older range is blank.",
    tables: [SUBMISSIONS, STEPS, DRAFTS, USERS],
    query: {
      lang: "SQL",
      text: `-- Finished surveys over survey starts, both over the range.
WITH staff AS (SELECT id FROM ap_team_user),
-- The networks the team's own surveys came from: an unfinished run from one is a team test.
staff_ips AS (
  SELECT e.client_ip FROM survey_behavior_event e
  JOIN survey_submission s ON s.session_id = e.session_id
  WHERE s.user_id IN (SELECT id FROM staff) AND e.client_ip IS NOT NULL
  UNION
  SELECT d.client_ip FROM survey_partial_save d
  JOIN survey_submission s ON s.session_id = d.session_id
  WHERE s.user_id IN (SELECT id FROM staff) AND d.client_ip IS NOT NULL
),
-- Every run of the survey (a browser session): when it began, whether it answered its first
-- question (a step answered, a draft past question 1, or a finished survey).
runs AS (
  SELECT session_id, min(at) AS began, bool_or(answered) AS answered,
         bool_or(staff_ip) AS staff_ip
  FROM (
    SELECT session_id, created_at AS at, (answered IS TRUE OR direction = 'complete') AS answered,
           client_ip IN (SELECT client_ip FROM staff_ips) AS staff_ip
    FROM survey_behavior_event WHERE session_id IS NOT NULL
    UNION ALL
    SELECT session_id, started_at, coalesce(current_index, 0) >= 1,
           client_ip IN (SELECT client_ip FROM staff_ips)
    FROM survey_partial_save WHERE session_id IS NOT NULL
    UNION ALL
    SELECT session_id, start_date_time, status = 'completed', false
    FROM survey_submission WHERE session_id IS NOT NULL
  ) x
  GROUP BY session_id
),
finished AS (
  SELECT DISTINCT ON (session_id) session_id, user_id, status
  FROM survey_submission WHERE session_id IS NOT NULL
  ORDER BY session_id, (status = 'completed') DESC, id
),
-- A start: a run that answered, by the Berlin day it began; the team's own left out.
starts AS (
  SELECT (r.began AT TIME ZONE 'Europe/Berlin')::date AS day
  FROM runs r LEFT JOIN finished f ON f.session_id = r.session_id
  WHERE r.answered
    AND coalesce(f.user_id, 0) NOT IN (SELECT id FROM staff)
    AND (f.status = 'completed' OR NOT coalesce(r.staff_ip, false))
)
, subs AS (
  SELECT count(*) AS n
  FROM survey_submission s
  WHERE s.status = 'completed'
    AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
    AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
)
SELECT subs.n AS survey_submissions,
       (SELECT count(*) FROM starts WHERE day BETWEEN :from AND :to) AS survey_starts,
       round(100.0 * subs.n
             / nullif((SELECT count(*) FROM starts WHERE day BETWEEN :from AND :to), 0), 1)
         AS completion_pct
FROM subs;`,
    },
    related: ["focus.start-cvr", "focus.subs", "focus.chart-completion"],
  },

  "focus.chart-pre-unlock": {
    label: "Completion → pre-unlock",
    what: `Per day, week or month: the share of that period's finished surveys whose Core Archetype was pre-unlocked (the €1.99 Initial plan) so far, and the revenue per pre-unlock. ${WINDOWS}`,
    stat: "Share, and average per pre-unlock",
    per: "per finished survey, each point",
    formula: {
      num: "Finished surveys pre-unlocked (€1.99 paid)",
      den: "Survey submissions",
      mult: "× 100, each point",
    },
    caveat: `On sale from the evening of 22 Oct 2026, counted from 23 Oct, its first whole day (pay to start's €1.99 page; the report's own €1.99 gate is switched off): points before are blank, never 0%. It follows each period's own finishers, whenever they bought, so recent points can still rise. ${WINDOW_CAVEAT}`,
    tables: [
      SUBMISSIONS,
      { ...PAYMENTS, columns: "metadata (plan), amount, status, is_test, personal_report_id" },
      REPORTS,
      USERS,
    ],
    query: {
      lang: "SQL",
      text: `-- Per day (group by week or month for those views), from 23 Oct 2026: of that day's finished
-- surveys, the share whose Core Archetype was pre-unlocked (EUR 1.99 paid, plan 'initial') so
-- far, and those pre-unlocks' revenue per pre-unlock. E07's EUR 0 gift is no pre-unlock.
WITH subs AS (
  SELECT s.id, (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day
  FROM survey_submission s
  WHERE s.status = 'completed'
    AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN greatest(:from, DATE '2026-10-23') AND :to
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
), pre AS (
  SELECT pr.survey_submission_id AS sid, count(*) AS n, sum(p.amount) AS eur
  FROM payment p
  JOIN personal_report pr ON pr.id = p.personal_report_id
  WHERE p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
    AND p.metadata->>'plan' = 'initial'
  GROUP BY 1
)
SELECT s.day,
       count(*) AS survey_submissions,
       round(100.0 * count(x.sid) / count(*), 2) AS pre_unlock_rate_pct,
       round(sum(x.eur) / nullif(sum(x.n), 0), 2) AS revenue_per_pre_unlock
FROM subs s
LEFT JOIN pre x ON x.sid = s.id
GROUP BY s.day
ORDER BY s.day;`,
    },
    related: ["focus.pre-rate", "focus.rev-per-pre", "focus.chart-full-unlock"],
  },

  "focus.pre-rate": {
    label: "Pre-unlock rate",
    what: "The share of finished surveys whose Core Archetype was pre-unlocked (the €1.99 Initial plan), at any time so far.",
    good: "up",
    stat: "Share",
    per: "per finished survey",
    formula: {
      num: "Finished surveys pre-unlocked (€1.99 paid)",
      den: "Survey submissions",
      mult: "× 100",
    },
    caveat:
      "On sale from the evening of 22 Oct 2026, counted from 23 Oct, its first whole day: a range starting earlier is blank. Today every pre-unlock is bought on pay to start's €1.99 page before the survey (the report's own €1.99 gate is switched off). It counts the period's own finishers, whenever they bought. Written with 2 decimals.",
    tables: [
      SUBMISSIONS,
      { ...PAYMENTS, columns: "metadata (plan), amount, status, is_test, personal_report_id" },
      REPORTS,
      USERS,
    ],
    query: {
      lang: "SQL",
      text: `-- The range's finished surveys whose Core Archetype was pre-unlocked (EUR 1.99 paid) so far,
-- over the range's finished surveys (blank before 23 Oct 2026, its first whole day on sale).
WITH subs AS (
  SELECT s.id,
         EXISTS (SELECT 1
                 FROM payment p
                 JOIN personal_report pr ON pr.id = p.personal_report_id
                 WHERE pr.survey_submission_id = s.id
                   AND p.status = 'succeeded' AND NOT coalesce(p.is_test, false)
                   AND p.amount > 0 AND p.metadata->>'plan' = 'initial') AS pre_unlock
  FROM survey_submission s
  WHERE s.status = 'completed'
    AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
)
SELECT count(*) FILTER (WHERE pre_unlock) AS pre_unlocked,
       count(*) AS survey_submissions,
       -- Blank for a range starting before 23 Oct 2026: nobody could pre-unlock its first days.
       CASE WHEN :from >= DATE '2026-10-23'
            THEN round(100.0 * count(*) FILTER (WHERE pre_unlock) / nullif(count(*), 0), 2) END
         AS pre_unlock_rate_pct
FROM subs;`,
    },
    related: ["focus.rev-per-pre", "focus.chart-pre-unlock", "focus.full-rate"],
  },

  "focus.rev-per-pre": {
    label: "Revenue per pre-unlock",
    what: "The average paid for a pre-unlock by the period's finishers: €1.99, unless a code took some off.",
    good: "up",
    stat: "Average",
    per: "per pre-unlock",
    formula: { num: "Revenue from their pre-unlocks", den: "Their pre-unlocks" },
    caveat: "Blank with no pre-unlock. A 100% code's €0 purchase is no pre-unlock sale.",
    tables: [
      SUBMISSIONS,
      { ...PAYMENTS, columns: "metadata (plan), amount, status, is_test, personal_report_id" },
      REPORTS,
      USERS,
    ],
    query: {
      lang: "SQL",
      text: `-- The pre-unlocks (plan 'initial', above EUR 0) of the range's finished surveys, so far:
-- their revenue over their number.
SELECT sum(p.amount) AS pre_unlock_revenue,
       count(*) AS pre_unlocks,
       round(sum(p.amount) / nullif(count(*), 0), 2) AS revenue_per_pre_unlock
FROM survey_submission s
JOIN personal_report pr ON pr.survey_submission_id = s.id
JOIN payment p ON p.personal_report_id = pr.id
WHERE s.status = 'completed'
  AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
  AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                  WHERE t.id = s.user_id)
  AND p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
  AND p.metadata->>'plan' = 'initial';`,
    },
    related: ["focus.pre-rate", "focus.rev-per-full"],
  },

  "focus.chart-full-unlock": {
    label: "Completion → full unlock",
    what: `Per day, week or month: the share of that period's finished surveys whose report was unlocked in full so far, and the revenue per full unlock. ${WINDOWS}`,
    stat: "Share, and average per full unlock",
    per: "per finished survey, each point",
    formula: {
      num: "Finished surveys unlocked in full (Full, Full All or Core)",
      den: "Survey submissions",
      mult: "× 100, each point",
    },
    caveat: `It follows each period's own finishers, whenever they bought, so recent points can still rise. ${WINDOW_CAVEAT}`,
    tables: [
      SUBMISSIONS,
      { ...PAYMENTS, columns: "metadata (plan), amount, status, is_test, personal_report_id" },
      REPORTS,
      USERS,
    ],
    query: {
      lang: "SQL",
      text: `-- Per day (group by week or month for those views): of that day's finished surveys, the share
-- unlocked in full so far, and those full unlocks' revenue per unlock.
WITH subs AS (
  SELECT s.id, (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day
  FROM survey_submission s
  WHERE s.status = 'completed'
    AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
), full_unlocks AS (
  SELECT pr.survey_submission_id AS sid, count(*) AS n, sum(p.amount) AS eur
  FROM payment p
  JOIN personal_report pr ON pr.id = p.personal_report_id
  WHERE p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
    AND p.metadata->>'plan' IN ('full_report', 'all_reports', 'core')
  GROUP BY 1
)
SELECT s.day,
       count(*) AS survey_submissions,
       round(100.0 * count(f.sid) / count(*), 2) AS full_unlock_rate_pct,
       round(sum(f.eur) / nullif(sum(f.n), 0), 2) AS revenue_per_full_unlock
FROM subs s
LEFT JOIN full_unlocks f ON f.sid = s.id
GROUP BY s.day
ORDER BY s.day;`,
    },
    related: ["focus.full-rate", "focus.rev-per-full", "focus.chart-pre-unlock"],
  },

  "focus.full-rate": {
    label: "Full-unlock rate",
    what: "The share of finished surveys whose report was unlocked in full (Full, Full All or Core), at any time so far: how well the free report sells the full one.",
    good: "up",
    stat: "Share",
    per: "per finished survey",
    formula: {
      num: "Finished surveys unlocked in full",
      den: "Survey submissions",
      mult: "× 100",
    },
    caveat:
      "It counts the period's own finishers, whenever they bought, so a recent range can still rise; an upgrade to full counts. Written with 2 decimals.",
    tables: [
      SUBMISSIONS,
      { ...PAYMENTS, columns: "metadata (plan), amount, status, is_test, personal_report_id" },
      REPORTS,
      USERS,
    ],
    query: {
      lang: "SQL",
      text: `-- The range's finished surveys whose report was unlocked in full (Full, Full All or Core),
-- at any time so far, over the range's finished surveys.
WITH subs AS (
  SELECT s.id,
         EXISTS (SELECT 1
                 FROM payment p
                 JOIN personal_report pr ON pr.id = p.personal_report_id
                 WHERE pr.survey_submission_id = s.id
                   AND p.status = 'succeeded' AND NOT coalesce(p.is_test, false)
                   AND p.amount > 0
                   AND p.metadata->>'plan' IN ('full_report', 'all_reports', 'core')) AS full_unlock
  FROM survey_submission s
  WHERE s.status = 'completed'
    AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
)
SELECT count(*) FILTER (WHERE full_unlock) AS unlocked_in_full,
       count(*) AS survey_submissions,
       round(100.0 * count(*) FILTER (WHERE full_unlock) / nullif(count(*), 0), 2)
         AS full_unlock_rate_pct
FROM subs;`,
    },
    related: ["focus.rev-per-full", "focus.paid-cvr", "focus.chart-full-unlock"],
  },

  "focus.rev-per-full": {
    label: "Revenue per full unlock",
    what: "The average price paid for a full unlock by the period's finishers: what one full unlock earns.",
    good: "up",
    stat: "Average",
    per: "per full unlock",
    formula: { num: "Revenue from their full unlocks", den: "Their full unlocks" },
    caveat:
      "Blank with no full unlock. Prices differ by country and price test, so a few sales swing it.",
    tables: [
      SUBMISSIONS,
      { ...PAYMENTS, columns: "metadata (plan), amount, status, is_test, personal_report_id" },
      REPORTS,
      USERS,
    ],
    query: {
      lang: "SQL",
      text: `-- The full unlocks (Full, Full All, Core) of the range's finished surveys, so far: their
-- revenue over their number.
SELECT sum(p.amount) AS full_unlock_revenue,
       count(*) AS full_unlocks,
       round(sum(p.amount) / nullif(count(*), 0), 2) AS revenue_per_full_unlock
FROM survey_submission s
JOIN personal_report pr ON pr.survey_submission_id = s.id
JOIN payment p ON p.personal_report_id = pr.id
WHERE s.status = 'completed'
  AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
  AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                  WHERE t.id = s.user_id)
  AND p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
  AND p.metadata->>'plan' IN ('full_report', 'all_reports', 'core');`,
    },
    related: ["focus.full-rate", "focus.rev-per-sub"],
  },

  "focus.chart-per-user": {
    label: "Assessments per user",
    what: "Finished surveys per person who finished, each month from May 2026: whether people come back for more than one assessment.",
    stat: "Ratio",
    per: "per person, each month",
    formula: { num: "Survey submissions", den: "People who finished", mult: "each month" },
    caveat:
      "Monthly only: within a day almost everyone is one person per survey. Its months run from May 2026 whatever the range (Marcus, 15 Oct 2026), the last one only to the range's last day; a range starting before May 2026 is shown from its first whole month. A survey without an account counts as one person.",
    tables: [{ ...SUBMISSIONS, columns: "id, user_id, status, created_date_time" }, USERS],
    query: {
      lang: "SQL",
      text: `-- Per month (Berlin): finished surveys over the people who finished them.
-- From 1 May 2026, or from a range's first whole month when it starts before May.
SELECT date_trunc('month', s.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS month,
       count(*) AS survey_submissions,
       count(DISTINCT coalesce('user ' || s.user_id, 'submission ' || s.id)) AS people,
       round(count(*)::numeric
             / count(DISTINCT coalesce('user ' || s.user_id, 'submission ' || s.id)), 2)
         AS assessments_per_user
FROM survey_submission s
WHERE s.status = 'completed'
  AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :window_from AND :to
  AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                  WHERE t.id = s.user_id)
GROUP BY 1
ORDER BY 1;`,
    },
    related: ["focus.per-user", "focus.new-users", "focus.subs"],
  },

  "focus.per-user": {
    label: "Assessments per user",
    what: "Finished surveys per person who finished, over the months shown: 1.00 means nobody took a second assessment.",
    good: "up",
    stat: "Ratio",
    per: "per person",
    formula: { num: "Survey submissions", den: "People who finished" },
    caveat:
      "Each person counts once over the chart's whole window (every month from May 2026 to the range's last day, whatever the range), not once a month added up. A survey without an account counts as one person.",
    tables: [{ ...SUBMISSIONS, columns: "id, user_id, status, created_date_time" }, USERS],
    query: {
      lang: "SQL",
      text: `-- Finished surveys over the people who finished them (a survey without a person is one),
-- over the chart's months: from 1 May 2026, or from a range's first whole month when it starts
-- before May.
SELECT count(*) AS survey_submissions,
       count(DISTINCT coalesce('user ' || s.user_id, 'submission ' || s.id)) AS people,
       round(count(*)::numeric
             / nullif(count(DISTINCT coalesce('user ' || s.user_id, 'submission ' || s.id)), 0), 2)
         AS assessments_per_user
FROM survey_submission s
WHERE s.status = 'completed'
  AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :window_from AND :to
  AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                  WHERE t.id = s.user_id);`,
    },
    related: ["focus.chart-per-user", "focus.new-users"],
  },

  "focus.best": {
    label: "Best performing assessment",
    what: "The live assessment that earns most per finished survey. Only Assessment A is live, so it is the one; the line gives its revenue and cost per submission.",
    stat: "Ranking by an average",
    per: "per finished survey",
    formula: { num: "Revenue", den: "Survey submissions", mult: "ranked, highest first" },
    caveat: "Assessments B and C aren't live, so there is nothing to rank against yet.",
    tables: [PAYMENTS, SUBMISSIONS, REPORTS, USERS],
    query: {
      lang: "SQL",
      text: `-- Revenue (payments in the range, whoever's survey they unlock) over finished surveys.
WITH revenue AS (
  SELECT coalesce(sum(p.amount), 0) AS eur
  FROM payment p
  JOIN personal_report pr ON pr.id = p.personal_report_id
  JOIN survey_submission s ON s.id = pr.survey_submission_id
  WHERE p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
    AND (coalesce(p.payment_date_time, p.created_date_time) AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
), subs AS (
  SELECT count(*) AS n
  FROM survey_submission s
  WHERE s.status = 'completed'
    AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
)
SELECT revenue.eur AS revenue, subs.n AS survey_submissions,
       round(revenue.eur / nullif(subs.n, 0), 2) AS revenue_per_submission
FROM revenue, subs;`,
    },
    related: ["focus.rev-per-sub", "focus.cost-per-sub"],
  },

  "focus.nps": {
    label: "NPS · Assessment A",
    what: "Net Promoter Score isn't asked yet, so there is no figure. Until it is, the line under it shows how readers rate the report's chapters: the share of thumbs-up among all chapter ratings in the range.",
    good: "up",
    stat: "Share",
    per: "per chapter rating",
    formula: {
      num: "Thumbs-up chapter ratings",
      den: "Chapter ratings (up or down)",
      mult: "× 100",
    },
    caveat:
      "A reader can rate several chapters, so it counts ratings, not people. Ratings aren't split by source, device, tier or visitor: under those filters the line says it is all traffic's. The team's own are left out.",
    tables: [RATINGS, { ...SUBMISSIONS, columns: "id, user_id" }, USERS],
    query: {
      lang: "SQL",
      text: `-- No NPS question is asked yet. The line under it reads the chapter ratings given in the
-- range (thumbs up or down at the end of a chapter), the team's own left out.
SELECT count(*) FILTER (WHERE f.feedback = 'up') AS helpful,
       count(*) FILTER (WHERE f.feedback IN ('up', 'down')) AS ratings,
       round(100.0 * count(*) FILTER (WHERE f.feedback = 'up')
             / nullif(count(*) FILTER (WHERE f.feedback IN ('up', 'down')), 0)) AS helpful_pct
FROM report_section_feedback f
WHERE (f.created_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
  AND NOT EXISTS (SELECT 1
                  FROM survey_submission s
                  JOIN ap_team_user t ON t.id = s.user_id
                  WHERE s.id = f.survey_submission_id);`,
    },
    related: ["focus.report-time"],
  },

  "focus.survey-time": {
    label: "Median survey time · A",
    what: "How long the middle finisher took from the first question to submitting: half took less, half took longer.",
    stat: "Median",
    per: "per finished survey",
    formula: {
      num: "The middle survey time (first question to submit) of the period's finished surveys",
    },
    caveat:
      "A median, so a few surveys left open for hours don't drag it. Surveys without a recorded time are left out. Written in minutes and whole seconds (m:ss).",
    tables: [{ ...SUBMISSIONS, columns: "duration_ms, status, created_date_time, user_id" }, USERS],
    query: {
      lang: "SQL",
      text: `-- The median time from the first question to submitting, over the range's finished surveys
-- with a recorded time.
SELECT floor(median_seconds / 60) || ':' || lpad((median_seconds % 60)::text, 2, '0') AS median_mmss,
       median_seconds, timed_submissions
FROM (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY s.duration_ms) / 1000)::int
               AS median_seconds,
             count(*) AS timed_submissions
      FROM survey_submission s
      WHERE s.status = 'completed' AND s.duration_ms > 0
        AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
        AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                        WHERE t.id = s.user_id)) x;`,
    },
    related: ["focus.report-time", "focus.subs"],
  },

  "focus.report-time": {
    label: "Median report time · A",
    what: "How long the middle reader spent in their report over all their visits so far, among the period's finishers whose reading was measured.",
    stat: "Median",
    per: "per reader",
    formula: {
      num: "The middle reader's reading time (all their visits, each session up to 30 minutes)",
    },
    caveat:
      "Every visit is measured from 18 Sep 2026 (before, only with cookie consent). A session counts up to 30 minutes (longer is mostly a tab left open), and one without a plausible end counts nothing. The average beside it is pulled up by long readers. Robots and the team's own are left out.",
    tables: [SESSIONS, REPORTS, SUBMISSIONS, USERS],
    query: {
      lang: "SQL",
      text: `-- Each finisher of the range: their reading over every report visit so far, each session
-- with a plausible end (under 4 hours) counting up to 30 minutes. The median over the
-- readers with such a session; the average beside it.
WITH subs AS (
  SELECT s.id
  FROM survey_submission s
  WHERE s.status = 'completed'
    AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
), reading AS (
  SELECT pr.survey_submission_id AS sid,
         sum(least(extract(epoch FROM rs.ended_at - rs.started_at), 1800)) AS seconds
  FROM report_session rs
  JOIN personal_report pr ON pr.id = rs.personal_report_id
  WHERE pr.survey_submission_id IN (SELECT id FROM subs)
    AND rs.ended_at > rs.started_at
    AND rs.ended_at - rs.started_at < interval '4 hours'
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = rs.user_id)
    -- robots and scripts that open reports
    AND coalesce(rs.user_agent, '') !~* '(adsbot|headless|bot[/;) ]|crawler|spider|^curl/|^wget/|python-requests|go-http-client|okhttp|node-fetch|axios/)'
  GROUP BY 1
)
SELECT readers,
       floor(median_seconds / 60) || ':' || lpad((median_seconds % 60)::text, 2, '0') AS median_mmss,
       floor(average_seconds / 60) || ':' || lpad((average_seconds % 60)::text, 2, '0') AS average_mmss
FROM (SELECT count(*) AS readers,
             round(percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds))::int AS median_seconds,
             round(avg(seconds))::int AS average_seconds
      FROM reading) x;`,
    },
    related: ["focus.survey-time", "focus.nps"],
  },

  "focus.paid-cvr": {
    label: "Paid CVR",
    what: "The share of finished surveys whose report was paid for (any plan), at any time so far.",
    good: "up",
    stat: "Share",
    per: "per finished survey",
    formula: {
      num: "Finished surveys with a real payment",
      den: "Survey submissions",
      mult: "× 100",
    },
    caveat:
      "It follows the period's own finishers, whenever they paid, so a recent range can still rise. Revenue per submission counts differently: the payments made in the range, by anyone.",
    tables: [
      SUBMISSIONS,
      { ...PAYMENTS, columns: "amount, status, is_test, personal_report_id" },
      REPORTS,
      USERS,
    ],
    query: {
      lang: "SQL",
      text: `-- The range's finished surveys whose report has a real payment, at any time so far, over the
-- range's finished surveys.
WITH subs AS (
  SELECT s.id,
         EXISTS (SELECT 1
                 FROM payment p
                 JOIN personal_report pr ON pr.id = p.personal_report_id
                 WHERE pr.survey_submission_id = s.id
                   AND p.status = 'succeeded' AND NOT coalesce(p.is_test, false)
                   AND p.amount > 0) AS paid
  FROM survey_submission s
  WHERE s.status = 'completed'
    AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date BETWEEN :from AND :to
    AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                    WHERE t.id = s.user_id)
)
SELECT count(*) FILTER (WHERE paid) AS paid, count(*) AS survey_submissions,
       round(100.0 * count(*) FILTER (WHERE paid) / nullif(count(*), 0), 2) AS paid_cvr_pct
FROM subs;`,
    },
    related: ["focus.full-rate", "focus.rev-per-sub"],
  },

  "focus.asm-trend": {
    label: "Submissions trend",
    what: "Finished surveys per day over the range, with a straight line fitted through them: how much the line changes from the first day to the last, and its value on each.",
    stat: "Trend (least squares)",
    per: "per day",
    formula: { num: "The line's last day − its first day", den: "Its first day", mult: "× 100" },
    caveat:
      "A fitted line, so one busy or quiet day moves it little. It reads flat when the line starts at nothing, and grey under 3%.",
    tables: [SUBMISSIONS, USERS],
    query: {
      lang: "SQL",
      text: `-- Finished surveys per day over the range, and the least-squares line through them: its
-- value on the first and the last day, and the change between.
WITH per_day AS (
  SELECT d.i, count(s.id) AS n
  FROM (SELECT day::date AS day, row_number() OVER (ORDER BY day) - 1 AS i
        FROM generate_series(:from::date, :to::date, interval '1 day') day) d
  LEFT JOIN survey_submission s
    ON s.status = 'completed'
   AND (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date = d.day
   AND NOT EXISTS (SELECT 1 FROM ap_team_user t
                   WHERE t.id = s.user_id)
  GROUP BY d.i
)
SELECT round(regr_intercept(n, i)::numeric, 1) AS first_day,
       round((regr_intercept(n, i) + regr_slope(n, i) * max(i))::numeric, 1) AS last_day,
       round((100 * regr_slope(n, i) * max(i) / abs(regr_intercept(n, i)))::numeric)
         AS change_pct
FROM per_day;`,
    },
    related: ["focus.subs", "focus.chart-submissions"],
  },
};
