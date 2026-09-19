-- brain_daily_rollup read revenue and paid-customer counts off `personal_report`.
-- That table is not a ledger. `updatePersonalReportPayment()` PATCHes `price` and
-- `payment_status` on every checkout attempt with no guard against overwriting an
-- already-succeeded state, so both columns are LAST-WRITE-WINS. `payment` is the
-- ledger; it has a row per attempt and is never rewritten.
--
-- Three separate defects came out of reading the wrong table, and they pull in
-- OPPOSITE directions, so the error is not a bias anyone could mentally correct
-- for. Measured against live production, old vs new:
--
--     month     old rev / paid      true rev / paid
--     2026-04    46.98 /  2          0.00 /  0        all pre-launch sandbox
--     2026-05   483.08 / 36        179.85 / 13        169% overstated
--     2026-06   133.92 / 11        192.14 / 10         30% understated
--     2026-07    54.97 /  4        106.94 /  7         49% understated
--     2026-08   167.98 /  7        196.98 /  7         15% understated
--     all time  886.93 / 60        675.91 / 37
--
-- 1. A LATER FAILED ATTEMPT ERASES AN EARLIER SUCCESS. Report 1481 paid EUR 29 on
--    4 Aug; a CANCELED EUR 49 attempt the next day overwrote both columns, so the
--    brain lost the customer and the money. Five reports carry a payment the report
--    row denies (EUR 105.46), and five more agree they were paid while disagreeing
--    about the amount (EUR 294.46 recorded against EUR 442.36 actually taken).
--
-- 2. EUR 0 COMPED REPORTS COUNT AS PAYING CUSTOMERS. 22 reports are
--    `payment_status='succeeded'` with `price` 0 and no charge behind them — the
--    post-call 100% coupon and `unlock_all_archetypes`. They added nothing to
--    revenue and 22 to the customer count, which is why every derived conversion
--    rate and CAC was wrong while every total stayed self-consistent.
--
-- 3. SANDBOX MONEY WAS COUNTED AS REVENUE. `payment.is_test` arrived in
--    20260828173546_payment_is_test_flag, three days AFTER this function was
--    written, and nothing came back to apply it. Twelve succeeded test rows hold
--    EUR 464.38 -- 41% of all recorded receipts -- including one report charged five
--    times in a day as somebody clicked through every tier. That is the whole of
--    April and most of May. NOTE FOR ANYONE REVISITING: the audit that found this
--    recommended "use the payment ledger" and stopped there; doing exactly that
--    replaces a 15% August understatement with a 69% all-time overstatement. The
--    ledger is right, but only once the test rows are out of it.
--
-- Four decisions worth stating, because each is a place the next reader could
-- reasonably assume something else:
--
-- * ATTRIBUTED TO THE PAYMENT DAY, not the report's creation day. Seven of forty
--   real payments landed on a different calendar day from the report they belong
--   to, one of them 34 days later. "What did we earn on the 12th" means money that
--   arrived on the 12th.
-- * NET OF PARTIAL REFUNDS. `fulfillment.ts` records a partial refund by leaving
--   `status='succeeded'` and setting `refund_amount`, and a full refund by moving
--   `status` to `refunded`. So subtracting `refund_amount` covers the partial case
--   and the status filter covers the full one. Zero refunds exist today; this is
--   the guard for the first one, not a correction.
-- * `reports_paid` COUNTS EACH REPORT'S FIRST SUCCESSFUL PAYMENT, so it stays
--   additive when the ingester sums days into weeks and months -- the same reason
--   `opens` counts first opens, and the same trap: two of the 37 customers upgraded
--   later, and counting payments would report them twice as new customers while
--   revenue correctly counts both charges. The window runs over ALL history and the
--   date filter is applied afterwards, so a repeat purchase inside the window is
--   never mistaken for a new customer just because the first one fell outside it.
-- * `coalesce(personal_report_id, -id)` PARTITIONS ORPHANS INDIVIDUALLY. A bare
--   NULL partition would collapse every payment with no report into one "customer".
--   There are none today; `payment_personal_report_fk_set_null` means there can be.

CREATE OR REPLACE FUNCTION public.brain_daily_rollup(days integer DEFAULT 120)
 RETURNS TABLE(day date, unique_visitors bigint, survey_starts bigint, intro_completed bigint, submissions bigint, reports_created bigint, reports_paid bigint, revenue numeric, report_opens bigint, invites_sent bigint, top_sources jsonb)
 LANGUAGE sql
 STABLE
AS $function$
  WITH bounds AS (
    SELECT (current_date - (least(greatest(days, 1), 4000) - 1)) AS from_day
  ),
  d AS (
    SELECT generate_series((SELECT from_day FROM bounds), current_date, INTERVAL '1 day')::DATE AS day
  ),
  fe AS (
    SELECT f.day,
           count(*) FILTER (WHERE f.event_type = 'unique_visitor')      AS unique_visitors,
           count(*) FILTER (WHERE f.event_type = 'survey_engine_mount') AS survey_starts,
           count(*) FILTER (WHERE f.event_type = 'intro_slide_4')       AS intro_completed
      FROM public.funnel_event f
     WHERE f.day >= (SELECT from_day FROM bounds)
     GROUP BY f.day
  ),
  src AS (
    SELECT t.day, jsonb_object_agg(t.s, t.n) AS top_sources
      FROM (
        SELECT f.day,
               coalesce(f.utm_source, 'direct') AS s,
               count(*) AS n,
               row_number() OVER (PARTITION BY f.day ORDER BY count(*) DESC) AS rn
          FROM public.funnel_event f
         WHERE f.event_type = 'unique_visitor'
           AND f.day >= (SELECT from_day FROM bounds)
         GROUP BY f.day, coalesce(f.utm_source, 'direct')
      ) t
     WHERE t.rn <= 6
     GROUP BY t.day
  ),
  sub AS (
    SELECT s.created_date_time::DATE AS day, count(*) AS submissions
      FROM public.survey_submission s
     WHERE s.created_date_time >= (SELECT from_day FROM bounds)
     GROUP BY 1
  ),
  rep AS (
    SELECT r.created_date_time::DATE AS day, count(*) AS reports_created
      FROM public.personal_report r
     WHERE r.created_date_time >= (SELECT from_day FROM bounds)
     GROUP BY 1
  ),
  pay AS (
    SELECT coalesce(p.payment_date_time, p.created_date_time) AS paid_at,
           p.amount - coalesce(p.refund_amount, 0)            AS net,
           row_number() OVER (
             PARTITION BY coalesce(p.personal_report_id, -p.id)
             ORDER BY coalesce(p.payment_date_time, p.created_date_time), p.id
           ) AS purchase_seq
      FROM public.payment p
     WHERE p.status = 'succeeded'
       AND p.amount > 0
       AND coalesce(p.is_test, false) = false
  ),
  money AS (
    SELECT pay.paid_at::DATE AS day,
           count(*) FILTER (WHERE pay.purchase_seq = 1) AS reports_paid,
           coalesce(sum(pay.net), 0)                    AS revenue
      FROM pay
     WHERE pay.paid_at >= (SELECT from_day FROM bounds)
     GROUP BY 1
  ),
  opens AS (
    SELECT f.first_open::DATE AS day, count(*) AS report_opens
      FROM (
        SELECT rs.personal_report_id, min(rs.started_at) AS first_open
          FROM public.report_session rs
         GROUP BY rs.personal_report_id
      ) f
     WHERE f.first_open >= (SELECT from_day FROM bounds)
     GROUP BY 1
  ),
  inv AS (
    SELECT i.created_at::DATE AS day, count(*) AS invites_sent
      FROM public.invite_event i
     WHERE i.created_at >= (SELECT from_day FROM bounds)
     GROUP BY 1
  )
  SELECT d.day,
         coalesce(fe.unique_visitors, 0),
         coalesce(fe.survey_starts, 0),
         coalesce(fe.intro_completed, 0),
         coalesce(sub.submissions, 0),
         coalesce(rep.reports_created, 0),
         coalesce(money.reports_paid, 0),
         coalesce(money.revenue, 0),
         coalesce(opens.report_opens, 0),
         coalesce(inv.invites_sent, 0),
         coalesce(src.top_sources, '{}'::jsonb)
    FROM d
    LEFT JOIN fe    ON fe.day    = d.day
    LEFT JOIN src   ON src.day   = d.day
    LEFT JOIN sub   ON sub.day   = d.day
    LEFT JOIN rep   ON rep.day   = d.day
    LEFT JOIN money ON money.day = d.day
    LEFT JOIN opens ON opens.day = d.day
    LEFT JOIN inv   ON inv.day   = d.day
   ORDER BY d.day DESC;
$function$;
