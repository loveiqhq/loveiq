/**
 * The Pay to start page's fields: each measure of "Funnel metrics compared", each step of the
 * step cards and the week-by-week chart (Eman, 25 Oct 2026: the rows had only a hover hint).
 * Each query was run read-only on production for 10–24 Oct and 1 May – 24 Oct 2026 and gave the
 * page's own figures.
 */
import { ADS_LANDING, FC_FREE, REPORTS, USERS } from "./focus";
import { STARTS_CTES } from "./survey";
import type { FieldRegistry, FieldTable } from "./types";

/** Said on every card: the page doesn't take the filter bar's narrowing. */
const WHOLE =
  "Each funnel is read whole: the Funnel filter, source, device, country tier and visitor type don't narrow this page.";
/** The table's second view, said once. */
const PAID_VIEW =
  "With Paid traffic only, it counts those whose survey (pay after the report) or purchase (pay to start) came through a Google Ads click.";
const COHORT =
  "A cohort figure: the range's finishers (pay after the report) and buyers (pay to start), with what they paid so far, so a recent range still rises.";
const NOT_SPLIT = "None: the page reads each funnel whole";

const T_VISITS: FieldTable = {
  source: "production",
  table: "funnel_event",
  columns:
    "event_type ('unique_visitor'), day, landing_variant ('pay_to_start' on its two pages), offer ('full', 'pre'), utm_source",
  filters: `Period (day). ${NOT_SPLIT}`,
  watch:
    "One row per visitor per day, written by the server for every visitor. The free survey's visitors are every other landing page's. Pay to start's two pages are counted apart from 24 Oct 2026 (offer): earlier visits to them are in neither offer. Our own probe visits are left out.",
};
const T_SUBS: FieldTable = {
  source: "production",
  table: "survey_submission",
  columns: "id, status ('completed'), created_date_time, user_id, utm_tracker",
  filters: `Period (created_date_time, Berlin day): the free survey's finishers. ${NOT_SPLIT}`,
  watch:
    "A survey a completed pay-to-start purchase claimed is pay to start's. The team's own and our probes are left out.",
};
const T_GATE_EVENTS: FieldTable = {
  source: "production",
  table: "analytics_event",
  columns:
    "survey_submission_id, event_type ('initial_gate_cta_click', 'initial_gate_back'), metadata->>'place' ('card', 'sticky', and from 28 Oct 2026 'exit_card', 'exit_sticky')",
  filters: `Period: through the finishers it belongs to (their survey's day). ${NOT_SPLIT}`,
  watch:
    "One row a press on the report's €1.99 page, written by the page. “Not ready to unlock yet” (initial_gate_back) is stored from 27 Oct 2026; from 28 Oct 2026 it opens the page's exit page, whose Unlock presses are the 'exit_' places.",
};
const T_PREPAID: FieldTable = {
  source: "production",
  table: "prepaid_report_access",
  columns:
    "offer ('full', 'pre'), status, amount_cents, paid_at, created_at, consumed_submission_id, is_test, customer_email, utm_tracker",
  filters: `Period (paid_at, Berlin day): the purchases of the range. ${NOT_SPLIT}`,
  watch:
    "A purchase counts once its checkout completed, a 100% code's €0 one too. Test purchases, the team's addresses (@loveiq.org), our own probes and a purchase whose survey the team took are left out.",
};
const T_PAYMENTS: FieldTable = {
  source: "production",
  table: "payment",
  columns: "amount, status ('succeeded'), is_test, personal_report_id, metadata (plan, journey)",
  filters: "None: everything the funnel's customers paid, whenever",
  watch:
    "Test payments and €0 unlocks are left out; a payment refunded in full is no longer 'succeeded'. Pay to start's purchase is also written on the report at the claim, labelled with its journey, and is counted once.",
};
const T_SESSIONS: FieldTable = {
  source: "production",
  table: "report_session",
  columns: "personal_report_id, started_at",
  filters: "Through the finisher whose report it is",
  watch: "Every visit is recorded from 18 Sep 2026; before, only with cookie consent.",
};
const T_QUOTES: FieldTable = {
  source: "production",
  table: "report_price_quote",
  columns: "survey_submission_id, paywall_reached_at, checkout_started_at",
  filters: "Through the finisher whose report it priced",
};

/** A tracker's JSON, or null where it isn't JSON. */
const json = (col: string) => `CASE WHEN pg_input_is_valid(${col}, 'jsonb') THEN ${col}::jsonb END`;
/** Our own probes (utm_medium=probe, or a verification source). */
const ours = (j: string) => `coalesce(jsonb_typeof(${j}) = 'object'
         AND (lower(btrim(${j}->>'utm_medium')) = 'probe'
              OR lower(btrim(${j}->>'utm_source')) IN ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')), false)`;
/** A Google Ads click: Google's click id, or a Google cpc tag. */
const ad = (j: string) => `coalesce(jsonb_typeof(${j}) = 'object'
         AND (coalesce(${j}->>'gclid', '') <> '' OR coalesce(${j}->>'gbraid', '') <> '' OR coalesce(${j}->>'wbraid', '') <> ''
              OR (lower(btrim(${j}->>'utm_source')) = 'google'
                  AND lower(btrim(${j}->>'utm_medium')) IN ('cpc', 'ppc', 'paid', 'ads'))), false)`;
/** A purchase that counts: not a test, not the team's address, not our probe. */
const PURCHASE_COUNTS = `NOT coalesce(e.is_test, false)
     AND coalesce(e.customer_email, '') !~* '^.+@loveiq\\.org$'
     AND NOT ${ours("t.j")}
     -- nor one whose survey the team or our probe took
     AND NOT EXISTS (SELECT 1 FROM survey_submission s, LATERAL (SELECT ${json("s.utm_tracker")} AS j) u
                      WHERE s.id = e.consumed_submission_id AND s.status = 'completed'
                        AND (EXISTS (SELECT 1 FROM ap_team_user tu WHERE tu.id = s.user_id)
                             OR ${ours("u.j")}))`;

/** Pay to start's buyers and visits, after the free survey's row (FC_FREE). */
const PTS = `,
-- The free survey's finishers whose link was a Google Ads click (the Paid traffic only view).
free_ad AS (
  SELECT f.id FROM free f JOIN survey_submission s ON s.id = f.id
   WHERE ${ad(json("s.utm_tracker"))}
),
-- Each finisher's payments so far: the card fee is per payment.
free_sales AS (
  SELECT pr.survey_submission_id AS sid, count(*) AS n
    FROM payment p JOIN personal_report pr ON pr.id = p.personal_report_id
   WHERE p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
     AND pr.survey_submission_id IN (SELECT id FROM free)
   GROUP BY 1
),
-- Pay to start's buyers: purchases on its two pages whose checkout completed in the range (a
-- 100% code's EUR 0 one too), refunded since or not.
pts AS (
  SELECT e.id, e.offer, e.status, e.amount_cents, e.paid_at, e.consumed_submission_id AS sid, t.j
    FROM prepaid_report_access e, b, LATERAL (SELECT ${json("e.utm_tracker")} AS j) t
   WHERE e.offer IN ('full', 'pre') AND e.status IN ('succeeded', 'refunded')
     AND e.paid_at >= b.since_ts AND e.paid_at < b.until_ts
     AND ${PURCHASE_COUNTS}
),
-- What each bought on the report after the purchase (the purchase's own row there carries its
-- journey and is counted once, above).
later AS (
  SELECT pr.survey_submission_id AS sid, sum(p.amount) AS eur, count(*) AS n,
         bool_or(p.metadata->>'plan' IN ('full_report', 'all_reports', 'core')) AS full
    FROM payment p JOIN personal_report pr ON pr.id = p.personal_report_id
   WHERE p.status = 'succeeded' AND NOT coalesce(p.is_test, false) AND p.amount > 0
     AND coalesce(p.metadata->>'journey', '') = ''
     AND pr.survey_submission_id IN (SELECT sid FROM pts)
   GROUP BY 1
),
buyers AS (
  SELECT x.id, x.offer, x.sid, x.paid_at, ${ad("x.j")} AS ad,
         (x.status = 'succeeded' AND coalesce(x.amount_cents, 0) > 0) AS paid_kept,
         CASE WHEN x.status = 'succeeded' THEN coalesce(x.amount_cents, 0) / 100.0 ELSE 0 END
           + coalesce(l.eur, 0) AS money,
         CASE WHEN x.status = 'succeeded' AND coalesce(x.amount_cents, 0) > 0 THEN 1 ELSE 0 END
           + coalesce(l.n, 0) AS sales,
         coalesce(l.full, false) AS bought_full
    FROM pts x LEFT JOIN later l ON l.sid = x.sid
),
-- Each page's visitors. Days before the two pages were counted apart have visits with no offer:
-- an offer that sold on one of them has no visits (blank), its buyers' own being missing.
pts_visit_rows AS (
  SELECT f.day, f.offer FROM funnel_event f
   WHERE f.event_type = 'unique_visitor' AND f.landing_variant = 'pay_to_start'
     AND f.day BETWEEN :from AND :to
     AND lower(btrim(coalesce(f.utm_source, ''))) NOT IN
         ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')
),
pts_visits AS (
  SELECT o.offer,
         CASE WHEN EXISTS (SELECT 1 FROM buyers x
                            WHERE x.offer = o.offer AND x.money > 0
                              AND (x.paid_at AT TIME ZONE 'Europe/Berlin')::date IN
                                  (SELECT day FROM pts_visit_rows WHERE offer IS NULL))
              THEN NULL
              ELSE (SELECT count(*) FROM pts_visit_rows r WHERE r.offer = o.offer) END AS n
    FROM (VALUES ('full'), ('pre')) o(offer)
)`;

/** Every funnel's counts, both views: what the table's measures are worked out from. */
const METRICS =
  FC_FREE +
  PTS +
  `
-- Each funnel's counts, all traffic, then (ad_) those who came through a Google Ads click. With
-- the Ad spend and Ad clicks rows they give every measure of the table.
SELECT funnel, visits, survey_completions, paying_customers, revenue, finishers_revenue,
       payments, finishers_payments, ad_survey_completions, ad_paying_customers, ad_revenue
  FROM (
  SELECT 1 AS o, 'Pay after the report' AS funnel, (SELECT visitors FROM after) AS visits,
         count(*) AS survey_completions,
         count(*) FILTER (WHERE p.eur > 0) AS paying_customers,
         round(coalesce(sum(p.eur), 0), 2) AS revenue,
         round(coalesce(sum(p.eur), 0), 2) AS finishers_revenue,
         coalesce(sum(fs.n), 0) AS payments, coalesce(sum(fs.n), 0) AS finishers_payments,
         count(a.id) AS ad_survey_completions,
         count(a.id) FILTER (WHERE p.eur > 0) AS ad_paying_customers,
         round(coalesce(sum(p.eur) FILTER (WHERE a.id IS NOT NULL), 0), 2) AS ad_revenue
    FROM free f LEFT JOIN paid p ON p.sid = f.id LEFT JOIN free_sales fs ON fs.sid = f.id
    LEFT JOIN free_ad a ON a.id = f.id
   WHERE NOT f.gate
  UNION ALL
  SELECT CASE v.offer WHEN 'full' THEN 2 ELSE 3 END,
         CASE v.offer WHEN 'full' THEN 'Pay to start · €29.99' ELSE 'Pay to start · €1.99' END,
         max(v.n),
         count(x.id) FILTER (WHERE x.sid IS NOT NULL),
         count(x.id) FILTER (WHERE x.money > 0),
         round(coalesce(sum(x.money), 0), 2),
         round(coalesce(sum(x.money) FILTER (WHERE x.sid IS NOT NULL), 0), 2),
         coalesce(sum(x.sales), 0),
         coalesce(sum(x.sales) FILTER (WHERE x.sid IS NOT NULL), 0),
         count(x.id) FILTER (WHERE x.ad AND x.sid IS NOT NULL),
         count(x.id) FILTER (WHERE x.ad AND x.money > 0),
         round(coalesce(sum(x.money) FILTER (WHERE x.ad), 0), 2)
    FROM pts_visits v LEFT JOIN buyers x ON x.offer = v.offer
   GROUP BY v.offer
  UNION ALL
  -- The report's own EUR 1.99 page, while it runs: its daily share of the free survey.
  SELECT 4, '€1.99 after the survey',
         (SELECT round(sum(v.n * coalesce(sh.gate, 0))) FROM visits v LEFT JOIN share sh ON sh.day = v.day),
         count(*), count(*) FILTER (WHERE p.eur > 0),
         round(coalesce(sum(p.eur), 0), 2), round(coalesce(sum(p.eur), 0), 2),
         coalesce(sum(fs.n), 0), coalesce(sum(fs.n), 0),
         count(a.id), count(a.id) FILTER (WHERE p.eur > 0),
         round(coalesce(sum(p.eur) FILTER (WHERE a.id IS NOT NULL), 0), 2)
    FROM free f LEFT JOIN paid p ON p.sid = f.id LEFT JOIN free_sales fs ON fs.sid = f.id
    LEFT JOIN free_ad a ON a.id = f.id
   WHERE f.gate
) x
 ORDER BY o;
`;

/** The step cards' counts, besides the starts (their own query). */
const STEPS =
  FC_FREE +
  PTS +
  `,
-- Opened: a reading session (the team's and robots' left out) or, where none was recorded,
-- another sign the report was open: the paywall reached or clicked, a checkout or a payment.
free_steps AS (
  SELECT f.id, f.gate,
         EXISTS (SELECT 1 FROM personal_report pr JOIN report_session rs ON rs.personal_report_id = pr.id
                  WHERE pr.survey_submission_id = f.id
                    AND NOT EXISTS (SELECT 1 FROM ap_team_user tu WHERE tu.id = rs.user_id)
                    AND coalesce(rs.user_agent, '') !~* '(adsbot|headless|bot[/;) ]|crawler|spider|^curl/|^wget/|python-requests|go-http-client|okhttp|node-fetch|axios/)')
           OR EXISTS (SELECT 1 FROM report_price_quote q
                       WHERE q.survey_submission_id = f.id
                         AND (q.paywall_reached_at IS NOT NULL OR q.checkout_started_at IS NOT NULL))
           OR EXISTS (SELECT 1 FROM analytics_event a
                       WHERE a.survey_submission_id = f.id AND a.event_type = 'paywall_initiated'
                         AND coalesce(a.metadata->>'source', '') <> 'offer_link')
           OR coalesce(p.eur, 0) > 0 AS opened,
         EXISTS (SELECT 1 FROM report_price_quote q
                  WHERE q.survey_submission_id = f.id AND q.checkout_started_at IS NOT NULL) AS checkout,
         coalesce(p.eur, 0) > 0 AS paid
    FROM free f LEFT JOIN paid p ON p.sid = f.id
),
-- Pay to start's checkouts: every checkout opened or paid in the range, paid or not.
pts_checkouts AS (
  SELECT e.offer, count(*) AS n
    FROM prepaid_report_access e, b, LATERAL (SELECT ${json("e.utm_tracker")} AS j) t
   WHERE e.offer IN ('full', 'pre')
     AND ((e.created_at >= b.since_ts AND e.created_at < b.until_ts)
          OR (e.paid_at >= b.since_ts AND e.paid_at < b.until_ts))
     AND ${PURCHASE_COUNTS}
   GROUP BY 1
)
SELECT funnel, step, n FROM (
  SELECT 1 AS o, 'Pay after the report' AS funnel, 'Visits' AS step, (SELECT visitors FROM after) AS n
  UNION ALL SELECT 3, 'Pay after the report', 'Survey finished', count(*) FROM free_steps WHERE NOT gate
  UNION ALL SELECT 4, 'Pay after the report', 'Report opened', count(*) FILTER (WHERE opened) FROM free_steps WHERE NOT gate
  UNION ALL SELECT 5, 'Pay after the report', 'Checkout started', count(*) FILTER (WHERE checkout) FROM free_steps WHERE NOT gate
  UNION ALL SELECT 6, 'Pay after the report', 'Paid', count(*) FILTER (WHERE paid) FROM free_steps WHERE NOT gate
  UNION ALL SELECT 10 + (v.offer = 'pre')::int * 10, CASE v.offer WHEN 'full' THEN 'Pay to start · €29.99' ELSE 'Pay to start · €1.99' END, 'Visits', v.n FROM pts_visits v
  UNION ALL SELECT 11 + (v.offer = 'pre')::int * 10, CASE v.offer WHEN 'full' THEN 'Pay to start · €29.99' ELSE 'Pay to start · €1.99' END, 'Checkout started', coalesce(c.n, 0)
    FROM pts_visits v LEFT JOIN pts_checkouts c ON c.offer = v.offer
  UNION ALL SELECT 12 + (v.offer = 'pre')::int * 10, CASE v.offer WHEN 'full' THEN 'Pay to start · €29.99' ELSE 'Pay to start · €1.99' END, 'Paid', count(x.id) FILTER (WHERE x.paid_kept)
    FROM pts_visits v LEFT JOIN buyers x ON x.offer = v.offer GROUP BY v.offer
  UNION ALL SELECT 13 + (v.offer = 'pre')::int * 10, CASE v.offer WHEN 'full' THEN 'Pay to start · €29.99' ELSE 'Pay to start · €1.99' END, 'Survey finished', count(x.id) FILTER (WHERE x.sid IS NOT NULL)
    FROM pts_visits v LEFT JOIN buyers x ON x.offer = v.offer GROUP BY v.offer
  UNION ALL SELECT 14 + (v.offer = 'pre')::int * 10, CASE v.offer WHEN 'full' THEN 'Pay to start · €29.99' ELSE 'Pay to start · €1.99' END, 'Report opened',
         count(x.id) FILTER (WHERE x.sid IS NOT NULL AND EXISTS (
           SELECT 1 FROM personal_report pr JOIN report_session rs ON rs.personal_report_id = pr.id
            WHERE pr.survey_submission_id = x.sid))
    FROM pts_visits v LEFT JOIN buyers x ON x.offer = v.offer GROUP BY v.offer
  UNION ALL SELECT 25, 'Pay to start · €1.99', 'Bought the full report', count(*) FILTER (WHERE bought_full)
    FROM buyers WHERE offer = 'pre'
) s
 ORDER BY o;
`;

/** The free survey's starts: the Survey page's, less those of people who paid to start first. */
const STARTED =
  STARTS_CTES +
  `,
-- Pay to start's buyers' starts: the start of a finished survey a completed purchase claimed.
-- They are pay to start's, so they come off the free survey's starts here.
buyer_starts AS (
  SELECT count(*) AS n
    FROM survey_submission s, b, LATERAL (SELECT ${json("s.utm_tracker")} AS j) t
   WHERE s.status = 'completed'
     AND coalesce(s.start_date_time, s.created_date_time) >= b.since_ts
     AND coalesce(s.start_date_time, s.created_date_time) < b.until_ts
     AND s.id IN (SELECT consumed_submission_id FROM prepaid_report_access
                   WHERE offer IS NOT NULL AND consumed_submission_id IS NOT NULL
                     AND paid_at IS NOT NULL AND status IN ('succeeded', 'refunded'))
     AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
     AND NOT ${ours("t.j")}
)
SELECT (SELECT count(*) FROM starts, b
         WHERE started_at >= b.since_ts AND started_at < b.until_ts
           AND NOT (known AND ${ours("tag")}))
       - (SELECT n FROM buyer_starts) AS survey_started;
`;

/** The €1.99 page's funnel: who of its finishers saw the page. */
const GATE_SEEN =
  FC_FREE +
  `
-- The report's own EUR 1.99 page, while it is switched on: its finishers (the cohort stamped at
-- their survey's submit), and those whose view of the page was recorded.
SELECT count(*) AS finished, count(*) FILTER (WHERE pr.initial_gate_seen_at IS NOT NULL) AS saw_the_page
  FROM free f JOIN personal_report pr ON pr.survey_submission_id = f.id
 WHERE f.gate;
`;

/** The €1.99 page's buttons and its way out: who of its finishers pressed what. */
const GATE_PRESSED =
  FC_FREE +
  `
-- What the report's EUR 1.99 page's finishers did on it, from its own events (one row a press):
-- pressed "Unlock now" on the card or on the bar, pressed "Not ready to unlock yet" (stored
-- since 27 Oct 2026), or, on the exit page it opens from 28 Oct 2026, pressed Unlock there.
-- Each reader counts once a line.
SELECT count(DISTINCT f.id) FILTER (WHERE a.event_type = 'initial_gate_cta_click') AS pressed_unlock,
       count(DISTINCT f.id) FILTER (WHERE a.event_type = 'initial_gate_cta_click'
                                      AND coalesce(a.metadata->>'place', 'card') = 'card') AS on_the_card,
       count(DISTINCT f.id) FILTER (WHERE a.event_type = 'initial_gate_cta_click'
                                      AND a.metadata->>'place' = 'sticky') AS on_the_bar,
       count(DISTINCT f.id) FILTER (WHERE a.event_type = 'initial_gate_cta_click'
                                      AND a.metadata->>'place' IN ('exit_card', 'exit_sticky')) AS on_the_exit_page,
       count(DISTINCT f.id) FILTER (WHERE a.event_type = 'initial_gate_back') AS not_ready
  FROM free f JOIN analytics_event a ON a.survey_submission_id = f.id
 WHERE f.gate AND a.event_type IN ('initial_gate_cta_click', 'initial_gate_back');
`;

/** Week by week: each funnel's counts per week (Monday to Sunday, clipped to the range). */
const WEEKS =
  FC_FREE +
  PTS +
  `
-- Each customer in the week they came in: the week their free survey was finished, or the week
-- they paid to start. With each week's Ad spend (the Ad spend row's query, by week) these give
-- cost per paying customer, visit -> paying customer and ROAS.
SELECT funnel, week, visits, paying_customers, revenue FROM (
  SELECT 1 AS o, 'Pay after the report' AS funnel, w.week,
         (SELECT round(sum(v.n * (1 - coalesce(sh.gate, 0)))) FROM visits v LEFT JOIN share sh ON sh.day = v.day
           WHERE date_trunc('week', v.day)::date = w.week) AS visits,
         count(*) FILTER (WHERE p.eur > 0) AS paying_customers,
         round(coalesce(sum(p.eur), 0), 2) AS revenue
    FROM (SELECT DISTINCT date_trunc('week', d)::date AS week
            FROM generate_series(:from::date, :to::date, interval '1 day') d) w
    LEFT JOIN free f ON date_trunc('week', f.day)::date = w.week AND NOT f.gate
    LEFT JOIN paid p ON p.sid = f.id
   GROUP BY w.week
  UNION ALL
  SELECT 2, CASE o.offer WHEN 'full' THEN 'Pay to start · €29.99' ELSE 'Pay to start · €1.99' END, w.week,
         (SELECT count(*) FROM pts_visit_rows r WHERE r.offer = o.offer AND date_trunc('week', r.day)::date = w.week),
         count(x.id) FILTER (WHERE x.money > 0),
         round(coalesce(sum(x.money), 0), 2)
    FROM (VALUES ('full'), ('pre')) o(offer)
    CROSS JOIN (SELECT DISTINCT date_trunc('week', d)::date AS week
                  FROM generate_series(:from::date, :to::date, interval '1 day') d) w
    LEFT JOIN buyers x ON x.offer = o.offer
     AND date_trunc('week', (x.paid_at AT TIME ZONE 'Europe/Berlin')::date)::date = w.week
   GROUP BY o.offer, w.week
) s
 ORDER BY o, funnel, week;
`;

/** Google Ads by landing page: the free survey's every page but the two pay-to-start pages. */
const ADS = {
  lang: "GAQL" as const,
  text: `-- Google Ads cost and clicks per landing page and day: the pay-to-start pages are
-- /sexual-archetype (EUR 29.99) and /sexual-archetype/initial (EUR 1.99); every other page is
-- the free survey's (pay after the report, and while it runs the EUR 1.99 page's daily share).
SELECT landing_page_view.unexpanded_final_url, segments.date, metrics.cost_micros, metrics.clicks
FROM landing_page_view
WHERE segments.date BETWEEN :from AND :to`,
};
const SQL = (text: string) => ({ lang: "SQL" as const, text });

const MONEY_TABLES = [T_SUBS, T_PAYMENTS, REPORTS, USERS, T_PREPAID];

export const fields: FieldRegistry = {
  // ---- Ads
  "pts.spend": {
    label: "Ad spend",
    what: "What Google Ads cost for each funnel's own pages, by the page the ad lands on: the two pay-to-start pages, and every other page for the free survey.",
    stat: "Sum",
    per: "per euro",
    formula: { num: "Google Ads cost of the ads that land on the funnel's pages" },
    caveat: `Google's cost by landing page adds up to the whole account's to the cent. While the report's €1.99 page runs, it takes its daily share of the free survey's spend. The same in both traffic views. ${WHOLE}`,
    tables: [ADS_LANDING],
    query: ADS,
    related: ["pts.clicks", "pts.cpp", "pts.roas"],
  },
  "pts.clicks": {
    label: "Ad clicks",
    what: "Clicks on the Google Ads that land on each funnel's pages, as Google counts them.",
    stat: "Count",
    per: "per click",
    formula: { num: "Google Ads clicks on the ads that land on the funnel's pages" },
    caveat: `Google counts every click, so a person who clicks twice counts twice; Visits counts a visitor once a day, so the two rarely match. ${WHOLE}`,
    tables: [ADS_LANDING],
    query: ADS,
    related: ["pts.spend", "pts.cpc", "pts.visits"],
  },
  "pts.cpc": {
    label: "Cost per click",
    what: "What one ad click on the funnel's pages cost.",
    good: "down",
    stat: "Average",
    per: "per click",
    formula: { num: "Ad spend", den: "Ad clicks" },
    caveat: "Blank with no click, or when Google Ads can't be read.",
    tables: [ADS_LANDING],
    query: ADS,
    related: ["pts.spend", "pts.clicks"],
  },

  // ---- Conversion
  "pts.visits": {
    label: "Visits",
    what: "Visitors to each funnel's own pages, each counted once a day: the free survey's landing pages, and each pay-to-start page. Every measure per visit divides by it.",
    stat: "Count",
    per: "per visitor-day (a visitor counts once a day)",
    formula: { num: "Visitors each day, added up over the range" },
    caveat: `From every source (ads, search, direct, email, shares), so there are usually more visits than ad clicks. With Paid traffic only, Visits is the ad clicks. While the report's €1.99 page runs, it takes its daily share of the free survey's visitors, which are blank for a range starting before 15 Jun 2026 (the visit log is whole from then). Pay to start's two pages are counted apart from 24 Oct 2026: earlier visits to them are in neither offer, and an offer that sold on such a day has no visits (blank, never 0). ${WHOLE}`,
    tables: [T_VISITS],
    query: SQL(METRICS),
    related: ["pts.cvr", "pts.rpv", "pts.clicks"],
  },
  "pts.completions": {
    label: "Survey completions",
    what: "Surveys finished in each funnel: the range's free-survey finishers, and the surveys finished by the people who paid to start in the range.",
    good: "up",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Surveys finished (pay to start: its buyers of the range who finished)" },
    caveat: `Pay after the report counts a survey on the day it was finished; pay to start counts its buyers of the range who have finished so far, so a recent range still rises. The team's own and our probes are left out. ${PAID_VIEW} Market (step cards): ≈59.1% of starts, Riddle's median completion of quizzes with 16+ questions.`,
    tables: [T_SUBS, T_PREPAID, USERS],
    query: SQL(METRICS),
    related: ["pts.finish-rate", "pts.rpf", "pts.cpf"],
  },
  "pts.finish-rate": {
    label: "Visit → survey completion",
    what: "The share of the funnel's visits that ended in a finished survey.",
    good: "up",
    stat: "Share",
    per: "per visitor-day",
    formula: { num: "Survey completions", den: "Visits", mult: "× 100" },
    caveat:
      "A visitor who came on several days counts each time, so the share reads lower than per person. Blank when the visits are.",
    tables: [T_VISITS, T_SUBS, T_PREPAID],
    query: SQL(METRICS),
    related: ["pts.completions", "pts.visits"],
  },
  "pts.paying": {
    label: "Paying customers",
    what: "People in each funnel whose payment took money and stands: the free survey's finishers who paid so far, and pay to start's buyers of the range.",
    good: "up",
    stat: "Count",
    per: "per person",
    formula: {
      num: "The funnel's finishers (pay to start: buyers) who paid more than €0 so far",
    },
    caveat: `${COHORT} A purchase refunded in full no longer counts; a 100% code's €0 purchase counts once something is paid after it. Test payments and the team's own are left out. ${PAID_VIEW}`,
    tables: MONEY_TABLES,
    query: SQL(METRICS),
    related: ["pts.cvr", "pts.cpp", "pts.ppc"],
  },
  "pts.cvr": {
    label: "Visit → paying customer",
    what: "The share of the funnel's visits that became a paying customer: it compares funnels fairly even though they ask for money at different points. One of the three core measures.",
    good: "up",
    stat: "Share",
    per: "per visitor-day",
    formula: { num: "Paying customers", den: "Visits", mult: "× 100" },
    caveat:
      "A visitor who came on several days counts each time, so the share reads lower than per person. Blank when the visits are.",
    tables: [T_VISITS, ...MONEY_TABLES],
    query: SQL(METRICS),
    related: ["pts.paying", "pts.visits", "pts.rpv"],
  },
  "pts.click-cvr": {
    label: "Ad click → paying customer",
    what: "The share of the funnel's ad clicks that became a paying customer who came through an ad.",
    good: "up",
    stat: "Share",
    per: "per click",
    formula: {
      num: "Paying customers whose survey or purchase came through a Google Ads click",
      den: "Ad clicks",
      mult: "× 100",
    },
    caveat:
      "The same in both traffic views: only the ad's own customers count. One came through an ad when their link carried Google's click id (gclid, gbraid or wbraid) or a Google cpc tag. The clicks are the Ad clicks row's; the query gives the customers (ad_paying_customers).",
    tables: [ADS_LANDING, ...MONEY_TABLES],
    query: SQL(METRICS),
    related: ["pts.clicks", "pts.paying"],
  },

  // ---- Money
  "pts.revenue": {
    label: "Revenue",
    what: "Everything each funnel's customers paid: the free survey's finishers so far, and pay to start's buyers of the range with what they bought on the report after.",
    good: "up",
    stat: "Sum",
    per: "per euro",
    formula: {
      num: "Real payments of the funnel's finishers (pay to start: buyers) so far, upgrades included",
    },
    caveat: `${COHORT} Refunded payments, test payments and €0 unlocks are left out. ${PAID_VIEW}`,
    tables: MONEY_TABLES,
    query: SQL(METRICS),
    related: ["pts.rpv", "pts.roas", "pts.rpf"],
  },
  "pts.rpv": {
    label: "Revenue per visit",
    what: "What each visit to the funnel's pages earned: conversion and price in one figure, the fairest way to compare funnels. One of the three core measures.",
    good: "up",
    stat: "Average",
    per: "per visitor-day",
    formula: { num: "Revenue", den: "Visits" },
    caveat: "Written with three decimals, as the figures are small. Blank when the visits are.",
    tables: [T_VISITS, ...MONEY_TABLES],
    query: SQL(METRICS),
    related: ["pts.revenue", "pts.visits", "pts.cvr"],
  },
  "pts.rpf": {
    label: "Revenue per survey completion",
    what: "What each finished survey earned. Pay to start counts only the money of buyers who have finished: a buyer yet to take the survey adds nothing yet.",
    good: "up",
    stat: "Average",
    per: "per finished survey",
    formula: {
      num: "Revenue of those who finished the survey (finishers_revenue)",
      den: "Survey completions",
    },
    caveat: "Compare it with Cost per survey completion. Blank with no finished survey.",
    tables: MONEY_TABLES,
    query: SQL(METRICS),
    related: ["pts.cpf", "pts.ppf", "pts.completions"],
  },
  "pts.cpp": {
    label: "Cost per paying customer",
    what: "What one paying customer cost in Google Ads spend on the funnel's pages.",
    good: "down",
    stat: "Average",
    per: "per paying customer",
    formula: { num: "Ad spend", den: "Paying customers" },
    caveat:
      "Every paying customer counts, not only those who came from an ad. Blank with no paying customer, or when Google Ads can't be read. The spend is the Ad spend row's; the query gives the customers.",
    tables: [ADS_LANDING, ...MONEY_TABLES],
    query: SQL(METRICS),
    related: ["pts.spend", "pts.paying", "pts.roas"],
  },
  "pts.cpf": {
    label: "Cost per survey completion",
    what: "What one finished survey cost in Google Ads spend on the funnel's pages.",
    good: "down",
    stat: "Average",
    per: "per finished survey",
    formula: { num: "Ad spend", den: "Survey completions" },
    caveat:
      "Every finished survey counts, not only those from an ad. The spend is the Ad spend row's; the query gives the completions.",
    tables: [ADS_LANDING, T_SUBS, T_PREPAID],
    query: SQL(METRICS),
    related: ["pts.rpf", "pts.spend", "pts.completions"],
  },
  "pts.roas": {
    label: "ROAS",
    what: "Return on ad spend: the funnel's revenue for each euro of Google Ads spend on its pages. From 1× the ads pay for themselves. One of the three core measures.",
    good: "up",
    stat: "Ratio",
    per: "per euro of ad spend",
    formula: { num: "Revenue", den: "Ad spend" },
    caveat:
      "All of the funnel's revenue counts, also from people who never clicked an ad, so it reads high for the ads alone; with Paid traffic only, only the ad customers' revenue. Blank when the spend is €0 or can't be read. The spend is the Ad spend row's; the query gives the revenue.",
    tables: [ADS_LANDING, ...MONEY_TABLES],
    query: SQL(METRICS),
    related: ["pts.net", "pts.revenue", "pts.spend"],
  },
  "pts.net": {
    label: "Return on ad spend (€)",
    what: "The funnel's revenue less its Google Ads spend: above €0, the ads paid for themselves.",
    good: "up",
    stat: "Difference",
    per: "per euro",
    formula: { num: "Revenue − ad spend" },
    caveat:
      "Before card fees and running costs: the profit rows take those off too. Blank when the spend is €0 or can't be read.",
    tables: [ADS_LANDING, ...MONEY_TABLES],
    query: SQL(METRICS),
    related: ["pts.roas", "pts.ppc"],
  },
  "pts.ppc": {
    label: "Profit per paying customer",
    what: "What each paying customer left after card fees, the reports' running cost and the ads (the contribution), as the Traffic page works it out.",
    good: "up",
    stat: "Average",
    per: "per paying customer",
    formula: {
      num: "Revenue − card fees (2.9% + €0.25 a payment) − €0.05 per finished survey − ad spend",
      den: "Paying customers",
    },
    caveat:
      "The Traffic page's starting assumptions. A payment is the purchase and each later buy, each with its own €0.25 (payments). Blank with no paying customer, or when the spend can't be read.",
    tables: [ADS_LANDING, ...MONEY_TABLES],
    query: SQL(METRICS),
    related: ["pts.ppf", "pts.paying", "pts.net"],
  },
  "pts.ppf": {
    label: "Profit per survey completion",
    what: "What each finished survey left after card fees, the reports' running cost and the ads. Pay to start counts only the money and payments of buyers who have finished.",
    good: "up",
    stat: "Average",
    per: "per finished survey",
    formula: {
      num: "Finishers' revenue − their card fees − €0.05 per finished survey − ad spend",
      den: "Survey completions",
    },
    caveat:
      "As Revenue per survey completion, a buyer yet to take the survey adds nothing yet, so it stays below it; the whole ad spend counts, as in Cost per survey completion (finishers_revenue, finishers_payments).",
    tables: [ADS_LANDING, ...MONEY_TABLES],
    query: SQL(METRICS),
    related: ["pts.ppc", "pts.rpf", "pts.cpf"],
  },

  // ---- The step cards (Visits, Survey finished, Total revenue and Revenue per visitor use
  // the table's cards above)
  "pts.step-started": {
    label: "Survey started",
    what: "Survey runs begun from the free survey's landing pages that answered at least the first question.",
    stat: "Count",
    per: "per survey run",
    formula: { num: "Survey starts in the range, less those of people who paid to start first" },
    caveat:
      "As the Survey page counts starts: the team's runs and our probes are left out. A buyer's finished survey is pay to start's, so its start comes off here; an unfinished one can't be tied to its purchase and stays. While the report's €1.99 page runs, it takes its daily share. Pay to start's own cards have no such step: its buyers start after paying (Landing's Started survey counts them). Market: ≈52.7% of visits, Riddle's median view → start of personality quizzes.",
    tables: [
      {
        source: "production",
        table: "survey_behavior_event",
        columns: "session_id, created_at, answered, direction, client_ip",
        filters: "Period (the run's first moment, Berlin day)",
      },
      {
        source: "production",
        table: "survey_partial_save",
        columns: "session_id, started_at, current_index, utm_tracker, client_ip",
        filters: "Period (started_at)",
      },
      T_SUBS,
      T_PREPAID,
    ],
    query: SQL(STARTED),
    related: ["pts.visits", "pts.completions"],
  },
  "pts.step-opened": {
    label: "Report opened",
    what: "Finishers whose report was opened.",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Finishers whose report has a reading session" },
    caveat:
      "Pay after the report also counts a report the paywall, a checkout or a payment shows was open where no session was recorded (before 18 Sep 2026 only with cookie consent). Pay to start counts its buyers' reports with a session. On the €1.99 page's funnel, the €1.99 page itself is no reading session.",
    tables: [T_SESSIONS, T_QUOTES, T_SUBS, T_PREPAID],
    query: SQL(STEPS),
    related: ["pts.completions", "pts.step-checkout"],
  },
  "pts.step-checkout": {
    label: "Checkout started",
    what: "Pay after the report: finishers who opened a checkout. Pay to start: the checkouts opened on the page.",
    stat: "Count",
    per: "per finished survey (pay to start: per checkout)",
    formula: {
      num: "Finishers with a checkout started (pay to start: the page's checkouts opened or paid in the range)",
    },
    caveat:
      "Pay to start counts every checkout, paid or not; one reopened later keeps its first day, so one paid in the range counts too. The team's own and our probes are left out.",
    tables: [T_QUOTES, T_SUBS, T_PREPAID],
    query: SQL(STEPS),
    related: ["pts.step-paid", "pts.step-opened"],
  },
  "pts.step-paid": {
    label: "Paid",
    what: "Pay after the report: finishers who paid. Pay to start: purchases on the page paid in the range and kept. The €1.99 page's funnel: its finishers who paid the €1.99.",
    stat: "Count",
    per: "per person (pay to start: per purchase)",
    formula: {
      num: "Finishers who paid more than €0 (pay to start: purchases above €0, not refunded)",
    },
    caveat:
      "Pay to start's step counts the purchase itself; Paying customers also counts a 100% code's buyer who paid for something later. Market: 51% of checkouts and 1.4% of visits, Littledata's medians of 433 Shopify stores, 20 Jul – 17 Oct 2026.",
    tables: [T_PAYMENTS, REPORTS, T_SUBS, T_PREPAID],
    query: SQL(STEPS),
    related: ["pts.paying", "pts.step-checkout"],
  },
  "pts.step-gate": {
    label: "Saw the €1.99 page",
    what: "Finishers of the €1.99-after-the-survey funnel who saw the report's €1.99 page.",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Finishers in the €1.99 page's cohort whose view of the page was recorded" },
    caveat:
      "Only while the report's €1.99 page is switched on: its cohort is stamped when the survey is submitted. Blank while it is off. The line under it: who pressed “Not ready to unlock yet” (stored since 27 Oct 2026; Pressed Unlock's card has the query). From 28 Oct 2026 that opens the page's exit page, where readers can still unlock, so it no longer means they left.",
    tables: [
      { ...REPORTS, columns: "survey_submission_id, initial_gate_cohort_at, initial_gate_seen_at" },
      T_SUBS,
    ],
    query: SQL(GATE_SEEN),
    related: ["pts.step-pressed", "pts.step-full", "pts.completions"],
  },
  "pts.step-pressed": {
    label: "Pressed Unlock",
    what: "Finishers of the €1.99-after-the-survey funnel who pressed “Unlock now” on the report's €1.99 page: on its card, on the bar along the bottom, or (from 28 Oct 2026) on its exit page.",
    good: "up",
    stat: "Count",
    per: "per person",
    formula: {
      num: "Finishers in the €1.99 page's cohort with an Unlock press recorded (initial_gate_cta_click)",
    },
    caveat:
      "The page's own events, so a press with the browser's storage refused can be missing. A reader who pressed more than one button counts once here and on each line under it. Blank while the page is off.",
    tables: [
      T_GATE_EVENTS,
      { ...REPORTS, columns: "survey_submission_id, initial_gate_cohort_at" },
      T_SUBS,
    ],
    query: SQL(GATE_PRESSED),
    related: ["pts.step-gate", "pts.step-paid"],
  },
  "pts.step-full": {
    label: "Bought the full report",
    what: "Buyers who went on to buy the full report: after €1.99 on the pay-to-start page, or after the report's €1.99 page.",
    good: "up",
    stat: "Count",
    per: "per person",
    formula: { num: "Of the funnel's buyers, those who bought a full report later" },
    caveat: "The full report: the Full, Full All or Core plan. Refunded buys are left out.",
    tables: [T_PAYMENTS, REPORTS, T_PREPAID],
    query: SQL(STEPS),
    related: ["pts.revenue", "pts.step-paid"],
  },

  // ---- Week by week
  "pts.weeks": {
    label: "Week by week",
    what: "Each funnel week by week, one line per funnel: cost per paying customer, visit → paying customer or ROAS.",
    stat: "Per week",
    per: "per week (Monday to Sunday; the range's first and last week only its own days)",
    formula: { num: "The week's figure, worked out as the table works it out, over that week" },
    caveat:
      "Ads and organic. Each customer in the week they came in: the week their free survey was finished, or the week they paid to start, so a funnel that is paid later is not undercounted. A week with no figure breaks the line. The spend is the Ad spend row's, by week; the query gives the visits, customers and revenue.",
    tables: [T_VISITS, ADS_LANDING, ...MONEY_TABLES],
    query: SQL(WEEKS),
    related: ["pts.cpp", "pts.cvr", "pts.roas"],
  },
};
