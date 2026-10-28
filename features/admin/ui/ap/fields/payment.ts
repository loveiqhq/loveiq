/**
 * The Payment page's fields (ApPayment.tsx): what each figure means, how it is counted and the
 * query behind it. Every query was run read-only for 21 Sep – 20 Oct 2026 against the page's own
 * figure for Last 30 days (and the per-person counts for Last 12 months too): see the report of
 * 21 Oct 2026. `:from` and `:to` are the range's first and last Berlin days.
 */
import type { FieldDef, FieldRegistry, FieldTable } from "./types";

// ---- the queries' shared parts

/** The team's own surveys and payments (ap_team_user: @loveiq.org or the team's test code) are never counted. */
const NOT_STAFF = "not exists (select 1 from ap_team_user t where t.id = s.user_id)";
const REAL_SALE = "p.status = 'succeeded' and not coalesce(p.is_test, false) and p.amount > 0";
const FULL_PLAN = "p.metadata->>'plan' in ('full_report', 'all_reports', 'core')";
/** The Initial plan: the EUR 1.99 Core Archetype (pre-unlock). */
const PRE_PLAN = "p.metadata->>'plan' = 'initial'";
/** A payment's day: when it was paid (a pay-to-start purchase's row is written when its survey claims it). */
const PAID_DAY =
  "(coalesce(p.payment_date_time, p.created_date_time) at time zone 'Europe/Berlin')::date";
const FINISH_DAY = "(s.created_date_time at time zone 'Europe/Berlin')::date";
const SALES_JOIN = `from payment p
  join personal_report pr on pr.id = p.personal_report_id
  join survey_submission s on s.id = pr.survey_submission_id`;
/** A person: their account, or the survey alone when it has none. */
const PERSON = "coalesce('u' || s.user_id, 's' || s.id)";

const SALES_Q = `-- The range's sales by payment day: real ones (succeeded, not a test, over €0) and free unlocks.
select count(*) filter (where p.amount > 0) as paid_sales,
       count(*) filter (where coalesce(p.amount, 0) <= 0) as free_unlocks,
       count(*) filter (where p.amount > 0 and ${FULL_PLAN}) as full_unlocks,
       round(sum(p.amount) filter (where p.amount > 0), 2) as revenue,
       round(sum(p.amount) filter (where p.amount > 0)
             / nullif(count(*) filter (where p.amount > 0), 0), 2) as avg_order_value
  ${SALES_JOIN}
 where p.status = 'succeeded' and not coalesce(p.is_test, false)
   and ${PAID_DAY} between :from and :to
   and ${NOT_STAFF};`;

const PRE_Q = `-- The range's pre-unlock sales (the Initial plan: the EUR 1.99 Core Archetype) by payment day:
-- real ones (succeeded, not a test, over EUR 0). E07's EUR 0 gift is no sale. Blank for a range
-- ending before 23 Oct 2026, its first whole day on sale.
select case when :to >= date '2026-10-23' then count(*) end as pre_unlock_sales,
       case when :to >= date '2026-10-23' then coalesce(round(sum(p.amount), 2), 0) end as revenue,
       round(sum(p.amount) / nullif(count(*), 0), 2) as average_price
  ${SALES_JOIN}
 where ${REAL_SALE} and ${PRE_PLAN}
   and ${PAID_DAY} between :from and :to
   and ${NOT_STAFF};`;

const PRE_CVR_Q = `-- The range's finished surveys (each one) and whether their Core Archetype was pre-unlocked
-- (EUR 1.99 paid), so far. Blank before 23 Oct 2026, its first whole day on sale.
with f as (
  select s.id,
         exists (select 1 from personal_report pr join payment p on p.personal_report_id = pr.id
                  where pr.survey_submission_id = s.id and ${REAL_SALE} and ${PRE_PLAN}) as pre_unlock
    from survey_submission s
   where s.status = 'completed'
     and ${FINISH_DAY} between :from and :to
     and ${NOT_STAFF}
)
select count(*) filter (where pre_unlock) as pre_unlocked,
       count(*) as submissions,
       -- Blank for a range starting before 23 Oct 2026: nobody could pre-unlock its first days.
       case when :from >= date '2026-10-23'
            then round(100.0 * count(*) filter (where pre_unlock) / nullif(count(*), 0), 2) end as pre_unlock_cvr_pct
  from f;`;

const FULL_CVR_Q = `-- The range's finished surveys (each one) and whether their report got a full unlock, so far.
with f as (
  select s.id,
         exists (select 1 from personal_report pr join payment p on p.personal_report_id = pr.id
                  where pr.survey_submission_id = s.id and ${REAL_SALE} and ${FULL_PLAN}) as full_unlock
    from survey_submission s
   where s.status = 'completed'
     and ${FINISH_DAY} between :from and :to
     and ${NOT_STAFF}
)
select count(*) filter (where full_unlock) as full_unlocked,
       count(*) as submissions,
       round(100.0 * count(*) filter (where full_unlock) / nullif(count(*), 0), 2) as full_unlock_cvr_pct
  from f;`;

const PAY_CVR_Q = `-- The range's finishers as people (each once; a survey without an account counts alone), and
-- whether any of their surveys' reports was paid for, so far.
with f as (
  select ${PERSON} as person,
         exists (select 1 from personal_report pr join payment p on p.personal_report_id = pr.id
                  where pr.survey_submission_id = s.id and ${REAL_SALE}) as paid
    from survey_submission s
   where s.status = 'completed'
     and ${FINISH_DAY} between :from and :to
     and ${NOT_STAFF}
)
select count(distinct person) filter (where paid) as paying_people,
       count(distinct person) as finishers,
       round(100.0 * count(distinct person) filter (where paid)
             / nullif(count(distinct person), 0), 2) as payment_cvr_pct
  from f;`;

const CHECKOUT_Q = `-- Paid checkouts (a Stripe payment page for a report over €0), on the day the page was reached:
-- Stripe writes an unpaid one when it expires, 24 hours after it opened. From 1 May 2026. The
-- report's only: pay to start's own purchase (journey pay_to_start) is the Pay to start page's.
with c as (
  select p.status,
         (p.status = 'succeeded' or p.payment_method_type is not null
           or p.failure_code is not null) as attempted,
         case when p.status = 'canceled' then p.created_date_time - interval '24 hours'
              else p.created_date_time end as opened
    ${SALES_JOIN}
   where not coalesce(p.is_test, false) and p.amount > 0
     and coalesce(p.metadata->>'journey', '') <> 'pay_to_start'
     and ${NOT_STAFF}
)
select count(*) as reached_payment_page,
       count(*) filter (where attempted) as attempted,
       count(*) filter (where status in ('succeeded', 'refunded', 'disputed')) as paid,
       round(100.0 * count(*) filter (where status in ('succeeded', 'refunded', 'disputed'))
             / nullif(count(*), 0), 1) as checkout_success_pct
  from c
 where (opened at time zone 'Europe/Berlin')::date between greatest(:from, date '2026-05-01') and :to;`;

const TYPES_Q = `-- The range's real sales by payment type (payment day), each sale in one row, with those
-- refunded since: a full refund turns a payment to refunded, a part refund keeps it with
-- refund_amount. Pay to start's own purchase carries its journey; an upgrade after EUR 1.99 is
-- a full unlock bought on a report whose EUR 1.99 Core Archetype was paid before it; what a
-- pay-to-start reader bought on the report after has its own row.
with sold as (
  select case when p.metadata->>'journey' = 'pay_to_start' and ${FULL_PLAN} then 'Pay to start · full'
              when p.metadata->>'journey' = 'pay_to_start' and ${PRE_PLAN} then 'Pay to start · €1.99 pre'
              when ${FULL_PLAN} and exists (
                     select 1 from payment e
                      where e.personal_report_id = p.personal_report_id and e.metadata->>'plan' = 'initial'
                        and e.amount > 0 and e.status in ('succeeded', 'refunded')
                        and not coalesce(e.is_test, false) and coalesce(e.payment_date_time, e.created_date_time) < coalesce(p.payment_date_time, p.created_date_time))
                then 'Upgrade after €1.99'
              -- Bought on a pay-to-start reader's report afterwards: their survey was bought first.
              when exists (select 1 from prepaid_report_access pa
                            where pa.consumed_submission_id = s.id and pa.offer is not null
                              and pa.paid_at is not null and pa.status in ('succeeded', 'refunded'))
                then 'Pay to start · later purchase on the report'
              when ${FULL_PLAN} then 'Full unlock after report'
              when ${PRE_PLAN} then 'Pre-unlock after report'
              else coalesce(p.metadata->>'plan', 'Plan not recorded') end as payment_type,
         p.status, p.amount, coalesce(p.refund_amount, 0) as refunded
    ${SALES_JOIN}
   where p.status in ('succeeded', 'refunded') and not coalesce(p.is_test, false) and p.amount > 0
     and ${PAID_DAY} between :from and :to
     and ${NOT_STAFF}
)
select payment_type,
       count(*) filter (where status = 'succeeded') as sales,
       round(avg(amount) filter (where status = 'succeeded'), 2) as average_price,
       round(sum(amount) filter (where status = 'succeeded'), 2) as revenue,
       round(100.0 * sum(amount) filter (where status = 'succeeded')
             / sum(sum(amount) filter (where status = 'succeeded')) over (), 1) as share_of_revenue_pct,
       count(*) filter (where status = 'refunded' or refunded > 0) as refunds,
       round(100.0 * count(*) filter (where status = 'refunded' or refunded > 0)
             / count(*), 1) as refund_rate_pct
  from sold
 group by 1
 order by 2 desc;`;

/** The over-time periods: as the page, weeks up to about four months, from 1 May 2026. */
const PERIODS_NOTE = `-- Per period at the page's grain (:grain: a day up to two weeks, a week up to about four months,
-- a month beyond), from 1 May 2026, when paid checkout began.`;

const OT_CHART_Q = `${PERIODS_NOTE} Paid sales by unlock type (payment day) and
-- survey submissions (each finished survey, by its day).
with sales as (
  select date_trunc(:grain, ${PAID_DAY})::date as period,
         count(*) filter (where ${PRE_PLAN}) as pre_unlock_sales,
         count(*) filter (where ${FULL_PLAN}) as full_unlock_sales
    ${SALES_JOIN}
   where ${REAL_SALE}
     and ${PAID_DAY} between greatest(:from, date '2026-05-01') and :to
     and ${NOT_STAFF}
   group by 1
), subs as (
  select date_trunc(:grain, ${FINISH_DAY})::date as period, count(*) as survey_submissions
    from survey_submission s
   where s.status = 'completed'
     and ${FINISH_DAY} between greatest(:from, date '2026-05-01') and :to
     and ${NOT_STAFF}
   group by 1
)
-- Pre-unlocks are counted from 23 Oct 2026, their first whole day on sale: a period ending before it has none to count (blank).
select period,
       case when (period + ('1 ' || :grain)::interval - interval '1 day')::date >= date '2026-10-23' then coalesce(pre_unlock_sales, 0) end as pre_unlock_sales,
       coalesce(full_unlock_sales, 0) as full_unlock_sales,
       coalesce(survey_submissions, 0) as survey_submissions
  from subs full join sales using (period)
 order by 1;`;

const OT_TABLE_Q = `${PERIODS_NOTE} Full-unlock sales and revenue by payment
-- day, and the same days' finishers as people (each once in a period) with those who paid, so far.
with sales as (
  select date_trunc(:grain, ${PAID_DAY})::date as period,
         count(*) filter (where ${PRE_PLAN}) as pre_unlock_sales,
         sum(p.amount) filter (where ${PRE_PLAN}) as pre_unlock_revenue,
         count(*) filter (where ${FULL_PLAN}) as full_unlock_sales,
         sum(p.amount) filter (where ${FULL_PLAN}) as full_unlock_revenue,
         sum(p.amount) as revenue
    ${SALES_JOIN}
   where ${REAL_SALE}
     and ${PAID_DAY} between greatest(:from, date '2026-05-01') and :to
     and ${NOT_STAFF}
   group by 1
), finished as (
  select date_trunc(:grain, ${FINISH_DAY})::date as period, ${PERSON} as person,
         exists (select 1 from personal_report pr join payment p on p.personal_report_id = pr.id
                  where pr.survey_submission_id = s.id and ${REAL_SALE}) as paid
    from survey_submission s
   where s.status = 'completed'
     and ${FINISH_DAY} between greatest(:from, date '2026-05-01') and :to
     and ${NOT_STAFF}
), people as (
  select period, count(distinct person) as finishers,
         count(distinct person) filter (where paid) as paying_people
    from finished
   group by 1
)
-- Pre-unlocks are counted from 23 Oct 2026, their first whole day on sale: a period ending before it has none to count (blank).
select period,
       case when (period + ('1 ' || :grain)::interval - interval '1 day')::date >= date '2026-10-23' then coalesce(pre_unlock_sales, 0) end as pre_unlock_sales,
       case when (period + ('1 ' || :grain)::interval - interval '1 day')::date >= date '2026-10-23' then round(pre_unlock_revenue / nullif(pre_unlock_sales, 0), 2) end as pre_unlock_avg,
       coalesce(full_unlock_sales, 0) as full_unlock_sales,
       round(full_unlock_revenue / nullif(full_unlock_sales, 0), 2) as full_unlock_avg,
       coalesce(round(revenue, 2), 0) as revenue,
       coalesce(finishers, 0) as finishers,
       coalesce(paying_people, 0) as paying_people,
       round(100.0 * paying_people / nullif(finishers, 0), 2) as payment_cvr_pct
  from people full join sales using (period)
 order by 1;`;

const METHODS_Q = `-- The range's real sales by how they were paid: Stripe Link, or the card's brand.
select case when p.payment_method_type = 'card' then coalesce(p.card_brand, 'card')
            else p.payment_method_type end as method,
       count(*) as sales,
       round(100.0 * count(*) / sum(count(*)) over (), 0) as share_pct,
       round(sum(p.amount), 0) as revenue,
       round(sum(p.amount) / count(*), 2) as aov
  ${SALES_JOIN}
 where ${REAL_SALE}
   and ${PAID_DAY} between :from and :to
   and ${NOT_STAFF}
 group by 1
 order by 2 desc, sum(p.amount) desc;`;

const SEG_Q = `-- Who pays by one segment: the range's finishers as people, each once in a row, and what their
-- surveys' reports sold, so far. Gender here, 'device' in pick for Device / OS; age,
-- relationship and country swap the answer for the survey's own (15003, 15004, 15001).
with pick as (select 'gender'::text as dim),  -- or 'device'
-- Quotes a reminder job made (no browser, so the pricing code wrote "Desktop"): not the reader's.
cron_quote as (
  select q.id from report_price_quote q join survey_submission s on s.id = q.survey_submission_id
   where q.device_type = 'Desktop' and q.created_date_time > s.created_date_time + interval '1 hour'
     and q.paywall_reached_at is null and q.checkout_started_at is null
     and not exists (select 1 from report_price_quote o
                      where o.survey_submission_id = q.survey_submission_id and o.id <> q.id
                        and o.created_date_time between q.created_date_time - interval '5 minutes'
                                                    and q.created_date_time + interval '5 minutes')
), f as (
  select ${PERSON} as person,
         case when (select dim from pick) = 'device' then
                -- A tablet if a survey step said so (ranges from 17 Oct 2026), else the device of
                -- the reader's own latest price quote, else of the survey's last step.
                case when :from >= date '2026-10-17'
                          and exists (select 1 from survey_behavior_event t
                                       where t.session_id = s.session_id and t.is_tablet) then 'Tablet'
                     else coalesce((select q.device_type from report_price_quote q
                                     where q.survey_submission_id = s.id and q.device_type is not null
                                       and q.id not in (select id from cron_quote)
                                     order by q.created_date_time desc limit 1),
                                   (select e.device_type from survey_behavior_event e
                                     where e.session_id = s.session_id and e.device_type is not null
                                     order by e.created_at desc limit 1),
                                   'Not recorded') end
              else coalesce(own.answer, up.gender) end as answer,
         coalesce(pay.sales, 0) as sales, coalesce(pay.revenue, 0) as revenue,
         coalesce(pay.full_sales, 0) as full_sales, coalesce(pay.full_revenue, 0) as full_revenue,
         coalesce(pay.pre_sales, 0) as pre_sales, coalesce(pay.pre_revenue, 0) as pre_revenue
    from survey_submission s
    left join app_user au on au.id = s.user_id
    left join user_profile up on up.id = au.user_profile_id
    left join lateral (
      select max(ao.option_text) as answer
        from survey_submission_answer a
        join survey_question sq on sq.id = a.survey_question_id and sq.frontend_qid = '15010'
        join answer_option ao on ao.id = a.answer_option_id
       where a.survey_submission_id = s.id) own on true
    left join lateral (
      select count(*) as sales, sum(p.amount) as revenue,
             count(*) filter (where ${FULL_PLAN}) as full_sales,
             coalesce(sum(p.amount) filter (where ${FULL_PLAN}), 0) as full_revenue,
             count(*) filter (where ${PRE_PLAN}) as pre_sales,
             coalesce(sum(p.amount) filter (where ${PRE_PLAN}), 0) as pre_revenue
        from personal_report pr join payment p on p.personal_report_id = pr.id
       where pr.survey_submission_id = s.id and ${REAL_SALE}) pay on true
   where s.status = 'completed'
     and ${FINISH_DAY} between :from and :to
     and ${NOT_STAFF}
), g as (
  select case when answer is null then 'Not stated'
              when answer ~* '^non-?binary$' then 'Non-binary'
              when answer ~* 'rather not' then 'Rather not label'
              else answer end as segment, *
    from f
)
select segment,
       count(distinct person) as finishers,
       round(100.0 * sum(sales) / nullif(sum(sum(sales)) over (), 0), 0) as share_of_sales_pct,
       -- Blank for a range starting before 23 Oct 2026, the EUR 1.99 Core Archetype's first whole day on sale.
       case when :from >= date '2026-10-23'
            then round(100.0 * count(distinct person) filter (where pre_sales > 0)
                       / count(distinct person), 2) end as pre_cvr_pct,
       round(sum(pre_revenue) / nullif(sum(pre_sales), 0), 2) as pre_avg,
       round(100.0 * count(distinct person) filter (where full_sales > 0)
             / count(distinct person), 2) as full_cvr_pct,
       round(sum(full_revenue) / nullif(sum(full_sales), 0), 2) as full_avg,
       round(sum(revenue), 0) as revenue,
       round(sum(revenue) / count(distinct person), 2) as revenue_per_finisher
  from g
 group by 1
 order by 2 desc;`;

const PT_Q = `-- Pricing 3.0, from its start (8 Oct 2026, 15:23 UTC) to the range's end: the readers who
-- finished in it, each on the arm their FIRST price quote was dealt (before any re-sync moved
-- it), and what they did. For Pricing 2.0 or 2.1 put the stretch in b and the arms A and B
-- (2.0: 3 Aug 20:09:45 – 24 Aug 02:43:12 UTC; 2.1: on to 31 Aug 10:09:20 UTC); the page shows
-- their paywall views as — (a paywall seen is recorded from 6 Sep 2026). The AOV lift is B's
-- aov over A's, less 1; its confidence is Welch's t-test on each arm's sales (sale_variance).
with b as (
  select timestamptz '2026-10-08 15:23:00+00' as start, timestamptz 'infinity' as stop,
         (date :from)::timestamp at time zone 'Europe/Berlin' as range_start,
         ((date :to) + 1)::timestamp at time zone 'Europe/Berlin' as range_end
), w as (
  select greatest(start, range_start) as since, least(stop, range_end) as until, stop from b
), first_quote as (
  select q.survey_submission_id as sid, min(q.created_date_time) as quoted_at,
         (array_agg(coalesce(h.arm, q.experiment_group) order by q.created_date_time, q.id)
            filter (where coalesce(h.arm, q.experiment_group) is not null))[1] as arm
    from report_price_quote q
    left join lateral (select x.old_experiment_group as arm from report_price_quote_arm_history x
                        where x.quote_id = q.id order by x.changed_at, x.id limit 1) h on true
   group by 1
), cohort as (
  select s.id, f.arm,
         exists (select 1 from report_price_quote q where q.survey_submission_id = s.id
                   and (q.paywall_reached_at is not null or q.checkout_started_at is not null))
         or exists (select 1 from analytics_event a where a.survey_submission_id = s.id
                      and a.event_type = 'paywall_initiated'
                      and coalesce(a.metadata->>'source', '') <> 'offer_link')
         or exists (select 1 from personal_report pr join payment p on p.personal_report_id = pr.id
                     where pr.survey_submission_id = s.id and ${REAL_SALE}) as reached_paywall
    from survey_submission s join first_quote f on f.sid = s.id, w
   where s.status = 'completed' and s.created_date_time >= w.since and s.created_date_time < w.until
     and f.quoted_at < w.stop and f.arm in ('A3', 'B3')
     and ${NOT_STAFF}
     -- A survey bought before it was taken (pay to start): no arm's price sold it.
     and not exists (select 1 from prepaid_report_access pa
                      where pa.consumed_submission_id = s.id and pa.offer is not null
                        and pa.paid_at is not null and pa.status in ('succeeded', 'refunded'))
), pays as (
  select c.arm, p.status, p.amount, coalesce(p.payment_date_time, p.created_date_time) as created_date_time,
         case when p.status = 'canceled' then p.created_date_time - interval '24 hours'
              else p.created_date_time end as opened
    from cohort c
    join personal_report pr on pr.survey_submission_id = c.id
    join payment p on p.personal_report_id = pr.id
   where not coalesce(p.is_test, false) and p.amount > 0
), money as (
  select x.arm,
         count(*) filter (where (x.opened at time zone 'Europe/Berlin')::date between :from
                     and ((w.until - interval '1 millisecond') at time zone 'Europe/Berlin')::date) as checkouts,
         count(*) filter (where x.status = 'succeeded'
                            and x.created_date_time >= w.since and x.created_date_time < w.until) as paid_sales,
         coalesce(sum(x.amount) filter (where x.status = 'succeeded'
                            and x.created_date_time >= w.since and x.created_date_time < w.until), 0) as revenue,
         var_samp(x.amount) filter (where x.status = 'succeeded'
                            and x.created_date_time >= w.since and x.created_date_time < w.until) as sale_variance
    from pays x, w
   group by 1
)
select c.arm, count(*) as finishers, count(*) filter (where c.reached_paywall) as paywall_views,
       coalesce(max(m.checkouts), 0) as checkouts, coalesce(max(m.paid_sales), 0) as paid_sales,
       round(coalesce(max(m.revenue), 0), 2) as revenue,
       round(max(m.revenue) / nullif(max(m.paid_sales), 0), 2) as aov,
       round(100.0 * max(m.paid_sales) / nullif(max(m.checkouts), 0), 0) as checkout_to_paid_pct,
       round(coalesce(max(m.revenue), 0)
             / nullif(count(*) filter (where c.reached_paywall), 0), 2) as revenue_per_paywall_view,
       max(m.sale_variance) as sale_variance
  from cohort c left join money m on m.arm = c.arm
 group by c.arm
 order by c.arm;`;

const PT_BASE_Q = `-- The price lists (get_price_list_changes): each arm's starting price per plan, the latest
-- change before now. Pricing 2.0 and 2.1 read the lists in force in their stretches.
select distinct on (arm, plan) arm, plan, starting_price, changed_at
  from get_price_list_changes()
 where arm in ('A3', 'B3') and changed_at <= now()
 order by arm, plan, changed_at desc;`;

/** What every price quote recorded for one factor, and when it was last seen. */
const multQ = (
  what: string,
  key: string,
  mult: string
) => `-- What Pricing 3.0's price quotes recorded for the reader's ${what}: the factor it multiplies
-- the arm's base price by (with the per-visitor switch off it is recorded, not applied). Older
-- quotes carry earlier pricing's factors (May and June's discount steps), not the page's.
select ${key} as factor, ${mult} as multiplier, count(*) as quotes,
       max(created_date_time)::date as last_quote
  from report_price_quote
 where created_date_time >= timestamptz '2026-10-06 18:18:28+00'  -- Pricing 3.0's first deploy
 group by 1, 2
 order by 1, 2;`;

/** The months the elasticity model is fitted on, each month's people and full unlocks. */
const EL_WITH = `-- Every whole month from 1 May 2026 (paid checkout's start) up to the range's end, whatever
-- the range's start: each month's finishers as people (each once), the share who bought a full
-- unlock (so far) and the average price of their full unlocks.
with f as (
  select date_trunc('month', ${FINISH_DAY})::date as month, ${PERSON} as person,
         coalesce(pay.full_sales, 0) as full_sales, coalesce(pay.full_revenue, 0) as full_revenue
    from survey_submission s
    left join lateral (
      select count(*) as full_sales, sum(p.amount) as full_revenue
        from personal_report pr join payment p on p.personal_report_id = pr.id
       where pr.survey_submission_id = s.id and ${REAL_SALE} and ${FULL_PLAN}) pay on true
   where s.status = 'completed'
     and ${FINISH_DAY} between date '2026-05-01'
         and (date_trunc('month', (date :to) + 1) - interval '1 day')::date
     and ${NOT_STAFF}
     -- A survey bought before it was taken (pay to start): no report price sold it.
     and not exists (select 1 from prepaid_report_access pa
                      where pa.consumed_submission_id = s.id and pa.offer is not null
                        and pa.paid_at is not null and pa.status in ('succeeded', 'refunded'))
), m as (
  select month, count(distinct person) as finishers,
         count(distinct person) filter (where full_sales > 0) as full_unlock_people,
         sum(full_sales) as full_unlock_sales,
         round(sum(full_revenue) / nullif(sum(full_sales), 0), 2) as price,
         count(distinct person) filter (where full_sales > 0)::float8 / count(distinct person) as cvr
    from f
   group by 1
  having sum(full_sales) > 0
), fit as (
  -- ln(CVR) = a + e · ln(price), least squares; the model is capped at the best month.
  select count(*) as months, regr_slope(ln(cvr), ln(price::float8)) as e,
         regr_intercept(ln(cvr), ln(price::float8)) as a, max(cvr) as cap
    from m
)`;

/** The model's prediction at a price: CVR, and net revenue per finisher after Stripe's fee. */
const atPrice = (price: string, note: string) => `${EL_WITH}
-- ${note}
select round(100 * least(cap, exp(a) * power(${price}::float8, e))::numeric, 2) as predicted_cvr_pct,
       round((least(cap, exp(a) * power(${price}::float8, e)) * (${price} * 0.971 - 0.25))::numeric, 3)
         as net_per_finisher
  from fit;`;

// ---- the tables, as the Data sources catalog lists them

const PAYMENT: FieldTable = {
  source: "production",
  table: "payment",
  columns:
    "amount, status, is_test, metadata (plan, journey), payment_date_time, created_date_time",
  filters:
    "Period: the Berlin day it was paid (payment_date_time, else the row's created_date_time: a pay-to-start purchase's row is written when its survey claims it). Source, device, tier, new or returning: the buyer's survey and price quote.",
  watch:
    "A sale is status succeeded, not is_test, over €0. A full refund turns it to refunded; a part refund keeps succeeded with refund_amount.",
};
const COHORT_PAYMENT: FieldTable = {
  ...PAYMENT,
  filters:
    "None of its own: a finisher's sales on their report, whenever they came (so far). The filters narrow the finishers.",
};
const CHECKOUTS: FieldTable = {
  source: "production",
  table: "payment",
  columns:
    "status, amount, is_test, created_date_time, payment_method_type, failure_code, metadata.journey",
  filters:
    "Period: the day the payment page was reached (an unpaid one is written 24 hours later). Source, device, tier, new or returning: the reader's survey and price quote.",
  watch:
    "Every Stripe checkout over €0 for a report is a row: canceled (left unpaid), failed or succeeded. Pay to start's own purchase (metadata.journey pay_to_start) is written only once paid and claimed, never unpaid, so it is left out: the Pay to start page counts those checkouts.",
};
const SUBMISSION: FieldTable = {
  source: "production",
  table: "survey_submission",
  columns: "id, user_id, status, created_date_time, utm_tracker, posthog_session_id",
  filters:
    "Period: the day the survey was finished. Source: utm_tracker. New or returning: posthog_session_id, through PostHog.",
  watch: "status completed is a finished survey; user_id tells people apart.",
};
const REPORT: FieldTable = {
  source: "production",
  table: "personal_report",
  columns: "id, survey_submission_id",
  filters: "None of its own: it joins a payment to its survey.",
};
const QUOTE: FieldTable = {
  source: "production",
  table: "report_price_quote",
  columns: "device_type, country_tier, created_date_time",
  filters:
    "Device: device_type of the reader's own quotes (not a reminder job's), else the survey steps'. Tier: country_tier.",
};
const STAFF: FieldTable = {
  source: "production",
  table: "ap_team_user",
  columns: "id",
  filters:
    "None: it only leaves the team's own accounts out (an @loveiq.org address, or one that used the team's test code).",
};

const SALES_TABLES = [PAYMENT, REPORT, SUBMISSION, QUOTE, STAFF];
const COHORT_TABLES = [SUBMISSION, REPORT, COHORT_PAYMENT, QUOTE, STAFF];

// ---- what is said more than once

const LEFT_OUT =
  "The team's own surveys and payments (an @loveiq.org account, or one that used the team's test code), test payments and our probes are left out.";
const COHORT =
  "A cohort figure: the range's finishers and what they bought so far, so a recent range keeps rising as late buyers pay.";
const PERSON_RULE =
  "People are told apart by their account; a finished survey without one counts alone.";
const PRE_RULE =
  "The Initial plan is the €1.99 Core Archetype: on sale from the evening of 22 Oct 2026 on pay to start's €1.99 page (counted from 23 Oct, its first whole day; a rate over a range starting earlier is blank, never 0%), and from 27 Oct 2026 also on the report's own €1.99 gate. E07's €0 gift is no sale.";
const TYPES_RULE =
  "Each sale is in one row. Pay to start's are the purchases made on its pages (live from 22 Oct 2026), and what a pay-to-start reader later buys on their report has its own row; an upgrade after €1.99 is a full unlock bought on a report whose €1.99 Core Archetype was paid before it, in either funnel. The report's €1.99 gate has a row while it is switched on or sold. A row not on sale over the range is blank, never 0.";
const BY_PAYMENT_DAY =
  "Counted on the payment day, so a sale can come from someone who finished the survey before the range.";
const CHECKOUT_RULES =
  "Counted from 1 May 2026, when paid checkout went live (earlier ones were the team's tests). An unpaid checkout is written when Stripe closes it a day later, so the last day can still change. Free (€0) unlocks are left out, and so are pay to start's own checkouts before the survey (the Pay to start page counts those).";
const PRICE_TEST_RULES =
  "A test is one stretch of unchanged price lists; its readers are those who finished in it (within this range) and were first priced by it, each on the arm their first quote was dealt.";
const MODEL_RULES =
  "Low confidence: a handful of monthly points, and price moved together with traffic and the paywall. Conversion is capped at the best month observed. Fitted on every whole month from 1 May 2026, whatever the range's start, without surveys bought before they were taken (pay to start: no report price sold them); a filter the records can't follow back to May leaves it blank: a source, tablets or new-or-returning, and a country tier or device (a finisher's comes from their price quote, which every finisher has only from 15 May).";
const MULT_RULES =
  "The factors come from the pricing code; each price quote records the one it would apply. The per-visitor switch (system_flags) decides whether they change the price: the sentence above the cards says which.";

const pricingTest = (
  label: string,
  what: string,
  formula: FieldDef["formula"],
  extra: Partial<FieldDef> = {}
): FieldDef => ({
  label,
  what,
  stat: "Count",
  per: "per finished survey of the arm",
  formula,
  caveat: PRICE_TEST_RULES,
  tables: [SUBMISSION, QUOTE, REPORT, COHORT_PAYMENT, STAFF],
  query: { lang: "SQL", text: PT_Q },
  related: ["payment.pt-sales", "payment.pt-checkouts", "payment.pt-lift"],
  ...extra,
});

const multiplier = (label: string, what: string, key: string, mult: string): FieldDef => ({
  label,
  what: `The factor a reader's ${what} multiplies their arm's base price by in Pricing 3.0. These are the levers to target or test next.`,
  stat: "Multiplier",
  per: "per price quote",
  formula: { num: `Base price × ${what} factor × the other factors` },
  caveat: MULT_RULES,
  tables: [
    {
      source: "production",
      table: "report_price_quote",
      columns: `${key}, ${mult}, created_date_time`,
      filters:
        "Pricing 3.0's quotes (from 6 Oct 2026). No other filter: the factors are the pricing code's, the same under every filter.",
    },
  ],
  query: { lang: "SQL", text: multQ(what, key, mult) },
  related: ["payment.pt-base", "payment.mult-tier", "payment.mult-device"],
});

export const fields: FieldRegistry = {
  // ---- the tiles
  "payment.revenue": {
    label: "Revenue",
    what: "Money from real report sales in the range, by the day each was paid. It is what the business took in before Stripe's fees and refunds.",
    good: "up",
    stat: "Sum",
    per: "per payment, in euros (whole on the tile)",
    formula: { num: "Sum of real sales (succeeded, not a test, over €0)" },
    caveat: `${BY_PAYMENT_DAY} A sale refunded in full drops out; a part refund is not taken off. ${LEFT_OUT}`,
    tables: SALES_TABLES,
    query: { lang: "SQL", text: SALES_Q },
    related: ["payment.sales", "payment.aov", "payment.type-revenue"],
  },
  "payment.sales": {
    label: "Paid sales",
    what: "How many reports were bought in the range, by payment day. The line under it counts the free unlocks (€0) given on the same days.",
    good: "up",
    stat: "Count",
    per: "per payment",
    formula: { num: "Real sales (succeeded, not a test, over €0)" },
    caveat: `${BY_PAYMENT_DAY} An upgrade is a sale of its own, so one person can make two. ${LEFT_OUT}`,
    tables: SALES_TABLES,
    query: { lang: "SQL", text: SALES_Q },
    related: ["payment.revenue", "payment.full", "payment.type-sales"],
  },
  "payment.pre": {
    label: "Pre-unlocks",
    what: "Sales of the Initial plan (€1.99), which unlocks the Core Archetype before the full report.",
    good: "up",
    stat: "Count",
    per: "per payment",
    formula: { num: "Initial-plan sales" },
    caveat: `${PRE_RULE} ${BY_PAYMENT_DAY} ${LEFT_OUT}`,
    tables: SALES_TABLES,
    query: { lang: "SQL", text: PRE_Q },
    related: ["payment.pre-cvr", "payment.full"],
  },
  "payment.pre-cvr": {
    label: "Pre-unlock CVR",
    what: "The share of the range's survey submissions whose Core Archetype was pre-unlocked (the €1.99 Initial plan), so far.",
    good: "up",
    stat: "Share",
    per: "per survey submission",
    formula: {
      num: "Submissions pre-unlocked (€1.99 paid) so far",
      den: "Survey submissions",
      mult: "× 100",
    },
    caveat: `${PRE_RULE} It counts surveys, as the Full-unlock CVR does: someone who finished twice counts twice. ${COHORT}`,
    tables: [...SALES_TABLES],
    query: { lang: "SQL", text: PRE_CVR_Q },
    related: ["payment.pre", "payment.full-cvr"],
  },
  "payment.full": {
    label: "Full unlocks",
    what: "Sales that unlock a whole report: Full, Full All (every report) and Core (retired). Nearly all the money comes from these.",
    good: "up",
    stat: "Count",
    per: "per payment",
    formula: { num: "Sales of Full, Full All or Core" },
    caveat: `${BY_PAYMENT_DAY} ${LEFT_OUT}`,
    tables: SALES_TABLES,
    query: { lang: "SQL", text: SALES_Q },
    related: ["payment.full-cvr", "payment.sales", "payment.ot-full-sales"],
  },
  "payment.full-cvr": {
    label: "Full-unlock CVR",
    what: "The share of the range's survey submissions whose report was then bought in full (Full, Full All or Core), so far. It shows how well the free report sells the full one.",
    good: "up",
    stat: "Share",
    per: "per survey submission",
    formula: {
      num: "Submissions whose report got a full unlock (so far)",
      den: "Survey submissions in the range",
      mult: "× 100",
    },
    caveat: `${COHORT} It counts surveys, not people: someone who finished twice counts twice (the Payment CVR counts people). A sale in the range by someone who finished earlier is not in it. ${LEFT_OUT}`,
    tables: COHORT_TABLES,
    query: { lang: "SQL", text: FULL_CVR_Q },
    related: ["payment.pay-cvr", "payment.full", "payment.pre-cvr"],
  },
  "payment.aov": {
    label: "Avg. order value",
    what: "What a paid sale brings in on average in the range.",
    good: "up",
    stat: "Average",
    per: "per paid sale",
    formula: { num: "Revenue", den: "Paid sales" },
    caveat: `An average: with few sales one Full All sale moves it a lot. Free unlocks are not sales, so they don't pull it down. ${BY_PAYMENT_DAY}`,
    tables: SALES_TABLES,
    query: { lang: "SQL", text: SALES_Q },
    related: ["payment.revenue", "payment.sales", "payment.m-aov"],
  },
  "payment.pay-cvr": {
    label: "Payment CVR",
    what: "The share of people who finished the survey in the range and then paid for a report, so far. Each person counts once, however many surveys they finished.",
    good: "up",
    stat: "Share",
    per: "per person",
    formula: {
      num: "People who paid for any of their range's reports (so far)",
      den: "People who finished the survey in the range",
      mult: "× 100",
    },
    caveat: `${COHORT} ${PERSON_RULE} Free unlocks are not payments. ${LEFT_OUT}`,
    tables: COHORT_TABLES,
    query: { lang: "SQL", text: PAY_CVR_Q },
    related: ["payment.full-cvr", "payment.ot-cvr", "payment.seg-full-cvr"],
  },
  "payment.checkout": {
    label: "Checkout success",
    what: "Of the paid checkouts opened in the range (Stripe's payment page reached), the share that ended in a payment. Low means people reach the payment page and leave.",
    good: "up",
    stat: "Share",
    per: "per checkout",
    formula: {
      num: "Checkouts paid",
      den: "Checkouts opened (payment page reached)",
      mult: "× 100",
    },
    caveat: `${CHECKOUT_RULES} A paid checkout later refunded or disputed still counts as paid. Each point's "success" under the chart (a day, week or month, by the range's length) is the same, for that point.`,
    tables: [CHECKOUTS, REPORT, SUBMISSION, STAFF],
    query: { lang: "SQL", text: CHECKOUT_Q },
    related: ["payment.co-reached", "payment.co-attempted", "payment.co-paid"],
  },

  // ---- payment types
  "payment.type-sales": {
    label: "Sales",
    what: "Paid sales of each payment type in the range: the free survey's full unlock and €1.99 gate, pay to start's two offers and its readers' later purchases on the report, and the upgrade after €1.99.",
    good: "up",
    stat: "Count",
    per: "per payment",
    formula: { num: "Real sales of the type" },
    caveat: `The rows add up to the Paid sales tile. A sale refunded in full has left the sales. ${TYPES_RULE} ${BY_PAYMENT_DAY}`,
    tables: SALES_TABLES,
    query: { lang: "SQL", text: TYPES_Q },
    related: ["payment.sales", "payment.type-revenue", "payment.type-refund-rate"],
  },
  "payment.type-avg": {
    label: "Average price",
    what: "What a sale of the type brings in on average.",
    stat: "Average",
    per: "per paid sale",
    formula: { num: "Revenue of the type", den: "Sales of the type" },
    caveat: `With few sales one large sale moves it a lot. ${TYPES_RULE}`,
    tables: SALES_TABLES,
    query: { lang: "SQL", text: TYPES_Q },
    related: ["payment.aov", "payment.type-revenue"],
  },
  "payment.type-revenue": {
    label: "Revenue",
    what: "Money from the type's sales in the range, to the cent.",
    good: "up",
    stat: "Sum",
    per: "per payment, in euros",
    formula: { num: "Sum of the type's real sales" },
    caveat: `The live rows add up to the Revenue tile. A part refund is not taken off. ${TYPES_RULE}`,
    tables: SALES_TABLES,
    query: { lang: "SQL", text: TYPES_Q },
    related: ["payment.revenue", "payment.type-share"],
  },
  "payment.type-share": {
    label: "Share of revenue",
    what: "The type's part of all the range's revenue.",
    stat: "Share",
    per: "per euro of revenue",
    formula: { num: "Revenue of the type", den: "Revenue of every live type", mult: "× 100" },
    caveat: TYPES_RULE,
    tables: SALES_TABLES,
    query: { lang: "SQL", text: TYPES_Q },
    related: ["payment.type-revenue", "payment.revenue"],
  },
  "payment.type-refunds": {
    label: "Refunds",
    what: "The range's sales of the type that were refunded, in full or in part, whenever the refund came.",
    good: "down",
    stat: "Count",
    per: "per payment",
    formula: { num: "Sales refunded in full or in part" },
    caveat:
      "From the payment records: a full refund turns the payment to refunded (it leaves the sales), a part refund keeps it with the amount refunded. Refunds carry no source, device, tier or visitor, so a filter leaves them blank; so does a range they weren't read for. None so far.",
    tables: [
      {
        ...PAYMENT,
        columns: "status, refund_amount, amount, metadata (plan), created_date_time",
        filters:
          "Period: the sale's payment day (the refund can come later). Funnel: a refund on a pay-to-start survey is left out under Free survey. A source, device, tier or visitor filter leaves it blank.",
      },
      REPORT,
      SUBMISSION,
      STAFF,
    ],
    query: { lang: "SQL", text: TYPES_Q },
    related: ["payment.type-refund-rate", "payment.type-sales"],
  },
  "payment.type-refund-rate": {
    label: "Refund rate",
    what: "Of the type's sales made in the range, the share refunded since.",
    good: "down",
    stat: "Share",
    per: "per payment",
    formula: {
      num: "Sales refunded (in full or in part)",
      den: "Sales made (still standing, and those refunded in full)",
      mult: "× 100",
    },
    caveat:
      "A sale refunded in full has left the Sales column, so it is counted back into the base here. Blank under a source, device, tier or visitor filter (refunds carry none).",
    tables: [
      {
        ...PAYMENT,
        columns: "status, refund_amount, amount, metadata (plan), created_date_time",
        filters:
          "Period: the sale's payment day. Funnel: a refund on a pay-to-start survey is left out under Free survey. A source, device, tier or visitor filter leaves it blank.",
      },
      REPORT,
      SUBMISSION,
      STAFF,
    ],
    query: { lang: "SQL", text: TYPES_Q },
    related: ["payment.type-refunds", "payment.type-sales"],
  },

  // ---- over time
  "payment.over-time": {
    label: "Pre-unlock and full-unlock payments over time",
    what: "Paid sales per week or month by unlock type (the bars), against the survey submissions of the same days (the dotted line). It shows whether sales follow the survey traffic.",
    stat: "Count",
    per: "per payment (bars) and per finished survey (line)",
    formula: { num: "Paid sales by unlock type, and survey submissions, per period" },
    caveat:
      "Weeks for ranges up to about four months, months beyond, days under two weeks; from 1 May 2026, when paid checkout began. Sales count on the payment day and submissions on the survey day, so a bar's buyers can be earlier finishers. The line counts surveys: someone who finished twice counts twice (the table's Finishers count people).",
    tables: [PAYMENT, SUBMISSION, REPORT, STAFF],
    query: { lang: "SQL", text: OT_CHART_Q },
    related: ["payment.ot-full-sales", "payment.ot-finishers", "payment.ot-revenue"],
  },
  "payment.ot-pre-sales": {
    label: "Pre-unlock sales",
    what: "Initial-plan (€1.99 Core Archetype) sales in each period, by payment day.",
    good: "up",
    stat: "Count",
    per: "per payment",
    formula: { num: "Initial-plan sales in the period" },
    caveat: PRE_RULE,
    tables: SALES_TABLES,
    query: { lang: "SQL", text: OT_TABLE_Q },
    related: ["payment.pre", "payment.ot-full-sales"],
  },
  "payment.ot-pre-avg": {
    label: "Pre-unlock avg.",
    what: "What an Initial-plan sale brought in on average in each period: €1.99, unless a code took some off.",
    stat: "Average",
    per: "per Initial-plan sale",
    formula: { num: "Initial-plan revenue in the period", den: "Initial-plan sales in the period" },
    caveat: PRE_RULE,
    tables: SALES_TABLES,
    query: { lang: "SQL", text: OT_TABLE_Q },
    related: ["payment.ot-pre-sales", "payment.ot-full-avg"],
  },
  "payment.ot-full-sales": {
    label: "Full-unlock sales",
    what: "Full, Full All and Core sales in each period, by payment day.",
    good: "up",
    stat: "Count",
    per: "per payment",
    formula: { num: "Full-unlock sales in the period" },
    caveat: `${BY_PAYMENT_DAY} The periods add up to the Full unlocks tile from 1 May 2026.`,
    tables: SALES_TABLES,
    query: { lang: "SQL", text: OT_TABLE_Q },
    related: ["payment.full", "payment.ot-full-avg"],
  },
  "payment.ot-full-avg": {
    label: "Full-unlock avg.",
    what: "What a full unlock brought in on average in each period: the price people actually paid.",
    stat: "Average",
    per: "per full-unlock sale",
    formula: { num: "Full-unlock revenue in the period", den: "Full-unlock sales in the period" },
    caveat:
      "An average of a handful of sales in most periods; prices changed with the pricing tests.",
    tables: SALES_TABLES,
    query: { lang: "SQL", text: OT_TABLE_Q },
    related: ["payment.ot-full-sales", "payment.pt-base"],
  },
  "payment.ot-revenue": {
    label: "Revenue",
    what: "Money from every paid sale in each period, by payment day, to the cent.",
    good: "up",
    stat: "Sum",
    per: "per payment, in euros",
    formula: { num: "Sum of real sales in the period" },
    caveat: `A retired plan's sales count here too. ${BY_PAYMENT_DAY}`,
    tables: SALES_TABLES,
    query: { lang: "SQL", text: OT_TABLE_Q },
    related: ["payment.revenue", "payment.ot-full-sales"],
  },
  "payment.ot-finishers": {
    label: "Finishers",
    what: "The people who finished the survey in each period, each counted once however many surveys they finished.",
    stat: "Count",
    per: "per person",
    formula: { num: "People who finished the survey in the period" },
    caveat: `${PERSON_RULE} Someone who finished in two periods counts in each, so the periods can add up to a little more than the Payment CVR tile's finishers. The chart's dotted line counts surveys instead.`,
    tables: [SUBMISSION, STAFF],
    query: { lang: "SQL", text: OT_TABLE_Q },
    related: ["payment.ot-cvr", "payment.pay-cvr", "payment.over-time"],
  },
  "payment.ot-cvr": {
    label: "Payment CVR",
    what: "Of each period's finishers (people), the share who paid for a report, so far.",
    good: "up",
    stat: "Share",
    per: "per person",
    formula: {
      num: "People who finished in the period and paid (so far)",
      den: "People who finished in the period",
      mult: "× 100",
    },
    caveat: `${COHORT} Recent periods read low until their late buyers pay. ${PERSON_RULE}`,
    tables: COHORT_TABLES,
    query: { lang: "SQL", text: OT_TABLE_Q },
    related: ["payment.pay-cvr", "payment.ot-finishers"],
  },

  // ---- checkout and payment methods
  "payment.co-reached": {
    label: "a) Reached payment page",
    what: "Paid checkouts opened in the range: a reader went on to Stripe's payment page for a report.",
    stat: "Count",
    per: "per checkout",
    formula: { num: "Checkouts opened (a Stripe payment page reached)" },
    caveat: CHECKOUT_RULES,
    tables: [CHECKOUTS, REPORT, SUBMISSION, STAFF],
    query: { lang: "SQL", text: CHECKOUT_Q },
    related: ["payment.co-attempted", "payment.co-paid", "payment.checkout"],
  },
  "payment.co-attempted": {
    label: "b) Filled in and attempted",
    what: "Of those checkouts, the ones where a payment was tried: paid, or a card or a failure recorded. The rate beside it is the share of a).",
    good: "up",
    stat: "Count (and a share of a)",
    per: "per checkout",
    formula: {
      num: "Checkouts where a payment was tried",
      den: "Checkouts opened (for the rate)",
      mult: "× 100",
    },
    caveat: `A checkout left without a card typed in counts in a) only. ${CHECKOUT_RULES}`,
    tables: [CHECKOUTS, REPORT, SUBMISSION, STAFF],
    query: { lang: "SQL", text: CHECKOUT_Q },
    related: ["payment.co-reached", "payment.co-paid"],
  },
  "payment.co-paid": {
    label: "c) Payment succeeded",
    what: "Of those checkouts, the ones that ended in a payment. The rate beside it is the share of b).",
    good: "up",
    stat: "Count (and a share of b)",
    per: "per checkout",
    formula: {
      num: "Checkouts paid",
      den: "Checkouts where a payment was tried (for the rate)",
      mult: "× 100",
    },
    caveat: `A paid checkout later refunded or disputed still counts. ${CHECKOUT_RULES}`,
    tables: [CHECKOUTS, REPORT, SUBMISSION, STAFF],
    query: { lang: "SQL", text: CHECKOUT_Q },
    related: ["payment.checkout", "payment.co-attempted"],
  },
  "payment.methods": {
    label: "Payment methods",
    what: "The range's paid sales by how people paid: Stripe Link (saved details) or the card's brand. The bar shows each method's share.",
    stat: "Count",
    per: "per payment",
    formula: { num: "Real sales by payment method" },
    caveat: `As Stripe reported the method on the payment. ${BY_PAYMENT_DAY}`,
    tables: [
      {
        ...PAYMENT,
        columns: "payment_method_type, card_brand, amount, status, is_test, created_date_time",
      },
      REPORT,
      SUBMISSION,
      STAFF,
    ],
    query: { lang: "SQL", text: METHODS_Q },
    related: ["payment.m-sales", "payment.m-share", "payment.sales"],
  },
  "payment.m-sales": {
    label: "Sales",
    what: "Paid sales made with the method in the range.",
    stat: "Count",
    per: "per payment",
    formula: { num: "Real sales paid with the method" },
    caveat: "The rows add up to the Paid sales tile.",
    tables: [
      {
        ...PAYMENT,
        columns: "payment_method_type, card_brand, amount, status, is_test, created_date_time",
      },
      REPORT,
      SUBMISSION,
      STAFF,
    ],
    query: { lang: "SQL", text: METHODS_Q },
    related: ["payment.m-share", "payment.methods"],
  },
  "payment.m-share": {
    label: "Share",
    what: "The method's part of the range's paid sales.",
    stat: "Share",
    per: "per payment",
    formula: { num: "Sales with the method", den: "All paid sales", mult: "× 100" },
    caveat: "A share of sales, not of revenue.",
    tables: [
      {
        ...PAYMENT,
        columns: "payment_method_type, card_brand, amount, status, is_test, created_date_time",
      },
      REPORT,
      SUBMISSION,
      STAFF,
    ],
    query: { lang: "SQL", text: METHODS_Q },
    related: ["payment.m-sales", "payment.m-revenue"],
  },
  "payment.m-revenue": {
    label: "Revenue",
    what: "Money from the method's sales in the range, in whole euros.",
    stat: "Sum",
    per: "per payment, in euros",
    formula: { num: "Sum of the method's real sales" },
    caveat: "Rounded to whole euros, as drawn; the rows add up to the Revenue tile.",
    tables: [
      {
        ...PAYMENT,
        columns: "payment_method_type, card_brand, amount, status, is_test, created_date_time",
      },
      REPORT,
      SUBMISSION,
      STAFF,
    ],
    query: { lang: "SQL", text: METHODS_Q },
    related: ["payment.m-aov", "payment.revenue"],
  },
  "payment.m-aov": {
    label: "AOV",
    what: "What a sale with the method brought in on average.",
    stat: "Average",
    per: "per paid sale",
    formula: { num: "Revenue of the method", den: "Sales with the method" },
    caveat: "A handful of sales per card brand: one Full All sale moves it a lot.",
    tables: [
      {
        ...PAYMENT,
        columns: "payment_method_type, card_brand, amount, status, is_test, created_date_time",
      },
      REPORT,
      SUBMISSION,
      STAFF,
    ],
    query: { lang: "SQL", text: METHODS_Q },
    related: ["payment.aov", "payment.m-revenue"],
  },

  // ---- who pays
  "payment.seg-finishers": {
    label: "Finishers",
    what: "The people in the segment who finished the survey in the range, each counted once.",
    stat: "Count",
    per: "per person",
    formula: { num: "People who finished the survey in the range, in the segment" },
    caveat: `${PERSON_RULE} Someone whose answer differed between two surveys counts under each. Relationships and countries with fewer than 15 finishers are left out of the page (the CSV keeps them).`,
    tables: [SUBMISSION, QUOTE, STAFF],
    query: { lang: "SQL", text: SEG_Q },
    related: ["payment.seg-full-cvr", "payment.seg-rev-per", "payment.pay-cvr"],
  },
  "payment.seg-share": {
    label: "Share of sales",
    what: "The segment's part of the paid sales its range's finishers made, so far.",
    stat: "Share",
    per: "per payment",
    formula: { num: "The segment's finishers' paid sales", den: "Every segment's", mult: "× 100" },
    caveat: `${COHORT} The shares are of every row, so with small groups left out the rows shown add up to less than 100%.`,
    tables: COHORT_TABLES,
    query: { lang: "SQL", text: SEG_Q },
    related: ["payment.seg-revenue", "payment.seg-finishers"],
  },
  "payment.seg-pre-cvr": {
    label: "Pre CVR",
    what: "The share of the segment's finishers (people) who pre-unlocked their Core Archetype (the €1.99 Initial plan), so far.",
    good: "up",
    stat: "Share",
    per: "per person",
    formula: {
      num: "People who bought the Initial plan",
      den: "People who finished",
      mult: "× 100",
    },
    caveat: `${PRE_RULE} ${COHORT}`,
    tables: COHORT_TABLES,
    query: { lang: "SQL", text: SEG_Q },
    related: ["payment.seg-full-cvr", "payment.pre-cvr"],
  },
  "payment.seg-pre-avg": {
    label: "Pre avg. €",
    what: "What the segment's Initial-plan sales brought in on average: €1.99, unless a code took some off.",
    stat: "Average",
    per: "per Initial-plan sale",
    formula: { num: "Initial-plan revenue", den: "Initial-plan sales" },
    caveat: PRE_RULE,
    tables: COHORT_TABLES,
    query: { lang: "SQL", text: SEG_Q },
    related: ["payment.seg-full-avg", "payment.seg-pre-cvr"],
  },
  "payment.seg-full-cvr": {
    label: "Full CVR",
    what: "The share of the segment's finishers (people) who bought a full unlock, so far. Compare segments to see who to target or price differently.",
    good: "up",
    stat: "Share",
    per: "per person",
    formula: {
      num: "People in the segment who bought a full unlock (so far)",
      den: "People in the segment who finished",
      mult: "× 100",
    },
    caveat: `${COHORT} ${PERSON_RULE} Small segments swing with one sale.`,
    tables: COHORT_TABLES,
    query: { lang: "SQL", text: SEG_Q },
    related: ["payment.seg-finishers", "payment.seg-full-avg", "payment.pay-cvr"],
  },
  "payment.seg-full-avg": {
    label: "Full avg. €",
    what: "What the segment's full unlocks brought in on average: the price its buyers paid.",
    stat: "Average",
    per: "per full-unlock sale",
    formula: { num: "The segment's full-unlock revenue", den: "Its full-unlock sales" },
    caveat: "A buyer's other sales (an Essentials before the upgrade) are left out of it.",
    tables: COHORT_TABLES,
    query: { lang: "SQL", text: SEG_Q },
    related: ["payment.seg-full-cvr", "payment.ot-full-avg"],
  },
  "payment.seg-revenue": {
    label: "Revenue",
    what: "Money from the paid sales the segment's range finishers made, so far, in whole euros.",
    good: "up",
    stat: "Sum",
    per: "per payment, in euros",
    formula: { num: "Sum of the segment's finishers' real sales (so far)" },
    caveat: `${COHORT} Not the Revenue tile: that counts the range's payments, whoever made them.`,
    tables: COHORT_TABLES,
    query: { lang: "SQL", text: SEG_Q },
    related: ["payment.seg-rev-per", "payment.seg-share"],
  },
  "payment.seg-rev-per": {
    label: "Rev. / finisher",
    what: "What each person who finished in the segment has brought in so far, on average: conversion and price in one number.",
    good: "up",
    stat: "Average",
    per: "per person",
    formula: { num: "The segment's revenue (so far)", den: "People in the segment who finished" },
    caveat: `${COHORT} ${PERSON_RULE}`,
    tables: COHORT_TABLES,
    query: { lang: "SQL", text: SEG_Q },
    related: ["payment.seg-revenue", "payment.seg-finishers"],
  },

  // ---- pricing tests
  "payment.pt-arm": pricingTest(
    "Arm",
    "The price arm, and how many readers finished the survey in the test's stretch and were priced by it on that arm.",
    { num: "Finished surveys in the stretch on the arm" },
    { related: ["payment.pt-views", "payment.pt-base"] }
  ),
  "payment.pt-base": {
    label: "Base price",
    what: "The arm's list prices in the test's stretch: the full report, then what the other plans cost.",
    stat: "Price",
    per: "per report, before any personal factor",
    formula: { num: "The arm's starting price per plan (the price list)" },
    caveat:
      "List prices. With the per-visitor switch off everyone pays them; on, each price is multiplied by the factors below.",
    tables: [
      {
        source: "production",
        table: "report_price_quote_arm_history",
        columns: "changed_at, new_experiment_group, plan, new_starting_price",
        filters: "None: the lists are the same under every filter.",
        watch:
          "get_price_list_changes() holds Pricing 2.0 and 2.1's lists itself; later lists are the re-syncs recorded here.",
      },
    ],
    query: { lang: "SQL", text: PT_BASE_Q },
    related: ["payment.pt-aov", "payment.mult-tier"],
  },
  "payment.pt-views": pricingTest(
    "Paywall views",
    "Of the arm's readers, those who reached the paywall: it was seen, clicked, or they went on to a checkout or a payment.",
    { num: "The arm's readers who reached the paywall (so far)" },
    {
      caveat: `${PRICE_TEST_RULES} The report records a paywall seen from 6 Sep 2026: earlier stretches show —.`,
      related: ["payment.pt-checkouts", "payment.pt-rev-view"],
    }
  ),
  "payment.pt-checkouts": pricingTest(
    "Checkouts",
    "Paid checkouts the arm's readers opened within the stretch.",
    { num: "Checkouts opened by the arm's readers" },
    { per: "per checkout", related: ["payment.pt-co-paid", "payment.pt-sales"] }
  ),
  "payment.pt-sales": pricingTest(
    "Paid sales",
    "Paid sales the arm's readers made within the stretch.",
    { num: "The arm's readers' real sales in the stretch" },
    { per: "per payment", good: "up", related: ["payment.pt-revenue", "payment.pt-co-paid"] }
  ),
  "payment.pt-revenue": pricingTest(
    "Revenue",
    "Money from the arm's readers' sales within the stretch, in whole euros.",
    { num: "Sum of the arm's readers' real sales in the stretch" },
    {
      stat: "Sum",
      per: "per payment, in euros",
      good: "up",
      related: ["payment.pt-aov", "payment.pt-rev-view"],
    }
  ),
  "payment.pt-aov": pricingTest(
    "AOV",
    "What the arm's sales brought in on average.",
    { num: "The arm's revenue", den: "The arm's paid sales" },
    { stat: "Average", per: "per paid sale", related: ["payment.pt-lift", "payment.pt-revenue"] }
  ),
  "payment.pt-co-paid": pricingTest(
    "Checkout → paid",
    "Of the arm's checkouts, how many turned into a paid sale.",
    { num: "The arm's paid sales", den: "The arm's checkouts", mult: "× 100" },
    {
      stat: "Share",
      per: "per checkout",
      good: "up",
      related: ["payment.pt-checkouts", "payment.checkout"],
    }
  ),
  "payment.pt-rev-view": pricingTest(
    "Rev. / paywall view",
    "What each reader who reached the paywall brought in on average: the fairest way to compare arms that price differently.",
    { num: "The arm's revenue", den: "The arm's paywall views" },
    {
      stat: "Average",
      per: "per reader who reached the paywall",
      good: "up",
      caveat: `${PRICE_TEST_RULES} Blank where paywall views aren't recorded (before 6 Sep 2026).`,
      related: ["payment.pt-views", "payment.pt-revenue"],
    }
  ),
  "payment.pt-lift": pricingTest(
    "AOV lift · confidence",
    "How much larger the second arm's average sale is than the control's, and how sure that is.",
    { num: "The arm's AOV", den: "The control's AOV", mult: "− 1, × 100" },
    {
      stat: "Ratio (and a confidence)",
      per: "per paid sale",
      caveat: `${PRICE_TEST_RULES} The confidence is Welch's t-test, two-sided, on each sale's amount (the query gives each arm's sales, mean and variance; the page turns them into 1 − p). Below 95% it says "not significant yet"; under two sales an arm can't be compared.`,
      related: ["payment.pt-aov", "payment.pt-sales"],
    }
  ),

  // ---- the personal price multipliers
  "payment.mult-tier": multiplier(
    "Country tier",
    "country tier",
    "country_tier",
    "country_multiplier"
  ),
  "payment.mult-device": multiplier("Device", "device", "device_type", "device_multiplier"),
  "payment.mult-source": multiplier(
    "Traffic source",
    "traffic source",
    "traffic_source",
    "traffic_multiplier"
  ),
  "payment.mult-behaviour": multiplier(
    "Behaviour bucket",
    "behaviour bucket",
    "behavioral_bucket",
    "behavioral_multiplier"
  ),
  "payment.mult-engagement": multiplier(
    "Engagement score",
    "engagement score",
    "case when engagement_score >= 40 then '40 or more' else 'under 40' end",
    "engagement_multiplier"
  ),
  "payment.mult-discount": multiplier(
    "Discount step",
    "discount step",
    "discount_step",
    "discount_multiplier"
  ),

  // ---- price elasticity
  "payment.elasticity": {
    label: "Price elasticity prediction",
    what: "Each whole month's average full-unlock price against its payment conversion (the dots), and the model fitted through them: predicted conversion and net revenue per finisher at any price.",
    stat: "Share and average",
    per: "per person (conversion) and per full-unlock sale (price)",
    formula: {
      num: "People who bought a full unlock (so far)",
      den: "People who finished in the month",
      mult: "× 100, against the month's average full-unlock price",
    },
    caveat: `${MODEL_RULES} ${PERSON_RULE}`,
    tables: [SUBMISSION, REPORT, COHORT_PAYMENT, STAFF],
    query: {
      lang: "SQL",
      text: `${EL_WITH}
select month, finishers, full_unlock_people, round(100 * cvr::numeric, 2) as payment_cvr_pct,
       full_unlock_sales, price as average_price
  from m
 order by month;`,
    },
    related: ["payment.el-e", "payment.el-best", "payment.ot-full-avg"],
  },
  "payment.el-e": {
    label: "Price elasticity",
    what: "How strongly conversion falls as the price rises: −1.6 means a 10% higher price cuts paying people by about 16%.",
    stat: "Ratio (the model's slope)",
    per: "per month observed",
    formula: { num: "Slope of ln(payment CVR) on ln(average full-unlock price)" },
    caveat: MODEL_RULES,
    tables: [SUBMISSION, REPORT, COHORT_PAYMENT, STAFF],
    query: {
      lang: "SQL",
      text: `${EL_WITH}
select months, round(e::numeric, 2) as elasticity, round(a::numeric, 4) as a,
       round(100 * cap::numeric, 2) as cap_pct
  from fit;`,
    },
    related: ["payment.elasticity", "payment.el-best"],
  },
  "payment.el-best": {
    label: "Best price (net revenue)",
    what: "The price, between €3 and €40, where the model's net revenue per finisher peaks: a candidate for the next price test, not a promise.",
    good: "up",
    stat: "Price (the model's best)",
    per: "per finisher (net revenue)",
    formula: { num: "The price that maximises predicted CVR × (price × 0.971 − €0.25)" },
    caveat: `${MODEL_RULES} Net revenue takes off Stripe's 2.9% + €0.25.`,
    tables: [SUBMISSION, REPORT, COHORT_PAYMENT, STAFF],
    query: {
      lang: "SQL",
      text: `${EL_WITH}, grid as (
  select (g / 100.0)::float8 as price from generate_series(300, 4000, 25) g
)
select price as best_price,
       round((least(cap, exp(a) * power(price, e)) * (price * 0.971 - 0.25))::numeric, 3)
         as net_per_finisher
  from grid, fit
 order by 2 desc, 1
 limit 1;`,
    },
    related: ["payment.el-e", "payment.el-at", "payment.el-today"],
  },
  "payment.el-at": {
    label: "At the price tested",
    what: "The model's predicted payment conversion, and net revenue per finisher, at the price on the slider (€15 to start).",
    stat: "Share (predicted)",
    per: "per person",
    formula: { num: "min(best month's CVR, e^a × price^e)", mult: "× 100" },
    caveat: MODEL_RULES,
    tables: [SUBMISSION, REPORT, COHORT_PAYMENT, STAFF],
    query: {
      lang: "SQL",
      text: atPrice("15", "15: the slider's price to start; put the price tested."),
    },
    related: ["payment.el-best", "payment.el-today"],
  },
  "payment.el-today": {
    label: "At today’s price (A3)",
    what: "The model's predicted payment conversion and net revenue per finisher at today's full-report price on the control arm, and how far that is below the best price.",
    stat: "Share (predicted)",
    per: "per person",
    formula: { num: "min(best month's CVR, e^a × price^e)", mult: "× 100" },
    caveat: `${MODEL_RULES} Today's price is A3's full report (€29.99), from the price list.`,
    tables: [SUBMISSION, REPORT, COHORT_PAYMENT, STAFF],
    query: {
      lang: "SQL",
      text: atPrice("29.99", "29.99: A3's full report on today's price list."),
    },
    related: ["payment.el-best", "payment.el-at", "payment.pt-base"],
  },
};
