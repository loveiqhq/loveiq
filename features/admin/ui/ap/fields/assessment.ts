/**
 * The Assessment A dashboard's fields (features/admin/ui/ap/ApDashboard.tsx, builder
 * features/admin/server/ap/assessment.ts). Every query was run read-only for 21 Sep – 20 Oct 2026
 * and gives the page's own figure for "Last 30 days" (no other filter): see the design-sync
 * checks. `:from` and `:to` are the range's first and last Berlin day.
 */
import {
  AI_HOST,
  EMAIL_HOST,
  inHogql,
  OWN_HOST,
  SEARCH_HOST,
  SOCIAL_HOST,
} from "@features/admin/server/ap/referrers";

import type { FieldDef, FieldRegistry, FieldTable } from "./types";

// ---------------------------------------------------------------------------------------------
// The queries' shared parts.

/** Our own probes and site checks tag their links with these; they are never counted. */
const PROBES = `'prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify'`;

/** A report visit by a bot or a script, by its browser's name. */
const BOTS = String.raw`'(adsbot|headless|bot[/;) ]|crawler|spider|^curl/|^wget/|python-requests|go-http-client|okhttp|node-fetch|axios/)'`;

const FINISHERS = String.raw`finishers as (
  -- Surveys finished in the period (Berlin days); the team's own and our probes left out.
  select s.id, s.user_id, s.created_date_time as finished_at, s.duration_ms,
         s.utm_tracker::jsonb as t
    from survey_submission s
   where s.status = 'completed'
     and (s.created_date_time at time zone 'Europe/Berlin')::date between :from and :to
     and not exists (select 1 from ap_team_user t where t.id = s.user_id)
     and coalesce(lower(trim(s.utm_tracker::jsonb->>'utm_source')), '') not in (${PROBES})
     and coalesce(lower(trim(s.utm_tracker::jsonb->>'utm_medium')), '') <> 'probe'
)`;

const VISITORS = String.raw`visitors as (
  -- The visit log: one row per browser per day; our probes left out.
  select count(*) as n
    from funnel_event
   where event_type = 'unique_visitor' and coalesce(landing_variant, '') <> 'pay_to_start' and day between :from and :to
     and coalesce(lower(trim(utm_source)), '') not in (${PROBES})
)`;

const SALES = String.raw`sales as (
  -- Payments made in the period (Berlin days): paid, over €0, not a test payment; the team's
  -- own surveys and our probes left out.
  select p.amount, s.id as survey_id, s.created_date_time as finished_at,
         s.posthog_session_id as visit, s.utm_tracker::jsonb as t
    from payment p
    join personal_report pr on pr.id = p.personal_report_id
    join survey_submission s on s.id = pr.survey_submission_id
   where p.status = 'succeeded' and not coalesce(p.is_test, false) and p.amount > 0
     and (coalesce(p.payment_date_time, p.created_date_time) at time zone 'Europe/Berlin')::date between :from and :to
     and not exists (select 1 from ap_team_user t where t.id = s.user_id)
     and coalesce(lower(trim(s.utm_tracker::jsonb->>'utm_source')), '') not in (${PROBES})
     and coalesce(lower(trim(s.utm_tracker::jsonb->>'utm_medium')), '') <> 'probe'
)`;

const SPEND = String.raw`spend as (
  -- Google Ads' cost per day as Google Analytics imports it (the company brain's daily copy).
  select sum((meta->>'ad_cost')::numeric) as eur
    from brain_chunk
   where source = 'ga4' and meta->>'grain' = 'day'
     and (meta->>'day')::date between :from and :to
)`;

/** What each finisher did next, up to today. */
const FOLLOWED = String.raw`followed as (
  -- What each finisher did next, up to today.
  select f.id,
         -- a visit to their report (bots and the team left out)
         exists (select 1 from personal_report pr
                   join report_session rs on rs.personal_report_id = pr.id
                  where pr.survey_submission_id = f.id
                    and not exists (select 1 from ap_team_user t
                                     where t.id = rs.user_id)
                    and coalesce(rs.user_agent, '') !~* ${BOTS}) as visited,
         -- the paywall seen or clicked, or a checkout opened
         exists (select 1 from report_price_quote q
                  where q.survey_submission_id = f.id
                    and (q.paywall_reached_at is not null or q.checkout_started_at is not null))
           or exists (select 1 from analytics_event a
                       where a.survey_submission_id = f.id and a.event_type = 'paywall_initiated'
                         and coalesce(a.metadata->>'source', '') <> 'offer_link') as at_paywall,
         -- a payment for their report: paid, over €0, not a test payment
         exists (select 1 from personal_report pr
                   join payment p on p.personal_report_id = pr.id
                  where pr.survey_submission_id = f.id and p.status = 'succeeded'
                    and not coalesce(p.is_test, false) and p.amount > 0) as paid
    from finishers f
)`;

/** Survey starts: the runs of the survey begun in the period that answered a question. */
const STARTS = String.raw`staff as (select id from ap_team_user),
staff_ips as (
  -- The networks the team's own finished surveys came from: an unfinished run from one is the
  -- team testing.
  select e.client_ip from survey_behavior_event e join survey_submission s using (session_id)
   where s.user_id in (select id from staff) and e.client_ip is not null
  union
  select d.client_ip from survey_partial_save d join survey_submission s using (session_id)
   where s.user_id in (select id from staff) and d.client_ip is not null
),
steps as (
  -- The survey's own steps, per run (one browser session of the survey)
  select session_id, min(created_at) as began,
         bool_or(answered is true or direction = 'complete') as answered,
         bool_or(client_ip in (select client_ip from staff_ips)) as staff_ip
    from survey_behavior_event where session_id is not null group by 1
),
drafts as (
  -- The run's draft (deleted 30 days after it was last saved)
  select session_id, min(started_at) as began, max(current_index) >= 1 as answered,
         (array_agg(utm_tracker order by saved_at desc nulls last)
            filter (where utm_tracker is not null))[1] as tracker,
         bool_or(client_ip in (select client_ip from staff_ips)) as staff_ip
    from survey_partial_save where session_id is not null group by 1
),
submitted as (
  -- The run's submission, the finished one if there are several
  select distinct on (session_id) session_id, start_date_time as began,
         status = 'completed' as finished, user_id, utm_tracker as tracker
    from survey_submission where session_id is not null
   order by session_id, (status = 'completed') desc, id
),
runs as (
  select session_id,
         least(st.began, d.began, s.began) as began,
         coalesce(st.answered, false) or coalesce(d.answered, false)
           or coalesce(s.finished, false) as answered,
         coalesce(s.finished, false) as finished,
         coalesce(st.staff_ip, false) or coalesce(d.staff_ip, false) as staff_ip,
         s.user_id,
         coalesce(s.tracker, d.tracker)::jsonb as t
    from steps st full join drafts d using (session_id) full join submitted s using (session_id)
),
starts as (
  -- Begun in the period and answered at least the first question; the team's runs and our
  -- probes left out.
  select * from runs
   where (began at time zone 'Europe/Berlin')::date between :from and :to
     and answered
     and not exists (select 1 from staff where staff.id = runs.user_id)
     and (finished or not staff_ip)
     and coalesce(lower(trim(t->>'utm_source')), '') not in (${PROBES})
     and coalesce(lower(trim(t->>'utm_medium')), '') <> 'probe'
)`;

const AI = `'chatgpt.com', 'chatgpt', 'chat.openai.com', 'openai', 'perplexity', 'perplexity.ai',
                     'gemini', 'gemini.google.com', 'copilot', 'copilot.com', 'copilot.microsoft.com', 'claude.ai'`;
const SOCIAL = `'ig', 'instagram', 'facebook', 'fb', 'meta', 'tiktok', 'linkedin', 'x', 'twitter',
                     't.co', 'pinterest', 'reddit', 'youtube', 'threads'`;

/** Visitors, finished surveys and revenue per source: production's part, then PostHog's split. */
const SOURCES = String.raw`-- Part 1, production (SQL): each source's tagged visits, finished surveys and revenue.
with ${FINISHERS},
${SALES},
tagged as (
  -- The visit log keeps only the link's tag (Google Ads tags every click); the untagged visits
  -- are split by part 2.
  select case when coalesce(trim(utm_source), '') = '' then 'untagged'
              when lower(trim(utm_source)) = 'google' then 'Google Ads'
              when lower(trim(utm_source)) in (${AI}) then 'AI assistants'
              when lower(trim(utm_source)) in ('email', 'newsletter', 'nurture', 'resend') then 'Email'
              when lower(trim(utm_source)) in (${SOCIAL}) then 'Social'
              else 'Referral' end as source,
         count(*) as visits
    from funnel_event
   where event_type = 'unique_visitor' and coalesce(landing_variant, '') <> 'pay_to_start' and day between :from and :to
     and coalesce(lower(trim(utm_source)), '') not in (${PROBES})
   group by 1
),
people as (
  select 'survey' as kind, finished_at, t, 0 as amount from finishers
  union all
  select 'payment', finished_at, t, amount from sales
),
sorted as (
  -- Each finisher's source, from the tracker of their first page, in this order.
  select kind, amount,
         case when not known then 'Not recorded'
              when ad_click or (src = 'google' and med in ('cpc', 'ppc', 'paid', 'ads')) then 'Google Ads'
              when src in ('facebook', 'instagram', 'meta', 'fb', 'ig', 'messenger', 'msg', 'an',
                           'audience_network', 'audiencenetwork', 'audience-network')
                   and med in ('cpc', 'ppc', 'paid', 'ads', 'paid_social', 'paidsocial', 'cpm') then 'Meta Ads'
              when not meta_click
                   and case when med = 'organic'
                            then src in ('google', 'bing', 'duckduckgo', 'yahoo', 'ecosia', 'yandex', 'brave')
                            else ref ~ '${SEARCH_HOST}' end then 'Organic search'
              when src in (${AI}) or ref ~ '${AI_HOST}' then 'AI assistants'
              when src in ('email', 'newsletter', 'nurture', 'resend')
                   or med in ('email', 'nurture', 'newsletter') or ref ~ '${EMAIL_HOST}' then 'Email'
              when src in (${SOCIAL})
                   or med in ('social', 'paid_social') or meta_click or ref ~ '${SOCIAL_HOST}' then 'Social'
              when src = '' and med = '' and ref = '' then 'Direct / untagged'
              else 'Referral' end as source
    from people,
         lateral (select lower(trim(coalesce(t->>'utm_source', ''))) as src,
                         lower(trim(coalesce(t->>'utm_medium', ''))) as med,
                         -- the referring site counts only on a visit with no tags and no Meta click
                         case when concat(t->>'utm_source', t->>'utm_medium', t->>'fbclid') = ''
                              then lower(trim(coalesce(t->>'referrer_host', ''))) else '' end as ref,
                         concat(t->>'gclid', t->>'gbraid', t->>'wbraid') <> '' as ad_click,
                         coalesce(t->>'fbclid', '') <> '' as meta_click,
                         -- before 19 Jul 2026 an untagged finisher's source wasn't recorded
                         finished_at >= timestamptz '2026-07-19 00:00 Europe/Berlin'
                           or concat(t->>'utm_source', t->>'utm_medium', t->>'gclid', t->>'gbraid',
                                     t->>'wbraid', t->>'fbclid', t->>'referrer_host') <> '' as known) tag
)
select source, v.visits as tagged_visits, x.submissions, x.revenue
  from tagged v
  full join (select source, count(*) filter (where kind = 'survey') as submissions,
                    coalesce(sum(amount) filter (where kind = 'payment'), 0) as revenue
               from sorted group by 1) x using (source)
 order by 1;

-- Part 2, PostHog (HogQL): how PostHog's untagged visits split by source, by the same rules.
-- A source's visitors = its tagged visits + the untagged visits × its share of these rows
-- (Google Ads' own and our probes left out). The team's own people are left out by the PostHog
-- visits of their finished surveys (survey_submission.posthog_session_id of a team account).
SELECT multiIf(med = 'probe', 'Our probes (left out)',
               ads = 1, 'Google Ads (left out)',
               match(ref, '${inHogql(SEARCH_HOST)}'), 'Organic search',
               match(ref, '${inHogql(AI_HOST)}'), 'AI assistants',
               med IN ('email', 'nurture', 'newsletter') OR match(ref, '${inHogql(EMAIL_HOST)}'), 'Email',
               fb = 1 OR med IN ('social', 'paid_social') OR match(ref, '${inHogql(SOCIAL_HOST)}'), 'Social',
               med = '' AND ref = '', 'Direct / untagged',
               'Referral') AS source,
       count() AS visits
FROM (
  SELECT lower(extract(url, '[?&]utm_source=([^&#]*)')) AS src,
         lower(extract(url, '[?&]utm_medium=([^&#]*)')) AS med,
         if(url LIKE '%gclid=%' OR url LIKE '%gbraid=%' OR url LIKE '%wbraid=%', 1, 0) AS ads,
         if(url LIKE '%fbclid=%', 1, 0) AS fb,
         -- The referring site counts only on a visit with no tags and no Meta click id; our own
         -- sites and PostHog's "$direct" are no referrer.
         if(src = '' AND med = '' AND fb = 0 AND first_ref != '$direct'
              AND NOT match(first_ref, '${inHogql(OWN_HOST)}'), first_ref, '') AS ref
  FROM (
    SELECT $session_id AS sid,
           argMin(properties.$current_url, timestamp) AS url,
           lower(coalesce(argMin(properties.$referring_domain, timestamp), '')) AS first_ref
    FROM events
    WHERE event = '$pageview' AND properties.$host = 'www.loveiq.org' AND $session_id != ''
      AND properties.$pathname NOT LIKE '/admin%' AND properties.$pathname NOT LIKE '/jarvis%'
      AND properties.$pathname != '/login'
      AND timestamp >= toDateTime(:from, 'Europe/Berlin')
      AND timestamp < toDateTime(:to, 'Europe/Berlin') + INTERVAL 1 DAY
      AND person_id NOT IN (SELECT person_id FROM events
                             WHERE $session_id IN :team_visits
                               AND timestamp >= toDateTime('2026-08-23', 'UTC'))
    GROUP BY sid
    -- A visit that landed on a pay-to-start page is that funnel's (its own page counts it).
    HAVING argMin(properties.$pathname, timestamp) NOT LIKE '/sexual-archetype%'
  )
)
WHERE src = ''
GROUP BY source
ORDER BY visits DESC`;

/** PostHog's people of the period, new or returning. */
const NEW_RETURNING = String.raw`-- The people PostHog saw on the live site in the period: "new" when it first saw them in it.
-- The team's own people are left out by the PostHog visits of their finished surveys
-- (survey_submission.posthog_session_id of a team account).
SELECT grp, count() AS visitors, sum(finished) AS finished_survey,
       round(100 * sum(finished) / count(), 1) AS survey_cvr_pct
FROM (
  SELECT person_id,
         if(min(timestamp) >= toDateTime(:from, 'Europe/Berlin'), 'new', 'returning') AS grp,
         max(if(event = 'survey_completed'
                AND timestamp >= toDateTime(:from, 'Europe/Berlin'), 1, 0)) AS finished,
         max(if(event = '$pageview'
                AND timestamp >= toDateTime(:from, 'Europe/Berlin'), 1, 0)) AS active
  FROM events
  WHERE properties.$host = 'www.loveiq.org'
    AND event IN ('$pageview', 'survey_started', 'survey_completed')
    AND timestamp < toDateTime(:to, 'Europe/Berlin') + INTERVAL 1 DAY
    AND person_id NOT IN (SELECT person_id FROM events
                           WHERE $session_id IN :team_visits
                             AND timestamp >= toDateTime('2026-08-23', 'UTC'))
  GROUP BY person_id
)
WHERE active = 1
GROUP BY grp`;

/** Revenue per new or returning visitor: production's payments, then PostHog's groups. */
const NEW_RETURNING_MONEY = String.raw`-- Part 1, production (SQL): the period's payments, with the PostHog visit their survey was
-- finished in (none: in neither group).
with ${SALES}
select visit, sum(amount) as revenue from sales group by 1;

-- Part 2, PostHog (HogQL): each of those visits' person, "new" when PostHog first saw them in
-- the period, as the visitors are counted. Write part 1's visits in for :visits; the team's own
-- people are left out as there.
SELECT v.sid, if(f.first_seen >= toDateTime(:from, 'Europe/Berlin'), 'new', 'returning') AS grp
FROM (SELECT properties.$session_id AS sid, argMin(person_id, timestamp) AS pid
        FROM events
       WHERE timestamp >= toDateTime('2026-08-23', 'UTC') AND properties.$session_id IN :visits
       GROUP BY sid) v
JOIN (SELECT person_id, min(timestamp) AS first_seen
        FROM events
       WHERE properties.$host = 'www.loveiq.org'
         AND event IN ('$pageview', 'survey_started', 'survey_completed')
         AND timestamp >= toDateTime('2026-08-23', 'UTC')
         AND timestamp < toDateTime(:to, 'Europe/Berlin') + INTERVAL 1 DAY
         AND person_id NOT IN (SELECT person_id FROM events
                                WHERE $session_id IN :team_visits
                                  AND timestamp >= toDateTime('2026-08-23', 'UTC'))
       GROUP BY person_id) f ON f.person_id = v.pid`;

/** The prices quoted in the period, per plan, price and arm, and what came of them. */
const PRICES = String.raw`with quotes as (
  -- The price quotes made in the period; the team's own and our probes left out, and the plans
  -- no longer on sale (Essentials from Pricing 2.0, Core from Pricing 3.0).
  select q.id, q.survey_submission_id as reader, q.plan, q.checkout_started_at,
         q.created_date_time, q.initial_price, q.current_price,
         -- the price arm the quote was dealt, before any re-sync moved it
         coalesce((select h.old_experiment_group from report_price_quote_arm_history h
                    where h.quote_id = q.id order by h.changed_at, h.id limit 1),
                  q.experiment_group) as arm
    from report_price_quote q
    join survey_submission s on s.id = q.survey_submission_id
   where (q.created_date_time at time zone 'Europe/Berlin')::date between :from and :to
     and not exists (select 1 from ap_team_user t where t.id = s.user_id)
     and coalesce(lower(trim(s.utm_tracker::jsonb->>'utm_source')), '') not in (${PROBES})
     and coalesce(lower(trim(s.utm_tracker::jsonb->>'utm_medium')), '') <> 'probe'
     and not (q.plan = 'essentials' and q.created_date_time >= timestamptz '2026-08-03 20:09:45+00')
     and not (q.plan = 'core' and q.created_date_time >= timestamptz '2026-10-06 18:18:28.684862+00')
),
priced as (
  select q.*,
         case when q.created_date_time < timestamptz '2026-08-03 20:09:45+00'
              -- before Pricing 2.0 a price was personal, kept only where it was paid
              then case when exists (select 1 from payment p
                                      where p.pricing_quote_id = q.id and p.status = 'succeeded'
                                        and not coalesce(p.is_test, false) and p.amount > 0)
                        then coalesce(q.initial_price, q.current_price) end
              -- since, the price list of the quote's arm on the day it was made
              else (select l.starting_price from get_price_list_changes() l
                     where l.arm = q.arm and l.plan = q.plan and l.changed_at <= q.created_date_time
                     order by l.changed_at desc limit 1) end as price,
         paid.n as payments, paid.revenue
    from quotes q,
         lateral (select count(*) as n, coalesce(sum(p.amount), 0) as revenue
                    from payment p
                   where p.pricing_quote_id = q.id and p.status = 'succeeded'
                     and not coalesce(p.is_test, false) and p.amount > 0) paid
)
-- Readers, not quotes: a reader is quoted every plan on sale at once.
select plan, price, arm,
       count(distinct reader) as quoted,
       count(distinct reader) filter (where checkout_started_at is not null) as checkouts,
       count(distinct reader) filter (where payments > 0) as sales,
       round(100.0 * count(distinct reader) filter (where payments > 0)
                    / nullif(count(distinct reader), 0), 2) as payment_cvr_pct,
       sum(revenue) as revenue
  from priced
 group by plan, price, arm
 order by plan, price, arm;`;

const sql = (text: string): FieldDef["query"] => ({ lang: "SQL", text });

// ---------------------------------------------------------------------------------------------
// The tables the figures read, as the Data sources catalog names them.

const T_VISITS: FieldTable = {
  source: "production",
  table: "funnel_event",
  columns:
    "event_type ('unique_visitor'), day, utm_source, landing_variant (pay to start's pages are left out: its own page counts them)",
  filters:
    "Period: day. Source: Google Ads only, by utm_source 'google' (its links tag every click). Device, tier and new or returning can't apply: the figure is blank under them.",
  watch:
    "One row per browser per day, so a browser back on another day counts again. Every browser that loads a page is in it, also those that declined cookies, some bots and the team's own visits.",
};
const T_SUBS: FieldTable = {
  source: "production",
  table: "survey_submission",
  columns: "status ('completed'), created_date_time, user_id, utm_tracker, duration_ms",
  filters:
    "Period: created_date_time (the finish day). Source: utm_tracker (the person's first page). Device and tier: through their price quote (report_price_quote), else the survey's own steps. New or returning: posthog_session_id, through PostHog.",
  watch:
    "The team's own surveys (an @loveiq.org account, or one that used the team's test code) and our probes (tagged links) are left out.",
};
const T_PAYMENT: FieldTable = {
  source: "production",
  table: "payment",
  columns:
    "amount, status ('succeeded'), is_test, payment_date_time, created_date_time, personal_report_id",
  filters:
    "Period: the Berlin day it was paid (payment_date_time, else the row's created_date_time). Source, device, tier and new or returning: through the finished survey whose report it paid for.",
  watch:
    "Only status 'succeeded', over €0, not is_test: free unlocks and test payments are not money. A payment refunded in full moves to 'refunded' and leaves; one refunded in part still counts in full.",
};
const T_REPORT: FieldTable = {
  source: "production",
  table: "personal_report",
  columns: "id, survey_submission_id",
  filters: "None of its own: it links a finished survey to its report.",
};
const T_STEPS: FieldTable = {
  source: "production",
  table: "survey_behavior_event",
  columns: "session_id, created_at, answered, direction, client_ip",
  filters:
    "Period: the run's first step. Device: from 13 Oct 2026. Source and tier: no (the steps carry neither).",
  watch:
    "Written for everyone from 18 Sep 2026; before, only for people who accepted cookies, so earlier starts read low.",
};
const T_DRAFTS: FieldTable = {
  source: "production",
  table: "survey_partial_save",
  columns: "session_id, started_at, current_index, utm_tracker, saved_at, client_ip",
  filters: "Period: started_at. Source: utm_tracker, while the draft is kept.",
  watch: "A draft is deleted 30 days after it was last saved, and its run's source with it.",
};
const T_STARTS_SUB: FieldTable = {
  source: "production",
  table: "survey_submission",
  columns: "session_id, start_date_time, status, user_id, utm_tracker",
  filters: "Period: start_date_time. Source: utm_tracker.",
  watch: "A finished run is a start even with no step or draft left.",
};
const T_SESSIONS: FieldTable = {
  source: "production",
  table: "report_session",
  columns: "personal_report_id, started_at, ended_at, user_id, user_agent",
  filters: "None of its own: the finisher's filters apply.",
  watch:
    "Written for every visit from 18 Sep 2026; before, only with cookie consent. Bots (by their browser's name) and the team's visits are left out.",
};
const T_QUOTE: FieldTable = {
  source: "production",
  table: "report_price_quote",
  columns: "survey_submission_id, paywall_reached_at, checkout_started_at",
  filters: "None of its own: the finisher's filters apply.",
  watch: "paywall_reached_at is recorded from 6 Sep 2026.",
};
const T_CLICKS: FieldTable = {
  source: "production",
  table: "analytics_event",
  columns: "event_type ('paywall_initiated'), survey_submission_id, metadata.source",
  filters: "None of its own: the finisher's filters apply.",
  watch: "A click from an email's offer link is not a click on the paywall.",
};
const T_SPEND: FieldTable = {
  source: "ads",
  table: "campaign_daily",
  columns: "date, cost_eur",
  filters:
    "Period: date. Source: Google Ads' spend; none for the other sources (Meta's isn't read). Device, tier and new or returning can't split it: the figure is blank under them.",
  watch:
    "The page takes Google Ads' cost as Google Analytics imports it, per whole day (the same daily copy as this table, its day total); summed per campaign it can differ by a cent of rounding. Days not read yet make the period partial: it is flagged and not compared.",
};
const T_PH_EVENTS: FieldTable = {
  source: "posthog",
  table: "events",
  columns: "person_id, event ($pageview, survey_completed), timestamp, $host",
  filters:
    "Period: timestamp. Source, device, tier and new or returning don't apply: it is all traffic.",
  watch:
    "PostHog sees about a quarter of our visits (blockers, declined cookies) and starts on 23 Aug 2026. The team's people are left out by the visits of their own finished surveys.",
};
const T_PH_SESSIONS: FieldTable = {
  source: "posthog",
  table: "events",
  columns: "$session_id, $current_url (utm tags, click ids), $referring_domain, $pathname",
  filters:
    "Period: timestamp. Only the untagged visits are read, to split the visit log's untagged ones. Device, tier and new or returning blank the split.",
  watch:
    "PostHog records only part of the visits, so the split is a sample: the totals are the visit log's.",
};
const T_SHARES: FieldTable = {
  source: "production",
  table: "report_share",
  columns: "personal_report_id",
  filters: "None of its own: the reader's filters apply.",
};
const T_INVITES: FieldTable = {
  source: "production",
  table: "invite_event",
  columns: "referrer_email, created_at",
  filters: "None of its own: the reader's filters apply.",
  watch: "Matched to the reader by their account's address, from the moment they finished.",
};
const T_QUOTES: FieldTable = {
  source: "production",
  table: "report_price_quote",
  columns:
    "plan, experiment_group, created_date_time, checkout_started_at, initial_price, current_price, survey_submission_id",
  filters:
    "Period: created_date_time (the quote's day). Source: the finisher's utm_tracker. Device: device_type. Tier: country_tier. New or returning: can't split (the table is blank under it).",
  watch:
    "A reader is quoted every plan on sale at once. The arm is the one the quote was dealt (report_price_quote_arm_history): later re-syncs moved unpaid quotes to newer lists.",
};
const T_QUOTE_SALES: FieldTable = {
  source: "production",
  table: "payment",
  columns: "pricing_quote_id, amount, status ('succeeded'), is_test",
  filters: "None of its own: a sale counts with the quote it was paid on.",
  watch: "Counted whenever it was paid, also after the period.",
};

// ---------------------------------------------------------------------------------------------
// The definitions.

const PEOPLE_LEFT_OUT =
  "The team's own surveys (an @loveiq.org account, or one that used the team's test code) and our probes (tagged links) are left out.";

const startCvr: FieldDef = {
  label: "Survey start CVR",
  what: "The share of visitors who started the survey, that is answered at least its first question. It shows how well the landing page gets people into the assessment.",
  good: "up",
  stat: "Share",
  per: "per visit: survey runs started over daily visitors",
  formula: {
    num: "Survey starts (runs that answered the first question)",
    den: "Visitors (each browser once per day)",
    mult: "× 100",
  },
  caveat:
    "A start is one run of the survey (one browser session), so a person who starts twice counts twice. Starts are complete from 18 Sep 2026, and before that only while their drafts are kept (30 days): an earlier range is blank, and against a period reaching back past that day the tile shows no change and says why. The team's runs (their accounts and the networks of their own surveys) and our probes are left out. Under a source filter, only starts up to 30 days old can be split.",
  tables: [T_STEPS, T_DRAFTS, T_STARTS_SUB, T_VISITS],
  query: sql(String.raw`with ${STARTS},
${VISITORS}
select (select count(*) from starts) as starts, (select n from visitors) as visitors,
       round(100.0 * (select count(*) from starts) / nullif((select n from visitors), 0), 2) as start_cvr_pct;`),
  related: ["assessment.step-start", "assessment.score-completion-cvr", "assessment.visits"],
};

const submissionCvr: FieldDef = {
  label: "Survey submission CVR",
  what: "The share of visitors who finished and submitted the survey. It shows how well the landing page and the survey together turn traffic into finished assessments.",
  good: "up",
  stat: "Share",
  per: "per visit: finished surveys over daily visitors",
  formula: {
    num: "Finished surveys",
    den: "Visitors (each browser once per day)",
    mult: "× 100",
  },
  caveat: `Visitors count each browser once per day and a person can finish more than one survey, so it is not a share of people. ${PEOPLE_LEFT_OUT} The visitors can't follow the device, tier or new-or-returning filters, so it is blank under them.`,
  tables: [T_SUBS, T_VISITS],
  query: sql(String.raw`with ${FINISHERS},
${VISITORS}
select (select count(*) from finishers) as submissions, (select n from visitors) as visitors,
       round(100.0 * (select count(*) from finishers) / nullif((select n from visitors), 0), 2) as cvr_pct;`),
  related: ["assessment.start-cvr", "assessment.step-submitted", "assessment.perf-cvr"],
};

const payCvr: FieldDef = {
  label: "Payment CVR",
  what: "Of the surveys finished in the period, the share whose report was paid for so far. It shows how well the free report sells the paid one.",
  good: "up",
  stat: "Share",
  per: "per finished survey",
  formula: {
    num: "Finished surveys of the period with a paid report (so far)",
    den: "Finished surveys of the period",
    mult: "× 100",
  },
  caveat:
    "It follows the period's finishers up to today, whenever they paid: a recent period has had less time to pay, so against the period before, that one is read as it stood at the same age. A payment in the period by someone who finished earlier is not in it (Revenue has it). Free unlocks (€0) and test payments are not payments.",
  tables: [T_SUBS, T_REPORT, T_PAYMENT],
  query: sql(String.raw`with ${FINISHERS},
${FOLLOWED}
select count(*) filter (where paid) as paid_so_far, count(*) as submissions,
       round(100.0 * count(*) filter (where paid) / nullif(count(*), 0), 2) as payment_cvr_pct
  from followed;`),
  related: ["assessment.step-paid", "assessment.price-cvr", "assessment.revenue"],
};

const revenue: FieldDef = {
  label: "Revenue",
  what: "All money taken in the period for reports. It is what the business actually received from this assessment.",
  good: "up",
  stat: "Sum",
  per: "per payment, by payment day",
  formula: { num: "Paid amounts over €0, made in the period" },
  caveat:
    "By payment day: a payment counts in the period it was made, whenever its survey was finished. Free unlocks (€0), test payments and the team's own are left out; a payment refunded in full is left out, one refunded in part still counts in full.",
  tables: [T_PAYMENT, T_REPORT, T_SUBS],
  query: sql(String.raw`with ${SALES}
select coalesce(sum(amount), 0) as revenue, count(*) as payments from sales;`),
  related: ["assessment.aov", "assessment.rev-visit", "assessment.rev-sub"],
};

const cac: FieldDef = {
  label: "CAC (paid)",
  what: "What one paying customer cost in Google Ads spend in the period. Below the average payment, the ads earn back what they cost.",
  good: "down",
  stat: "Ratio",
  per: "per paying finished survey (one with a payment in the period)",
  formula: {
    num: "Google Ads spend",
    den: "Paying customers (finished surveys with a payment in the period)",
  },
  caveat:
    "Every paying customer counts, not only those who came from an ad, so it reads lower than what an ad customer truly costs. A customer is a finished survey with a payment in the period: one person paying for two surveys counts twice. Its weekly line, on the tile and in the 12 weeks here, is ad spend per finished survey, not CAC: a sale is too rare to draw. A period missing some days' spend is flagged and not compared.",
  tables: [T_SPEND, T_PAYMENT],
  query: sql(String.raw`with ${SALES},
${SPEND}
select (select eur from spend) as google_ads_spend, count(distinct survey_id) as paying_customers,
       round((select eur from spend) / nullif(count(distinct survey_id), 0), 2) as cac
  from sales;`),
  related: ["assessment.score-roas", "assessment.aov", "assessment.revenue"],
};

const readers: FieldDef = {
  label: "Report open rate",
  what: "Of the surveys finished in the period, the share whose report was opened. Nearly everyone opens it, so it is a health check of the report link and page.",
  stat: "Share",
  per: "per finished survey",
  formula: {
    num: "Finished surveys whose report was opened",
    den: "Finished surveys of the period",
    mult: "× 100",
  },
  caveat:
    "Opened means a recorded visit to the report or, where none was recorded (before 18 Sep 2026 only with cookie consent), a later sign it was open: the paywall seen or clicked, a checkout or a payment. Visits by bots and by the team are left out. Its change is grey: up or down is neither good nor bad by itself.",
  tables: [T_SUBS, T_SESSIONS, T_QUOTE, T_CLICKS, T_PAYMENT],
  query: sql(String.raw`with ${FINISHERS},
${FOLLOWED}
select count(*) filter (where visited or at_paywall or paid) as opened, count(*) as submissions,
       round(100.0 * count(*) filter (where visited or at_paywall or paid) / nullif(count(*), 0), 1)
         as open_rate_pct
  from followed;`),
  related: ["assessment.step-opened", "assessment.score-read-time"],
};

const sources: FieldDef = {
  label: "Visitors",
  what: "Visitors per source. Visits whose link names its source are counted; the untagged rest is split by the sources of the untagged visits PostHog saw, so most rows are an estimate.",
  stat: "Count (partly estimated)",
  per: "per visitor per day",
  formula: {
    num: "The source's tagged visits + untagged visits × its share of PostHog's untagged visits",
  },
  caveat:
    "PostHog records only part of the visits, so the split is a sample: the totals are live, the split isn't. Google Ads' visits are counted, not split (its links tag every click). Blank under the device, tier and new-or-returning filters, and for a range starting before 23 Aug 2026 (PostHog's first day).",
  tables: [T_VISITS, T_PH_SESSIONS],
  query: sql(SOURCES),
  related: ["assessment.src-share", "assessment.src-cvr", "assessment.visits"],
};

const srcCvr: FieldDef = {
  label: "Survey CVR",
  what: "Finished surveys per visitor, for each source: which sources bring people who finish the assessment.",
  good: "up",
  stat: "Share",
  per: "per visit: the source's finished surveys over its daily visitors",
  formula: {
    num: "The source's finished surveys",
    den: "The source's visitors (partly estimated)",
    mult: "× 100",
  },
  caveat:
    "Its visitors are mostly an estimate (see Visitors). Every source but Google Ads and Meta Ads is blank for a range starting before 17 Oct 2026: until then the survey kept no referring site or Meta click id, so the finished surveys of untagged visitors from a search engine, an email, a social site, an AI assistant or another site are under Direct while PostHog's split tells them apart. A finisher's source is the one their first page carried.",
  tables: [T_SUBS, T_VISITS, T_PH_SESSIONS],
  query: sql(SOURCES),
  related: ["assessment.src-subs", "assessment.src-visitors", "assessment.perf-cvr"],
};

const srcPerVisit: FieldDef = {
  label: "€ / visit",
  what: "Money taken in the period per visitor, for each source: which sources bring paying readers.",
  good: "up",
  stat: "Ratio",
  per: "per visit: the source's revenue over its daily visitors",
  formula: {
    num: "The source's revenue (payments made in the period)",
    den: "The source's visitors (partly estimated)",
  },
  caveat:
    "A payment counts with the source its finisher came from, by payment day. A payment whose finisher's source wasn't recorded (untagged, before 19 Jul 2026) is in no row, so the rows can add up to less than Revenue. Blank where Survey CVR is, for the same reason.",
  tables: [T_PAYMENT, T_SUBS, T_VISITS, T_PH_SESSIONS],
  query: sql(SOURCES),
  related: ["assessment.src-cvr", "assessment.rev-visit", "assessment.perf-per-visit"],
};

const priceTable = (def: Omit<FieldDef, "tables" | "query">): FieldDef => ({
  ...def,
  tables: [T_QUOTES, T_QUOTE_SALES],
  query: sql(PRICES),
});

export const fields: FieldRegistry = {
  // The ten headline tiles.
  "assessment.visits": {
    label: "Visitors",
    what: "How many visitors came to the site in the period, each browser counted once a day. It is what every rate on this page is measured against.",
    good: "up",
    stat: "Count",
    per: "per visitor per day (a browser back on another day counts again)",
    formula: { num: "Browsers that loaded a page, each once a day" },
    caveat:
      "A visitor who comes back on three days counts three times, so it is daily visits rather than people. Complete from 15 Jun 2026 (from 23 May only visitors who accepted cookies). Only the Google Ads source filter can split it; the device, tier and new-or-returning filters leave it blank.",
    tables: [T_VISITS],
    query: sql(String.raw`with ${VISITORS}
select n as visitors from visitors;`),
    related: ["assessment.submission-cvr", "assessment.rev-visit", "assessment.src-visitors"],
  },
  "assessment.start-cvr": startCvr,
  "assessment.submission-cvr": submissionCvr,
  "assessment.pay-cvr": payCvr,
  "assessment.rev-visit": {
    label: "€ rev. per visit",
    what: "The money taken in the period for every visitor. It combines conversion and price in one number, so it compares fairly over time.",
    good: "up",
    stat: "Ratio",
    per: "per visit (daily visitors)",
    formula: {
      num: "Revenue (payments made in the period)",
      den: "Visitors (each browser once a day)",
    },
    caveat:
      "Revenue counts by payment day, so it holds payments by people who finished an earlier survey, and the visitors are daily visits, not people. Free unlocks and test payments are left out.",
    tables: [T_PAYMENT, T_VISITS],
    query: sql(String.raw`with ${SALES},
${VISITORS}
select (select coalesce(sum(amount), 0) from sales) as revenue, (select n from visitors) as visitors,
       round((select coalesce(sum(amount), 0) from sales) / nullif((select n from visitors), 0), 4) as eur_per_visit;`),
    related: ["assessment.revenue", "assessment.rev-sub", "assessment.src-per-visit"],
  },
  "assessment.rev-sub": {
    label: "€ rev. per survey submission",
    what: "The money taken in the period for every survey finished in it. It shows roughly what a finished assessment is worth today.",
    good: "up",
    stat: "Ratio",
    per: "per finished survey",
    formula: {
      num: "Revenue (payments made in the period)",
      den: "Finished surveys of the period",
    },
    caveat:
      "The two sides are different people: revenue is the payments made in the period, whoever made them (often people who finished earlier), while the finished surveys are the period's own. It is not what the period's finishers paid: Payment CVR follows them.",
    tables: [T_PAYMENT, T_SUBS],
    query: sql(String.raw`with ${SALES},
${FINISHERS}
select (select coalesce(sum(amount), 0) from sales) as revenue, (select count(*) from finishers) as submissions,
       round((select coalesce(sum(amount), 0) from sales) / nullif((select count(*) from finishers), 0), 4)
         as eur_per_submission;`),
    related: ["assessment.revenue", "assessment.rev-visit", "assessment.pay-cvr"],
  },
  "assessment.revenue": revenue,
  "assessment.aov": {
    label: "Avg. payment",
    what: "The average amount of one payment in the period. It shows which prices people actually pay.",
    good: "up",
    stat: "Average (mean)",
    per: "per payment",
    formula: { num: "Revenue (payments made in the period)", den: "Payments over €0" },
    caveat:
      "With few payments one sale moves it a lot, and its line has a point only in the weeks with a sale. An upgrade is a payment of its own, so upgrades pull it down. Its change is the plain difference in euros.",
    tables: [T_PAYMENT],
    query: sql(String.raw`with ${SALES}
select sum(amount) as revenue, count(*) as payments,
       round(sum(amount) / nullif(count(*), 0), 2) as avg_payment
  from sales;`),
    related: ["assessment.revenue", "assessment.price", "assessment.score-clv"],
  },
  "assessment.cac": cac,
  "assessment.open-rate": readers,

  // The journey, step by step (step 2 has no figure of its own).
  "assessment.step-landing": {
    label: "Landing page",
    what: "Visitors in the period: the journey's first step. The landing page is Assessment A's own page, so step 2 has no figure of its own.",
    stat: "Count",
    per: "per visitor per day",
    formula: { num: "Browsers that loaded a page, each once a day" },
    caveat:
      "Daily visits rather than people: a browser back on another day counts again. It is every visit to the site, not only to the landing page.",
    tables: [T_VISITS],
    query: sql(String.raw`with ${VISITORS}
select n as visitors from visitors;`),
    related: ["assessment.visits", "assessment.step-start"],
  },
  "assessment.step-start": {
    label: "Survey start",
    what: "Survey runs begun in the period that answered at least the first question. Its share is of step 1's visitors.",
    stat: "Count",
    per: "per survey run (a person who starts twice counts twice)",
    formula: { num: "Survey runs that answered the first question" },
    caveat:
      "Complete from 18 Sep 2026, and before that only while their drafts are kept (30 days): an earlier range is blank, and so are its shares. The team's runs and our probes are left out.",
    tables: [T_STEPS, T_DRAFTS, T_STARTS_SUB],
    query: sql(String.raw`with ${STARTS}
select count(*) as starts from starts;`),
    related: ["assessment.start-cvr", "assessment.step-submitted"],
  },
  "assessment.step-submitted": {
    label: "Submitted",
    what: "Surveys finished in the period. Its share is of the survey starts.",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Finished surveys of the period" },
    caveat: `A survey finished in the period but begun before it is here and not among the starts, so the share is close, not exact. ${PEOPLE_LEFT_OUT}`,
    tables: [T_SUBS],
    query: sql(String.raw`with ${FINISHERS}
select count(*) as submissions from finishers;`),
    related: ["assessment.submission-cvr", "assessment.step-opened"],
  },
  "assessment.step-opened": {
    label: "Report opened",
    what: "Of the surveys finished in the period, those whose report was opened, up to today. Its share is of the submissions.",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Finished surveys whose report was opened (so far)" },
    caveat: readers.caveat,
    tables: readers.tables,
    query: sql(String.raw`with ${FINISHERS},
${FOLLOWED}
select count(*) filter (where visited or at_paywall or paid) as opened from followed;`),
    related: ["assessment.open-rate", "assessment.step-paywall"],
  },
  "assessment.step-paywall": {
    label: "Paywall reached",
    what: "Of the surveys finished in the period, those whose reader got to the paywall, up to today. Its share is of the reports opened.",
    stat: "Count",
    per: "per finished survey",
    formula: {
      num: "Finished surveys whose paywall was seen or clicked, or that went on to a checkout or a payment",
    },
    caveat:
      "That the paywall was seen is recorded from 6 Sep 2026: for an earlier range the step is blank, as readers who only looked are missing (everyone who clicked or bought is in).",
    tables: [T_SUBS, T_QUOTE, T_CLICKS, T_PAYMENT],
    query: sql(String.raw`with ${FINISHERS},
${FOLLOWED}
select count(*) filter (where at_paywall or paid) as reached_paywall from followed;`),
    related: ["assessment.step-opened", "assessment.step-paid"],
  },
  "assessment.step-paid": {
    label: "Paid",
    what: "Of the surveys finished in the period, those whose report was paid for, up to today. Its share is of the paywall step.",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Finished surveys of the period with a paid report (so far)" },
    caveat: payCvr.caveat,
    tables: payCvr.tables,
    query: sql(String.raw`with ${FINISHERS},
${FOLLOWED}
select count(*) filter (where paid) as paid_so_far from followed;`),
    related: ["assessment.pay-cvr", "assessment.revenue"],
  },

  // The scorecard (the KPIs nothing measures yet have no figure, so no card).
  "assessment.score-start-cvr": {
    ...startCvr,
    label: "Start CVR",
    what: "Survey starts as a share of visitors, as the assessment scorecard (Product Vision & Playbook) asks for it: the same figure as the Survey start CVR tile.",
    related: ["assessment.start-cvr", "assessment.score-completion-cvr"],
  },
  "assessment.score-completion-cvr": {
    label: "Completion CVR",
    what: "Finished surveys for every survey start in the period, as the Survey and Landing pages read completion. It shows how many people the survey itself loses.",
    good: "up",
    stat: "Share",
    per: "per survey start",
    formula: { num: "Finished surveys", den: "Survey starts", mult: "× 100" },
    caveat:
      "Both counted by their own day in the period: a survey finished in the period may have begun before it. Starts are complete from 18 Sep 2026 (blank for an earlier range). A person who restarts the survey and finishes on the second run leaves an unfinished first one.",
    tables: [
      {
        ...T_SUBS,
        columns: `${T_SUBS.columns}, session_id, start_date_time`,
        filters: `Finished surveys by created_date_time (the finish day), starts by start_date_time. ${T_SUBS.filters.replace(/^Period: [^.]*\. /, "")}`,
        watch: `${T_SUBS.watch} ${T_STARTS_SUB.watch}`,
      },
      T_STEPS,
      T_DRAFTS,
    ],
    query: sql(String.raw`with ${STARTS},
${FINISHERS}
select (select count(*) from finishers) as finished, (select count(*) from starts) as starts,
       round(100.0 * (select count(*) from finishers) / nullif((select count(*) from starts), 0), 1) as completion_pct;`),
    related: ["assessment.score-start-cvr", "assessment.step-submitted"],
  },
  "assessment.score-cac": {
    ...cac,
    label: "CAC",
    what: "What one paying customer cost in Google Ads spend in the period: the same figure as the CAC (paid) tile.",
    related: ["assessment.cac", "assessment.score-roas"],
  },
  "assessment.score-roas": {
    label: "ROAS",
    what: "Revenue in the period for every euro of Google Ads spend. 1.0 means the purchases paid back the ads.",
    good: "up",
    stat: "Ratio",
    per: "per euro of Google Ads spend",
    formula: { num: "Revenue (payments made in the period)", den: "Google Ads spend" },
    caveat:
      "All revenue counts, not only that from ad visitors, so it reads higher than the ads' own return. It counts the period's payments only, so customers' later purchases would raise it. A period missing some days' spend is flagged.",
    tables: [T_PAYMENT, T_SPEND],
    query: sql(String.raw`with ${SALES},
${SPEND}
select (select coalesce(sum(amount), 0) from sales) as revenue, (select eur from spend) as google_ads_spend,
       round((select coalesce(sum(amount), 0) from sales) / nullif((select eur from spend), 0), 4) as roas;`),
    related: ["assessment.score-cac", "assessment.revenue"],
  },
  "assessment.score-clv": {
    label: "CLV",
    what: "Revenue per paying customer in the period. While nobody has bought twice it equals the average payment.",
    good: "up",
    stat: "Average (mean)",
    per: "per paying finished survey (one with a payment in the period)",
    formula: {
      num: "Revenue (payments made in the period)",
      den: "Paying customers (finished surveys with a payment in the period)",
    },
    caveat:
      "Only the period's own payments, so it is not yet a lifetime value. A customer is a finished survey: one person paying for two surveys counts twice.",
    tables: [T_PAYMENT],
    query: sql(String.raw`with ${SALES}
select sum(amount) as revenue, count(distinct survey_id) as paying_customers,
       round(sum(amount) / nullif(count(distinct survey_id), 0), 2) as clv
  from sales;`),
    related: ["assessment.aov", "assessment.score-cac"],
  },
  "assessment.score-survey-time": {
    label: "Assessment airtime",
    what: "How long people take to finish the survey, from its start to submitting it. Half take longer, half less.",
    stat: "Median",
    per: "per finished survey",
    formula: { num: "The middle of the finished surveys' times from start to submit" },
    caveat:
      "Clock time, breaks included: a survey left open overnight counts all of it, which is why it is the median, not the average. Surveys with no recorded time are left out.",
    tables: [T_SUBS],
    query: sql(String.raw`with ${FINISHERS}
select percentile_cont(0.5) within group (order by duration_ms) / 1000 as median_seconds,
       count(*) as surveys
  from finishers
 where duration_ms > 0;`),
    related: ["assessment.score-read-time", "assessment.score-completion-cvr"],
  },
  "assessment.score-read-time": {
    label: "Report airtime",
    what: "How long readers spend on their report, over all their visits. Half read longer, half less.",
    stat: "Median",
    per: "per reader (all their visits together)",
    formula: { num: "The middle of the readers' reading times (each visit up to 30 minutes)" },
    caveat:
      "Only visits with a recorded end (under 4 hours after the start) count, each up to 30 minutes, as a tab left open would count hours; readers with no such visit are left out (the note says how many). Bots and the team's visits are left out. Recorded for every visit from 18 Sep 2026.",
    tables: [T_SESSIONS, T_REPORT, T_SUBS],
    query: sql(String.raw`with ${FINISHERS},
reading as (
  select pr.survey_submission_id as id,
         sum(least(extract(epoch from rs.ended_at - rs.started_at), 1800)) as seconds
    from personal_report pr
    join report_session rs on rs.personal_report_id = pr.id
   where pr.survey_submission_id in (select id from finishers)
     and rs.ended_at > rs.started_at and rs.ended_at - rs.started_at < interval '4 hours'
     and not exists (select 1 from ap_team_user t where t.id = rs.user_id)
     and coalesce(rs.user_agent, '') !~* ${BOTS}
   group by 1
)
select percentile_cont(0.5) within group (order by seconds) as median_seconds, count(*) as readers
  from reading;`),
    related: ["assessment.score-survey-time", "assessment.open-rate"],
  },
  "assessment.score-virality": {
    label: "Virality",
    what: "Of the readers, the share who shared their report or invited a friend. It shows how far the report spreads by itself.",
    good: "up",
    stat: "Share",
    per: "per reader (finished survey whose report was opened)",
    formula: {
      num: "Readers who shared their report or invited a friend",
      den: "Readers (reports opened)",
      mult: "× 100",
    },
    caveat:
      "Sharing is a share link made for the report; inviting is an invite sent from the reader's account after they finished. Up to today, so a recent period has had less time.",
    tables: [T_SHARES, T_INVITES, T_SESSIONS, T_SUBS],
    query: sql(String.raw`with ${FINISHERS},
${FOLLOWED},
readers as (
  select f.id,
         exists (select 1 from personal_report pr join report_share x on x.personal_report_id = pr.id
                  where pr.survey_submission_id = f.id) as shared,
         exists (select 1 from app_user u join invite_event i on lower(i.referrer_email) = lower(u.email)
                  where u.id = f.user_id and i.created_at >= f.finished_at) as invited
    from finishers f join followed o using (id)
   where o.visited or o.at_paywall or o.paid
)
select count(*) filter (where shared or invited) as spreading, count(*) as readers,
       round(100.0 * count(*) filter (where shared or invited) / nullif(count(*), 0), 2) as virality_pct
  from readers;`),
    related: ["assessment.open-rate"],
  },

  // Traffic · Sources.
  "assessment.src-visitors": sources,
  "assessment.src-share": {
    ...sources,
    label: "Share",
    what: "Each source's share of all the period's visitors.",
    stat: "Share (partly estimated)",
    formula: { num: "The source's visitors", den: "All visitors", mult: "× 100" },
    related: ["assessment.src-visitors", "assessment.visits"],
  },
  "assessment.src-subs": {
    label: "Submissions",
    what: "Surveys finished in the period, by where the person first came from.",
    stat: "Count",
    per: "per finished survey",
    formula: { num: "Finished surveys whose first page carried the source" },
    caveat:
      "The source is what the survey's tracker kept from the person's first page: Google Ads by its click id or tag, Meta Ads by a Meta tag with a paid medium, organic search by a search engine's tag or, untagged, the referring search engine; an untagged visit from an AI assistant, an email (the Gmail app, webmail) or a social site by that site, from another site as Referral (the referring site is kept from 17 Oct 2026); the rest by the link's tag, and no tag and no referring site is Direct / untagged. A finisher from before 19 Jul 2026 without a tag is Not recorded.",
    tables: [T_SUBS],
    query: sql(SOURCES),
    related: ["assessment.src-cvr", "assessment.step-submitted"],
  },
  "assessment.src-cvr": srcCvr,
  "assessment.src-per-visit": srcPerVisit,

  // Traffic · New & return (PostHog).
  "assessment.nr-visitors": {
    label: "New & returning visitors",
    what: "The people PostHog saw on the site in the period, split by whether it had seen them before the period began. The share is of the two groups together.",
    stat: "Count",
    per: "per person PostHog recognises (a browser), once in the period",
    formula: {
      num: "People PostHog saw in the period, by whether their first visit was before it",
    },
    caveat:
      "PostHog sees about a quarter of our visits (blockers, declined cookies) and starts on 23 Aug 2026, so returning means seen by it since then. Each person counts once over the period, unlike the daily visitors above. The team's people are left out. The source, device and tier filters don't apply: it is all traffic.",
    tables: [T_PH_EVENTS],
    query: { lang: "HogQL", text: NEW_RETURNING },
    related: ["assessment.nr-cvr", "assessment.nr-per-visit", "assessment.visits"],
  },
  "assessment.nr-cvr": {
    label: "Survey CVR",
    what: "Of each group's people, the share who finished the survey in the period: do people who come back finish more often?",
    good: "up",
    stat: "Share",
    per: "per person PostHog saw",
    formula: {
      num: "The group's people who finished the survey in the period",
      den: "The group's people",
      mult: "× 100",
    },
    caveat:
      "Both sides are PostHog's own, so it is not the Survey submission CVR above (finished surveys over the visit log's daily visitors). A finished survey PostHog didn't see is in neither group.",
    tables: [T_PH_EVENTS],
    query: { lang: "HogQL", text: NEW_RETURNING },
    related: ["assessment.nr-visitors", "assessment.submission-cvr"],
  },
  "assessment.nr-per-visit": {
    label: "€ / visit",
    what: "Money taken in the period per person of each group: are returning visitors worth more?",
    good: "up",
    stat: "Ratio",
    per: "per person PostHog saw",
    formula: {
      num: "The period's payments by the group's people (found through the visit they finished the survey in)",
      den: "The group's people",
    },
    caveat:
      "A payment whose finisher's visit PostHog didn't see is in neither group (often a survey finished before PostHog's first day, 23 Aug 2026), so the two can add up to less than Revenue.",
    tables: [T_PAYMENT, T_PH_EVENTS],
    query: sql(NEW_RETURNING_MONEY),
    related: ["assessment.nr-visitors", "assessment.rev-visit"],
  },

  // Traffic · Performance by source: the Sources table's rates, as bars.
  "assessment.perf-cvr": {
    ...srcCvr,
    label: "Survey submission CVR",
    what: "Finished surveys per visitor for each source, drawn as bars: the Sources table's Survey CVR.",
    related: ["assessment.src-cvr", "assessment.submission-cvr"],
  },
  "assessment.perf-per-visit": {
    ...srcPerVisit,
    label: "€ revenue per visit",
    what: "Money taken in the period per visitor for each source, drawn as bars: the Sources table's € / visit.",
    related: ["assessment.src-per-visit", "assessment.rev-visit"],
  },

  // Payment · Prices.
  "assessment.price": priceTable({
    label: "Price",
    what: "The price the quote showed for the plan: the price list of the quote's price arm on the day it was made.",
    stat: "Price, as quoted",
    per: "per price quote",
    formula: { num: "The plan's starting price on the quote's price list" },
    caveat:
      "Before Pricing 2.0 (3 Aug 2026) prices were personal and only a paid one was kept: Not kept. The arm is the one the quote was dealt; later re-syncs moved unpaid quotes to newer lists, so the price on offer today can differ.",
  }),
  "assessment.price-quoted": priceTable({
    label: "Quoted",
    what: "Readers quoted this plan at this price in the period.",
    stat: "Count",
    per: "per reader (a finished survey), not per quote",
    formula: { num: "Finished surveys with a quote of the plan at the price, made in the period" },
    caveat:
      "A reader is quoted every plan on sale at once, so the rows of one price list share their readers: the rows don't add up to people.",
  }),
  "assessment.price-checkouts": priceTable({
    label: "Checkouts",
    what: "Of the readers quoted this plan and price, those who opened a checkout on it.",
    stat: "Count",
    per: "per reader",
    formula: { num: "Readers whose quote of the plan opened a checkout" },
    caveat: "Up to today, whenever the checkout was opened.",
  }),
  "assessment.price-sales": priceTable({
    label: "Sales",
    what: "Of the readers quoted this plan and price, those who paid on that quote, whenever they paid.",
    stat: "Count",
    per: "per reader (one paying twice on a quote is one sale)",
    formula: { num: "Readers with a payment over €0 on the quote" },
    caveat:
      "A sale in the period on an older quote is not here (Revenue above has it). Free unlocks (€0) are not sales.",
  }),
  "assessment.price-cvr": priceTable({
    label: "Payment CVR",
    what: "Of the readers quoted this plan and price, the share who bought it: which prices sell.",
    good: "up",
    stat: "Share",
    per: "per reader quoted",
    formula: {
      num: "Sales (readers who paid on the quote)",
      den: "Quoted (readers)",
      mult: "× 100",
    },
    caveat:
      "Not the Payment CVR tile, which is of finished surveys. A reader is quoted every plan at once, so each row's rate is of all the readers who saw that price list.",
  }),
  "assessment.price-revenue": priceTable({
    label: "Revenue",
    what: "The money paid on these quotes, whenever it was paid.",
    good: "up",
    stat: "Sum",
    per: "per payment",
    formula: { num: "Payments over €0 on the quotes of the plan at the price" },
    caveat:
      "Counted with the quote it was paid on, also when paid after the period, so it is not the Revenue tile (payments made in the period).",
  }),
};
