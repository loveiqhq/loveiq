/**
 * The Emails pages' fields (Reports › Emails and Assessment A › Emails). Every query is built from
 * the same registry as the page (email-registry.ts), so the days each email is counted, its
 * goal and its unsubscribe campaigns can't drift apart; each was run read-only on production and
 * gave the page's own figures (scripts in the PR).
 */
import { EMAILS, GOAL_DAYS, OPENS_FROM } from "@features/admin/server/ap/email-registry";
import { UNLOCK_REASONS } from "@features/unlock-feedback/logic/reasons";

import type { FieldRegistry, FieldTable } from "./types";

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const reader = EMAILS.filter((d) => d.readerFrom && d.stages.length);
const STAGES = reader
  .flatMap((d) =>
    d.stages.map((s) => `(${q(s)}, date ${q(d.readerFrom!)}, ${q(d.goalKind ?? "")})`)
  )
  .join(",\n    ");
const TALLIES = EMAILS.filter((d) => d.tally)
  .map((d) => `(${q(d.tally!.experiment)}, date ${q(d.tally!.from)})`)
  .join(", ");
const CAMPAIGNS = EMAILS.flatMap((d) => {
  const from = d.readerFrom ?? d.tally?.from;
  return from ? d.unsub.map((c) => `(${q(c)}, date ${q(from)})`) : [];
}).join(", ");
const REASONS = UNLOCK_REASONS.map(q).join(", ");

/**
 * The emails the page counts per reader, by the day they were sent: the team and our probes left
 * out, a click implying an open and an open a delivery, and the goal reached within 7 days (an
 * answer to the unlock question only with a reason and not within 2 s of the delivery).
 */
export const PER_READER = `with
  emails(stage, reader_from, goal) as (values
    ${STAGES}),
  staff as (select id from ap_team_user),
  ev as (
    select m.resend_id, max(m.stage) as stage, max(m.survey_submission_id) as sid,
           min(m.first_at) filter (where m.event_type = 'sent') as sent_ev_at,
           min(m.first_at) as first_at,
           min(m.first_at) filter (where m.event_type = 'delivered') as delivered_at,
           min(m.first_at) filter (where m.event_type = 'opened') as opened_at,
           min(m.first_at) filter (where m.event_type = 'clicked') as clicked_at,
           min(m.first_at) filter (where m.event_type = 'bounced') as bounced_at,
           min(m.first_at) filter (where m.event_type = 'complained') as complained_at
      from email_message_event m
     group by m.resend_id),
  uf_log as (
    select resend_id, sent_at, survey_submission_id as sid
      from unlock_feedback where resend_id is not null and sent_at is not null),
  msg as (
    select coalesce(e.resend_id, u.resend_id) as resend_id, coalesce(e.stage, 'unlock_feedback') as stage,
           coalesce(e.sid, u.sid) as sid, coalesce(e.sent_ev_at, u.sent_at, e.first_at) as sent_at,
           e.delivered_at, e.opened_at, e.clicked_at, e.bounced_at, e.complained_at
      from ev e full join uf_log u on u.resend_id = e.resend_id),
  per_reader as (
    select g.*, x.goal, (g.sent_at at time zone 'Europe/Berlin')::date as day, s.user_id
      from msg g
      join emails x on x.stage = g.stage
      join survey_submission s on s.id = g.sid
     where not exists (select 1 from staff where staff.id = s.user_id)
       and not coalesce(pg_input_is_valid(s.utm_tracker, 'jsonb')
             and jsonb_typeof(s.utm_tracker::jsonb) = 'object'
             and (lower(btrim(s.utm_tracker::jsonb->>'utm_medium')) = 'probe'
                  or lower(btrim(s.utm_tracker::jsonb->>'utm_source')) in
                     ('prod-verification', 'prod-e2e-check', 'staging-e2e-check', 'verify')), false)
       and (g.sent_at at time zone 'Europe/Berlin')::date between greatest(:from::date, x.reader_from) and :to::date),
  goals as (
    select p.*,
      case p.goal
        when 'open_report' then (select min(rs.started_at) from personal_report pr
            join report_session rs on rs.personal_report_id = pr.id
           where pr.survey_submission_id = p.sid and rs.started_at >= p.sent_at
             and rs.started_at < p.sent_at + interval '${GOAL_DAYS} days'
             and not exists (select 1 from staff where staff.id = rs.user_id))
        when 'buy_full' then (select min(coalesce(pm.payment_date_time, pm.created_date_time)) from personal_report pr
            join payment pm on pm.personal_report_id = pr.id
           where pr.survey_submission_id = p.sid and pm.status = 'succeeded' and coalesce(pm.is_test, false) = false
             and pm.amount > 0 and pm.metadata->>'plan' in ('full_report', 'all_reports')
             and coalesce(pm.payment_date_time, pm.created_date_time) >= p.sent_at
             and coalesce(pm.payment_date_time, pm.created_date_time) < p.sent_at + interval '${GOAL_DAYS} days')
        when 'buy_core' then (select min(coalesce(pm.payment_date_time, pm.created_date_time)) from personal_report pr
            join payment pm on pm.personal_report_id = pr.id
           where pr.survey_submission_id = p.sid and pm.status = 'succeeded' and coalesce(pm.is_test, false) = false
             and pm.amount > 0 and pm.metadata->>'plan' = 'initial'
             and coalesce(pm.payment_date_time, pm.created_date_time) >= p.sent_at
             and coalesce(pm.payment_date_time, pm.created_date_time) < p.sent_at + interval '${GOAL_DAYS} days')
        when 'answer' then (select min(uf.answered_at) from unlock_feedback uf
           where uf.survey_submission_id = p.sid and uf.reason in (${REASONS})
             and uf.answered_at >= p.sent_at and uf.answered_at < p.sent_at + interval '${GOAL_DAYS} days'
             and (p.delivered_at is null or uf.answered_at >= p.delivered_at + interval '2 seconds'))
        when 'invite' then (select min(i.created_at) from app_user u
            join invite_event i on lower(btrim(i.referrer_email)) = lower(btrim(u.email))
           where u.id = p.user_id and i.created_at >= p.sent_at
             and i.created_at < p.sent_at + interval '${GOAL_DAYS} days')
        when 'share' then (select min(x.created_at) from personal_report pr
            join report_share x on x.personal_report_id = pr.id
           where pr.survey_submission_id = p.sid and x.created_at >= p.sent_at
             and x.created_at < p.sent_at + interval '${GOAL_DAYS} days')
      end as goal_at
      from per_reader p),
  counted as (
    select g.*,
           (g.clicked_at is not null or (g.goal = 'answer' and g.goal_at is not null)) as clicked,
           (g.opened_at is not null or g.clicked_at is not null or (g.goal = 'answer' and g.goal_at is not null)) as opened,
           (g.delivered_at is not null or g.opened_at is not null or g.clicked_at is not null
             or (g.goal = 'answer' and g.goal_at is not null)) as delivered
      from goals g),
  tallies as (
    select t.experiment, t.event_type, t.day, sum(t.n) as n
      from email_experiment_event t
      join (values ${TALLIES}) x(experiment, t_from) on x.experiment = t.experiment
     where t.day between greatest(:from::date, x.t_from) and :to::date
     group by 1, 2, 3)`;

const PROD = (table: string, columns: string, filters: string, watch?: string): FieldTable => ({
  source: "production",
  table,
  columns,
  filters,
  ...(watch ? { watch } : {}),
});
const T_MSG = PROD(
  "email_message_event",
  "resend_id, stage, survey_submission_id, variant, event_type ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained'), first_at",
  "Period: by the Berlin day each email was sent; its later events count too. The team's readers and our probes are left out.",
  `Kept per reader, from the stage and sub tags on each send, since 16 Oct 2026 for the 72-hour email and since each email's first send for the rest. Before 11 Nov 2026 the 'sent' event wasn't kept: an email's first event stands in for it. Only the first of each kind per email is kept.`
);
const T_TALLY = PROD(
  "email_experiment_event",
  "day, experiment, arm, event_type, n",
  "Period: by the day each event happened.",
  "Resend's daily counts per test version, for the emails no reader can be named for (survey paused, share, invite). The team's own tests are in them, and every click counts, so one reader clicking twice counts twice."
);
const T_UF = PROD(
  "unlock_feedback",
  "resend_id, sent_at, survey_submission_id, reason, answered_at",
  "Period: by its send day",
  "The unlock question's own send log: its sends Resend refused left no event, and are counted from here."
);
const T_SUPPR = PROD(
  "email_suppression",
  "email, reason ('unsubscribed'), source_campaign, created_at",
  "Period: by the Berlin day of the unsubscribe",
  "Kept by the campaign the unsubscribe link carried, so it can't be split by version. The team's addresses are left out."
);

const CAVEAT_SOURCES =
  "Survey done, the receipts, the pay-to-start report emails, share and invite are counted from 11 Nov 2026: before, Resend's counts of them also held staging's test emails (staging sends through the same account). Emails no registry entry names (a future newsletter) show on the overall page only.";

export const fields: FieldRegistry = {
  "emails.sent": {
    label: "Sent",
    what: "Every email we handed to Resend in the range, one per email. It says how much email goes out, not how well it lands; under each email, its share of the range's finished surveys.",
    stat: "Count",
    per: "per email sent",
    formula: { num: "Emails sent in the range" },
    caveat: CAVEAT_SOURCES,
    tables: [T_MSG, T_TALLY, T_UF],
    query: {
      lang: "SQL",
      text: `${PER_READER}
select (select count(*) from counted)
     + coalesce((select sum(n) from tallies where event_type = 'sent'), 0) as sent;`,
    },
    related: ["emails.delivered", "emails.bounced"],
  },
  "emails.delivered": {
    label: "Delivered",
    what: "Share of the emails sent that reached the reader's mail server. A low share points to bad addresses or our sender's reputation.",
    good: "up",
    stat: "Share",
    per: "per email sent",
    formula: { num: "Delivered", den: "Sent", mult: "× 100" },
    caveat: `An email opened or clicked counts as delivered even if its delivery event was lost. Delivered means accepted by the receiving server: it can still land in spam. ${CAVEAT_SOURCES}`,
    tables: [T_MSG, T_TALLY],
    query: {
      lang: "SQL",
      text: `${PER_READER}
select (select count(*) filter (where delivered) from counted)
         + coalesce((select sum(n) from tallies where event_type = 'delivered'), 0) as delivered,
       (select count(*) from counted)
         + coalesce((select sum(n) from tallies where event_type = 'sent'), 0) as sent;`,
    },
    related: ["emails.sent", "emails.bounced"],
  },
  "emails.bounced": {
    label: "Bounced",
    what: "Share of the emails sent that were rejected, mostly because the address does not exist. Above about 4% hurts our sender's reputation.",
    good: "down",
    stat: "Share",
    per: "per email sent",
    formula: { num: "Bounced", den: "Sent", mult: "× 100" },
    caveat:
      "A bounced address goes on our suppression list and is never mailed again. Sends Resend refused itself (an address on its own list) are sent, not bounced.",
    tables: [T_MSG, T_TALLY],
    query: {
      lang: "SQL",
      text: `${PER_READER}
select (select count(*) filter (where bounced_at is not null) from counted)
         + coalesce((select sum(n) from tallies where event_type = 'bounced'), 0) as bounced,
       (select count(*) from counted)
         + coalesce((select sum(n) from tallies where event_type = 'sent'), 0) as sent;`,
    },
    related: ["emails.sent", "emails.delivered"],
  },
  "emails.opened": {
    label: "Opened",
    what: "Share of the delivered emails opened at least once. It says whether the subject line and sender make people look.",
    good: "up",
    stat: "Share",
    per: "per email delivered",
    formula: { num: "Opened", den: "Delivered (sent from 16 Oct 2026)", mult: "× 100" },
    caveat: `Open tracking went on on 16 Oct 2026: earlier emails are left out of both counts. Apple Mail and some others open every email by themselves, so read it as a ceiling, and trust clicks over opens. A click implies an open.`,
    tables: [T_MSG, T_TALLY],
    query: {
      lang: "SQL",
      text: `${PER_READER}
select (select count(*) filter (where opened) from counted)
         + coalesce((select sum(n) from tallies where event_type = 'opened'), 0) as opened,
       (select count(*) filter (where delivered and day >= date '${OPENS_FROM}') from counted)
         + coalesce((select sum(n) from tallies where event_type = 'delivered' and day >= date '${OPENS_FROM}'), 0) as delivered;`,
    },
    related: ["emails.clicked"],
  },
  "emails.clicked": {
    label: "Clicked",
    what: "Share of the delivered emails where the reader clicked a link: the surest sign an email made someone act, and the main proxy for whether a change to an email works.",
    good: "up",
    stat: "Share",
    per: "per email delivered",
    formula: { num: "Clicked", den: "Delivered", mult: "× 100" },
    caveat:
      "Counted once per email, however many links were clicked; an answer to the unlock question is a click on it. Survey paused, share and invite count each click (Resend's daily counts). Link scanners in company inboxes can click too.",
    tables: [T_MSG, T_TALLY],
    query: {
      lang: "SQL",
      text: `${PER_READER}
select (select count(*) filter (where clicked) from counted)
         + coalesce((select sum(n) from tallies where event_type = 'clicked'), 0) as clicked,
       (select count(*) filter (where delivered) from counted)
         + coalesce((select sum(n) from tallies where event_type = 'delivered'), 0) as delivered;`,
    },
    related: ["emails.opened", "emails.clicks30"],
  },
  "emails.complaints": {
    label: "Spam complaints",
    what: "Emails a reader marked as spam. Even a few per thousand can push our mail into spam folders.",
    good: "down",
    stat: "Count",
    per: "per email delivered",
    formula: { num: "Marked as spam" },
    caveat:
      "Only providers that report complaints back are counted (Gmail and Outlook do). Kept per reader from 11 Nov 2026; a complaint also puts the address on our suppression list.",
    tables: [T_MSG, T_TALLY],
    query: {
      lang: "SQL",
      text: `${PER_READER}
select (select count(*) filter (where complained_at is not null) from counted)
     + coalesce((select sum(n) from tallies where event_type = 'complained'), 0) as complaints;`,
    },
  },
  "emails.unsubscribed": {
    label: "Unsubscribed",
    what: "Share of the delivered emails after which the reader unsubscribed: the cost of every send. A rising share means an email feels unwanted or too frequent.",
    good: "down",
    stat: "Share",
    per: "per email delivered",
    formula: { num: "Unsubscribes", den: "Delivered", mult: "× 100" },
    caveat:
      "Kept by the campaign the unsubscribe link carried, on the days its email is counted, so not by version. The purchase emails of pay to start share the receipts' campaign: their unsubscribes show on the receipts' rows.",
    tables: [T_SUPPR, T_MSG],
    query: {
      lang: "SQL",
      text: `with campaigns(campaign, c_from) as (values ${CAMPAIGNS}),
  staff_addr as (select lower(btrim(u.email)) as addr from app_user u where u.id in (select id from ap_team_user))
select count(*) as unsubscribes
  from email_suppression es
  join campaigns c on c.campaign = es.source_campaign
 where es.reason = 'unsubscribed'
   and (es.created_at at time zone 'Europe/Berlin')::date between greatest(:from::date, c.c_from) and :to::date
   and not exists (select 1 from staff_addr t where t.addr = lower(btrim(es.email)))
   and split_part(lower(btrim(es.email)), '@', 2) <> 'loveiq.org';`,
    },
    related: ["emails.delivered"],
  },
  "emails.goal": {
    label: "CVR goal",
    what: "The one action an email is sent to cause: open the report, answer the unlock question, buy the full report, invite a friend. It defines what counts as that email's conversion.",
    stat: "Definition",
    per: "per email",
    formula: { num: "One goal per email, set in the email registry" },
    caveat:
      "An email sent before its reader has a survey (survey paused, pay to start's confirmation) or to someone else (share, invite) has no reader to follow: its goal reads “not tracked”.",
    tables: [T_MSG],
    query: {
      lang: "SQL",
      text: `-- The goal each email is read by (features/admin/server/ap/email-registry.ts).
select stage, reader_from as counted_from, goal
  from (values
    ${STAGES}) as e(stage, reader_from, goal)
 order by stage;`,
    },
    related: ["emails.conversions"],
  },
  "emails.conversions": {
    label: "Conversions",
    what: "Readers who did the email's goal within 7 days of it, as a count and as a share of the emails sent: an email is judged by the action it is sent for.",
    good: "up",
    stat: "Share",
    per: "per email sent",
    formula: {
      num: "Goal reached within 7 days",
      den: "Emails sent (counted per reader)",
      mult: "× 100",
    },
    caveat:
      "Read per reader only. A goal reached for another reason (the reader came back by themselves) counts too: it is what happened after the email, not proof the email caused it. Emails of the last 7 days are still inside their window. A report opened means a report session (not the team's own look); a purchase is a paid one (gifts and €0 codes are not).",
    tables: [
      T_MSG,
      PROD("report_session", "personal_report_id, user_id, started_at", "After each send, 7 days"),
      PROD(
        "payment",
        "personal_report_id, status, amount, is_test, metadata->>'plan', payment_date_time",
        "After each send, 7 days"
      ),
      T_UF,
    ],
    query: {
      lang: "SQL",
      text: `${PER_READER}
select count(*) filter (where goal_at is not null) as conversions,
       count(*) filter (where goal <> '') as sent
  from counted;`,
    },
    related: ["emails.goal", "emails.sent"],
  },
  "emails.clicks30": {
    label: "Clicks · 30 days",
    what: "Clicks per day over the 30 days ending with the range, with the trend per week: is an email getting more clicks or fewer since we changed it?",
    good: "up",
    stat: "Count",
    per: "per day",
    formula: { num: "Clicks per day", den: "", mult: "trend: least squares, per week" },
    caveat:
      "By the day of the click, whichever day the email went out. Survey paused, share and invite count every click (Resend's daily counts).",
    tables: [T_MSG, T_TALLY],
    query: {
      lang: "SQL",
      text: `-- Run with :from = the range's last day minus 29 days.
${PER_READER.replace(
  "between greatest(:from::date, x.reader_from) and :to::date)",
  "<= :to::date and (g.sent_at at time zone 'Europe/Berlin')::date >= x.reader_from)"
)}
select coalesce(c.day, t.day) as day, coalesce(c.n, 0) + coalesce(t.n, 0) as clicks
  from (select ((coalesce(clicked_at, goal_at)) at time zone 'Europe/Berlin')::date as day, count(*) as n
          from counted where clicked group by 1) c
  full join (select day, sum(n) as n from tallies where event_type = 'clicked' group by 1) t on t.day = c.day
 where coalesce(c.day, t.day) between :from::date and :to::date
 order by 1;`,
    },
    related: ["emails.clicked"],
  },
  "emails.weeks": {
    label: "Week by week",
    what: "Emails sent each Monday-to-Sunday week, and the clicks on them per email sent: how much we send and how much of it lands, over time.",
    good: "up",
    stat: "Count and share",
    per: "per week",
    formula: { num: "Clicked", den: "Sent that week", mult: "× 100" },
    caveat:
      "A week's emails are still being clicked for a few days after it, so the latest week reads low at first.",
    tables: [T_MSG, T_TALLY],
    query: {
      lang: "SQL",
      text: `${PER_READER}
select date_trunc('week', d)::date as week, sum(sent) as sent, sum(clicked) as clicked
  from (select day as d, 1 as sent, case when clicked then 1 else 0 end as clicked from counted
        union all
        select day, case when event_type = 'sent' then n else 0 end, case when event_type = 'clicked' then n else 0 end
          from tallies) x
 group by 1 order by 1;`,
    },
    related: ["emails.sent", "emails.clicked"],
  },
};
