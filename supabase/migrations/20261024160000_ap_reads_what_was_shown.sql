-- AP-Analytics reads what people were shown and what really happened (audit of 21 Oct 2026).
-- ap_facts, ap_report_extras, ap_question_answers and ap_survey_steps are replaced whole; each
-- body is 20261014130000's with these changes, each checked against production read-only before
-- this file was written:
--
-- ap_facts
--   * Report sessions of bots and automation are not readers: Google's AdsBot opened 551
--     customers' report links days after they did (read as returns: "Returned" 42% for 30 days
--     where readers came back 22%), and headless browsers and command-line clients are probes.
--   * Price quotes carry the arm and price each reader was DEALT. Every re-sync rewrote unpaid
--     quotes' prices (and the 6 Oct one their arm): the arm is report_price_quote_arm_history's
--     first old arm, the price the list in force when the quote was made
--     (get_price_list_changes). Before Pricing 2.0 prices were personal and none was kept: a
--     quote paid for keeps its own price, the rest have none. A plan not on sale when the quote
--     was made is left out (Essentials from Pricing 2.0, Core from Pricing 3.0): nobody saw it.
--     A finisher's price arm (priceArm) is the arm their FIRST quote was dealt, as the
--     experiment readouts take it, and quotedAt when that quote was made: a reader first
--     quoted after a pricing test ended was priced by the next one.
--   * A checkout is dated by when the payment page was reached: Stripe writes an abandoned one
--     when it expires, 24 hours after it opened. Each checkout keeps its finisher (sid, ph).
--   * srcKnown: whether a start, finisher, payment, checkout or quote has a known source.
--     Sources are recorded from 19 Jul 2026; before, an untagged one is unknown, not Direct.
--   * A paywall click leaves out offer_link, recorded when a reader lands from a nurture
--     email's offer link: not a click on the page.
--   * Tablets are told apart from 17 Oct 2026: a range starting earlier reads a tablet as its
--     phone or computer class, as every day before then reads it, so none falls between classes.
--   * The team's unfinished survey runs are not starts: a run from a network a staff user's own
--     survey came from (their steps' and drafts' IPs), unless it finished (a finisher is counted
--     by their user). 30 scripted runs on 4-5 Oct 2026 had no user to leave them out by.
--   * A quote a reminder job made (no browser, so the pricing code wrote "Desktop": one plan
--     alone, over an hour after the survey) says nothing about the reader's device: the device
--     is their own quotes', else the survey steps'. Before Pricing 2.0 a quote keeps its price
--     only where a real payment (not a free unlock or a test) was made on it.
--   * Country, gender and relationship are the survey's own answers (15001, 15010, 15004); the
--     profile, which keeps a person's latest, stands in only where a survey recorded none.
--   * pts: whether a finisher's survey was bought before it was taken (pay to start, live from
--     22 Oct 2026): claimed by a completed purchase, as the Pay to start page reads it. On every
--     finisher, start (by its finished survey), payment, refund, checkout, quote and each
--     person's lifetime sale, for the Funnel filter's "Free survey". A payment and a refund also carry its journey
--     (metadata.journey, pay to start's own purchase) and upgrade (a full unlock bought on a
--     report whose EUR 1.99 Core Archetype was paid before it), for the payment types.
--   * refunds: the range's sales refunded in full (status 'refunded', so gone from money) or in
--     part (still 'succeeded' with a refund_amount), for the refund columns. None so far.
--   * A payment is dated by when it was paid (payment_date_time), not when its row was written: a
--     pay-to-start purchase is written when the buyer's survey claims it, maybe the next day, and
--     the Pay to start page dates it by its payment. Every paid row has one (56 of 56 on 24 Oct
--     2026, none on another day than its row).
--   * Checkouts are the report's: pay to start's own purchase (metadata.journey pay_to_start) is
--     written only once paid and claimed, its unpaid ones never, so it would only lift checkout
--     success. The Pay to start page counts those checkouts.
--   * The intro's Backs count only before question 1 that day: leaving the questions with the
--     browser's Back walks back through every card in a second or two (17-23 Oct 2026: 18 of the
--     21 visitors with a Back on all five cards did so after question 1), which read as ~19%
--     Back on every card where 2-7% went back before question 1.
--
-- ap_report_extras
--   * Chapter reach leaves out readers who only scrolled past the chapter's paywall card; that
--     card's own rate keeps everyone who saw it.
--   * Every nurture stage sent is listed: dated by its promo code, else estimated from the
--     report's time and the stage's delay (6h_no_view, the 78h call invite), flagged
--     `estimated`. A purchase through one is known by its stamped stage, else by its coupon
--     (stamped only from 5 Jul 2026). A return counts for the reader's last email with a report
--     link before it: the 78h call invite linked only to the booking page.
--   * Each chapter's median reading time (ms_median) beside the average: times are medians
--     from the 21 Oct 2026 call, so a tab left open does not drag the figure.
--   * chapter_readers_before_slim: the readers who read before the slimmed report went live (22
--     Oct 2026, 18:48 Berlin), the reach base of the three chapters it left out.
--   * A purchase through a nurture email is dated by when it was paid, as every payment is.
--
-- ap_question_answers
--   * As ap_facts: tablets only in ranges from 17 Oct 2026, the reader's own quotes' device, and
--     the survey's own gender and relationship answers.
--   * pts on each row, as ap_facts marks a finisher, so "Free survey" leaves pay to start's
--     answers out as it leaves their surveys out (22-24 Oct read "17 of 16 finished surveys").
--
-- ap_survey_steps
--   * The team's unfinished runs (as ap_facts reads them) are left out with its finished ones,
--     and listed for the question table to leave out of get_survey_dropoff_runs' runs.
--   * So are runs begun before the range (earlier): a draft resumed in it, or a survey that ran
--     past midnight into it, an earlier period's start as ap_facts dates it. Counted, they reach
--     later questions without the first ones and the question funnel rose (24 Oct 2026).
--   * orders: each run begun once the opening-order test (C13) was live, with its first six
--     questions in the order it reached them. Counted in one order, the test's runs reach
--     question 6 without question 5 and the funnel rose there (21 Oct 2026 call); the page now
--     gives each order its own funnel.
--   * first_asked: when each question was first asked (its first step or answer), so the page
--     marks one added during the range and leaves out one added after it. The team's runs and
--     surveys are left out: they try a question before release (16016-16018: two team surveys
--     on 18 Sep 2026, everyone else from 6 Oct, so they read as asked all along).
--   * A run's Backs after its last forward (or complete) step were it walking back out of the
--     questions (the browser's Back passes each in a fraction of a second; a tab hidden on the
--     way records an abandon): no Went back, and after the walk's first Back (its stay on the
--     question it had got to) no time on a question. 10-23 Oct 2026: 39 of the 61 Went back on
--     the first five questions were such walks.
--
-- get_survey_dropoff_runs (also replaced whole: production's body with these changes)
--   * reached: each question once, in the order the run was asked them (question_index), not by
--     id. Placed on today's order, the email question asked first until 16 Aug 2026 made a run
--     that left at question 2 "reach" question 61, and every question before it (12 months: 3,569
--     runs at question 30, 2,451 real). The weekly drop-off report reads it as a set, as before.
--   * last_at: the run's last step, so a run still on a question today isn't counted as leaving.
--   * A run tagged google / cpc (ppc, paid, ads) is Google Ads, as AP's sources read a visit
--     (the click id alone left 4 runs of 10-23 Oct out of the Google Ads funnel).
--   * left_at: a run whose steps after its last forward (or complete) step went back was walking
--     back out of the questions, and left where that walk began, the question it had got to
--     (since 10 Oct 2026, 40 of 222 unfinished runs, every walk begun at the furthest question;
--     one that reached question 61 read as leaving at question 1).
--
-- ap_team_user (a new view) and every reader above, with ap_report_tour and ap_unlock_feedback
-- (replaced whole too: production's bodies with this change, and ap_unlock_feedback's below)
--   * The team is an @loveiq.org account or one that redeemed the team's own 100% test code:
--     7 accounts tested from other addresses (25 surveys, April to 23 Oct 2026, every unlock
--     EUR 0) and were counted as customers; 23 Oct's pay-to-start funnel read "Paid 0, survey
--     finished 1". One definition, read by every reader, the pages and their info cards.
--
-- ap_unlock_feedback
--   * A paid full unlock and this email's gift are dated by when they were paid.
--   * The paid group leaves out readers who bought the full report before taking the survey
--     (pay to start's full offer): their report came unlocked, never read locked first.
--
-- admin_field_note
--   * The data catalog's notes may be kept on Search Console's tables (source 'gsc').
--
-- Rollback: supabase/rollbacks/20261024160000_ap_reads_what_was_shown_down.sql.

BEGIN;

-- The team's own accounts, which every reader below, the pages and their info cards leave out:
-- an @loveiq.org address, or an account that redeemed the team's own 100% test code (its Stripe
-- coupon is named "100%test"): the team testing from another address (Eman, 24 Oct 2026: 7 such
-- accounts, 25 surveys from April to 23 Oct, every unlock EUR 0, none ever paid).
-- The other 100% codes went to real people: their unlocks stay counted, as free unlocks.
CREATE OR REPLACE VIEW public.ap_team_user WITH (security_invoker = true) AS
  SELECT u.id FROM app_user u WHERE u.email ~* '@loveiq\.org$'
  UNION
  SELECT s.user_id FROM payment p
    JOIN personal_report pr ON pr.id = p.personal_report_id
    JOIN survey_submission s ON s.id = pr.survey_submission_id
   WHERE p.metadata->>'couponName' = '100%test' AND s.user_id IS NOT NULL;

REVOKE ALL ON public.ap_team_user FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ap_team_user TO service_role;

CREATE OR REPLACE FUNCTION public.ap_facts(p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
  b AS (
    SELECT (p_from::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
           ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts,
           -- A visitor's source is recorded from 19 Jul 2026 (the tracker began keeping Google's
           -- click id and the utm tags): before, an untagged start or finisher is not Direct but
           -- unknown (srcKnown false below), unless their tracker holds a tag anyway.
           ('2026-07-19'::timestamp AT TIME ZONE 'Europe/Berlin') AS src_from,
           -- The price lists each quote was dealt (get_price_list_changes): Pricing 2.0's first
           -- production deploy, and Pricing 3.0's re-sync.
           timestamptz '2026-08-03 20:09:45+00' AS p2_from,
           timestamptz '2026-10-06 18:18:28.684862+00' AS p3_from
  ),
  staff AS (SELECT id FROM ap_team_user),
  -- Surveys bought before they were taken (pay to start): claimed by a completed purchase, a
  -- 100% code's EUR 0 one too, as the Pay to start page reads them. A pending checkout is bound
  -- to the survey as well (claim.ts) and its browser took the free survey like anyone: not one.
  pts_subs AS (
    SELECT DISTINCT p.consumed_submission_id AS sid
      FROM prepaid_report_access p
     WHERE p.consumed_submission_id IS NOT NULL AND p.offer IS NOT NULL
       AND p.paid_at IS NOT NULL AND p.status IN ('succeeded', 'refunded')
  ),
  -- The networks the team's own surveys came from (their steps' and drafts' IPs): an unfinished
  -- run from one is the team testing, though it has no user to tell it by (30 scripted runs on
  -- 4-5 Oct 2026). A finished one is counted or not by its user, as every finisher is.
  staff_ips AS (
    SELECT e.client_ip FROM survey_behavior_event e
      JOIN survey_submission s ON s.session_id = e.session_id
     WHERE s.user_id IN (SELECT id FROM staff) AND e.client_ip IS NOT NULL
    UNION
    SELECT d.client_ip FROM survey_partial_save d
      JOIN survey_submission s ON s.session_id = d.session_id
     WHERE s.user_id IN (SELECT id FROM staff) AND d.client_ip IS NOT NULL
  ),
  -- Quotes a reminder job made for a reader who hadn't opened the report: it has no browser, so
  -- the pricing code wrote "Desktop". One plan alone (a page quotes every plan at once), over an
  -- hour after the survey. Their device says nothing about the reader.
  cron_q AS (
    SELECT q.id
      FROM report_price_quote q
      JOIN survey_submission s ON s.id = q.survey_submission_id
     WHERE q.device_type = 'Desktop'
       AND q.created_date_time > s.created_date_time + interval '1 hour'
       -- A quote someone used (the paywall seen, a checkout opened) was a person's.
       AND q.paywall_reached_at IS NULL AND q.checkout_started_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM report_price_quote o
                        WHERE o.survey_submission_id = q.survey_submission_id AND o.id <> q.id
                          AND o.created_date_time BETWEEN q.created_date_time - interval '5 minutes'
                                                      AND q.created_date_time + interval '5 minutes')
  ),
  visits AS (
    SELECT f.day, COALESCE(f.landing_variant, 'unknown') AS arm, f.utm_source AS src, count(*) AS n
      FROM funnel_event f
     WHERE f.event_type = 'unique_visitor' AND f.day >= p_from AND f.day <= p_to
     GROUP BY 1, 2, 3
  ),
  cand AS (
    SELECT e.session_id FROM survey_behavior_event e, b
     WHERE e.created_at >= b.since_ts AND e.created_at < b.until_ts AND e.session_id IS NOT NULL
    UNION
    SELECT d.session_id FROM survey_partial_save d, b
     WHERE d.started_at >= b.since_ts AND d.started_at < b.until_ts AND d.session_id IS NOT NULL
    UNION
    SELECT s.session_id FROM survey_submission s, b
     WHERE s.start_date_time >= b.since_ts AND s.start_date_time < b.until_ts AND s.session_id IS NOT NULL
  ),
  -- A session the steps flag as a tablet (is_tablet, 20261014120100) is a Tablet: only these
  -- readers say so; device_type stays the price quote's class everywhere else.
  ev AS (
    SELECT e.session_id, min(e.created_at) AS first_at,
           (bool_or(e.answered IS TRUE) OR bool_or(e.direction = 'complete')) AS answered,
           CASE WHEN bool_or(e.is_tablet) AND p_from >= DATE '2026-10-17' THEN 'Tablet'
                ELSE (array_agg(e.device_type ORDER BY e.created_at DESC, e.id DESC)
                        FILTER (WHERE e.device_type IS NOT NULL))[1] END AS device,
           -- A step on the email question (00000): the run reached it (the email test, #7).
           bool_or(e.q_id = '00000') AS email_step,
           bool_or(e.client_ip IN (SELECT client_ip FROM staff_ips)) AS staff_ip
      FROM survey_behavior_event e
     WHERE e.session_id IN (SELECT session_id FROM cand)
     GROUP BY e.session_id
  ),
  dr AS (
    SELECT d.session_id, min(d.started_at) AS started_at, max(d.current_index) AS idx,
           (array_agg(d.utm_tracker ORDER BY d.saved_at DESC NULLS LAST)
              FILTER (WHERE d.utm_tracker IS NOT NULL))[1] AS tracker,
           -- A draft holding an email answer reached the email question too.
           bool_or(jsonb_typeof(d.answers) = 'object' AND d.answers ? '00000') AS email_draft,
           bool_or(d.client_ip IN (SELECT client_ip FROM staff_ips)) AS staff_ip
      FROM survey_partial_save d
     WHERE d.session_id IN (SELECT session_id FROM cand)
     GROUP BY d.session_id
  ),
  sb AS (
    SELECT DISTINCT ON (s.session_id) s.id, s.session_id, s.user_id, s.status, s.start_date_time, s.utm_tracker
      FROM survey_submission s
     WHERE s.session_id IN (SELECT session_id FROM cand)
     ORDER BY s.session_id, (s.status = 'completed') DESC, s.id
  ),
  starts AS (
    SELECT (LEAST(ev.first_at, dr.started_at, sb.start_date_time) AT TIME ZONE 'Europe/Berlin')::date AS day,
           LEAST(ev.first_at, dr.started_at, sb.start_date_time) AS started_at,
           COALESCE(sb.status = 'completed', false) AS finished,
           (dr.session_id IS NOT NULL OR sb.session_id IS NOT NULL) AS known,
           COALESCE(sb.utm_tracker, dr.tracker) AS tracker,
           ev.device,
           (COALESCE(ev.email_step, false) OR COALESCE(dr.email_draft, false)
              OR COALESCE(sb.status = 'completed', false)) AS email_reached,
           -- A buyer's run (pay to start), by its finished survey's claim; an unfinished
           -- buyer's run has nothing to tie it to the purchase and counts as the free survey's.
           COALESCE(sb.status = 'completed' AND sb.id IN (SELECT sid FROM pts_subs), false) AS pts
      FROM cand c
      LEFT JOIN ev ON ev.session_id = c.session_id
      LEFT JOIN dr ON dr.session_id = c.session_id
      LEFT JOIN sb ON sb.session_id = c.session_id
     WHERE (COALESCE(ev.answered, false) OR COALESCE(dr.idx, 0) >= 1 OR sb.status = 'completed')
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = sb.user_id)
       AND (sb.status = 'completed' OR NOT (COALESCE(ev.staff_ip, false) OR COALESCE(dr.staff_ip, false)))
  ),
  start_rows AS (
    SELECT st.day, st.finished, st.known, st.device, st.email_reached, t.j, st.pts,
           (st.started_at >= b.src_from OR (coalesce(t.j->>'utm_source', '') <> '' OR coalesce(t.j->>'utm_medium', '') <> ''
                 OR coalesce(t.j->>'gclid', '') <> '' OR coalesce(t.j->>'gbraid', '') <> '' OR coalesce(t.j->>'wbraid', '') <> ''
                 OR coalesce(t.j->>'fbclid', '') <> '' OR coalesce(t.j->>'referrer_host', '') <> '')) AS src_known
      FROM starts st, b,
           LATERAL (SELECT CASE WHEN st.tracker IS NOT NULL AND pg_input_is_valid(st.tracker, 'jsonb')
                                 AND jsonb_typeof(st.tracker::jsonb) = 'object'
                            THEN st.tracker::jsonb END AS j) t
     WHERE st.started_at >= b.since_ts AND st.started_at < b.until_ts
  ),
  subs AS (
    SELECT s.id, s.user_id, s.created_date_time, s.start_date_time, s.duration_ms, s.posthog_session_id AS ph,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j,
           (s.created_date_time >= b.src_from) AS after_src,
           -- Bought before it was taken (pay to start): the Funnel filter's "Free survey" leaves
           -- the survey and all its money out.
           (s.id IN (SELECT sid FROM pts_subs)) AS pts
      FROM survey_submission s, b
     WHERE s.status = 'completed'
       AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  rep AS (
    SELECT pr.id AS report_id, pr.survey_submission_id AS sid
      FROM personal_report pr
     WHERE pr.survey_submission_id IN (SELECT id FROM subs)
  ),
  -- Report sessions a reader starts within 30 minutes of the latest END of the ones before
  -- (a session's start when no plausible end was recorded) are one visit: a reload, a long
  -- read, a second tab or a quick reopen is not a return.
  sess0 AS (
    SELECT r.sid, rs.started_at, rs.ended_at,
           lag(rs.started_at) OVER w AS prev_start,
           max(CASE WHEN rs.ended_at > rs.started_at AND rs.ended_at - rs.started_at < interval '4 hours'
                    THEN rs.ended_at ELSE rs.started_at END)
             OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_end,
           -- The reader's first session: a later visit is a return (one window, not a re-scan
           -- of every session for each one).
           min(rs.started_at) OVER (PARTITION BY r.sid) AS first_start
      FROM report_session rs
      JOIN rep r ON r.report_id = rs.personal_report_id
     WHERE NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = rs.user_id)
       AND coalesce(rs.user_agent, '') !~* '(adsbot|headless|bot[/;) ]|crawler|spider|^curl/|^wget/|python-requests|go-http-client|okhttp|node-fetch|axios/)'
    WINDOW w AS (PARTITION BY r.sid ORDER BY rs.started_at)
  ),
  sess AS (
    SELECT s.sid, s.started_at, s.ended_at, s.first_start,
           (s.prev_start IS NULL OR s.started_at - s.prev_end >= interval '30 minutes') AS new_visit
      FROM sess0 s
  ),
  reading AS (
    SELECT s.sid,
           min(s.started_at) AS opened_at,
           count(*) FILTER (WHERE s.new_visit) AS visits,
           min(s.started_at) FILTER (WHERE s.new_visit AND s.started_at > s.first_start) AS returned_at,
           -- A session counts up to 30 minutes: longer is mostly a tab left open (14 Oct 2026).
           -- One of 4 hours or more has no plausible end and counts nothing, as the core KPIs
           -- read it (counting its 30 minutes lifted the average from 7:22 to 9:01, 14 Oct).
           coalesce(sum(least(extract(epoch FROM s.ended_at - s.started_at), 1800) * 1000)
                      FILTER (WHERE s.ended_at > s.started_at AND s.ended_at - s.started_at < interval '4 hours'), 0)::bigint AS read_ms,
           count(*) FILTER (WHERE s.ended_at > s.started_at AND s.ended_at - s.started_at < interval '4 hours') AS closed,
           -- Each session as [start (epoch s), its counted ms, end recorded 1/0, began a visit 1/0],
           -- so an earlier period can be read as it stood at the same age (ageMatched).
           json_agg(json_build_array(
             floor(extract(epoch FROM s.started_at))::bigint,
             CASE WHEN s.ended_at > s.started_at AND s.ended_at - s.started_at < interval '4 hours'
                  THEN (least(extract(epoch FROM s.ended_at - s.started_at), 1800) * 1000)::bigint
                  ELSE 0 END,
             CASE WHEN s.ended_at > s.started_at AND s.ended_at - s.started_at < interval '4 hours'
                  THEN 1 ELSE 0 END,
             CASE WHEN s.new_visit THEN 1 ELSE 0 END
           ) ORDER BY s.started_at) AS sessions
      FROM sess s
     GROUP BY s.sid
  ),
  q AS (
    SELECT q.survey_submission_id AS sid,
           min(q.paywall_reached_at) AS paywall_at,
           min(q.checkout_started_at) AS checkout_at,
           (array_agg(q.device_type ORDER BY q.created_date_time DESC)
              FILTER (WHERE q.device_type IS NOT NULL AND q.id NOT IN (SELECT id FROM cron_q)))[1] AS device,
           (array_agg(q.country_tier ORDER BY q.created_date_time DESC) FILTER (WHERE q.country_tier IS NOT NULL))[1] AS tier,
           -- The arm the reader was dealt: their FIRST quote's (as the experiment readouts take
           -- it), before any re-sync moved it; a later quote can be on a newer test's list.
           (array_agg(coalesce(h0.arm, q.experiment_group) ORDER BY q.created_date_time, q.id)
              FILTER (WHERE coalesce(h0.arm, q.experiment_group) IS NOT NULL))[1] AS price_arm,
           -- When that first quote was made: a reader first quoted after a pricing test ended
           -- was priced by whatever came next, as the readouts leave them out.
           min(q.created_date_time) AS quoted_at
      FROM report_price_quote q
      LEFT JOIN LATERAL (SELECT h.old_experiment_group AS arm FROM report_price_quote_arm_history h
                          WHERE h.quote_id = q.id ORDER BY h.changed_at, h.id LIMIT 1) h0 ON true
     WHERE q.survey_submission_id IN (SELECT id FROM subs)
     GROUP BY 1
  ),
  -- The device the survey itself recorded (survey steps, from 12 Oct 2026), for readers with no
  -- price quote yet: a quote is made only when the report is opened.
  step_device AS (
    -- A tablet if any step said so, as the starts, payments and quotes read it.
    SELECT DISTINCT ON (s.id) s.id AS sid, e.device_type AS device,
           EXISTS (SELECT 1 FROM survey_behavior_event t WHERE t.session_id = s.session_id AND t.is_tablet) AS tablet
      FROM survey_submission s
      JOIN survey_behavior_event e ON e.session_id = s.session_id
     WHERE s.id IN (SELECT id FROM subs) AND e.device_type IS NOT NULL
     ORDER BY s.id, e.created_at DESC
  ),
  clicked AS (
    SELECT a.survey_submission_id AS sid, min(a.event_time) AS at
      FROM analytics_event a
     WHERE a.event_type = 'paywall_initiated' AND a.survey_submission_id IN (SELECT id FROM subs)
       AND coalesce(a.metadata->>'source', '') <> 'offer_link'
     GROUP BY 1
  ),
  paid AS (
    SELECT pr.survey_submission_id AS sid,
           min(coalesce(p.payment_date_time, p.created_date_time)) FILTER (WHERE p.amount > 0) AS paid_at,
           count(*) FILTER (WHERE p.amount > 0) AS sales,
           coalesce(sum(p.amount) FILTER (WHERE p.amount > 0), 0) AS revenue,
           bool_or(coalesce(p.amount, 0) = 0) AS gifted,
           (array_agg(p.metadata->>'plan' ORDER BY coalesce(p.payment_date_time, p.created_date_time)) FILTER (WHERE p.amount > 0))[1] AS plan,
           -- A full unlock: Full, Full All or Core (the top three in full), first or as an upgrade
           -- from Essentials (the plan above is the first).
           coalesce(bool_or(p.metadata->>'plan' IN ('full_report', 'all_reports', 'core')) FILTER (WHERE p.amount > 0), false) AS full_paid,
           -- The full unlocks among them, for an average full-unlock price per segment.
           count(*) FILTER (WHERE p.amount > 0 AND p.metadata->>'plan' IN ('full_report', 'all_reports', 'core')) AS full_sales,
           coalesce(sum(p.amount) FILTER (WHERE p.amount > 0 AND p.metadata->>'plan' IN ('full_report', 'all_reports', 'core')), 0) AS full_revenue,
           -- Each sale as [time (epoch s), amount, plan], so an earlier period can be read as it
           -- stood at the same age, a later upgrade left out (ageMatched).
           json_agg(json_build_array(floor(extract(epoch FROM coalesce(p.payment_date_time, p.created_date_time)))::bigint, p.amount, p.metadata->>'plan')
                    ORDER BY coalesce(p.payment_date_time, p.created_date_time), p.id) FILTER (WHERE p.amount > 0) AS pays
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
     WHERE p.status = 'succeeded' AND coalesce(p.is_test, false) = false
       AND pr.survey_submission_id IN (SELECT id FROM subs)
     GROUP BY 1
  ),
  -- Shares, votes and invites with the first one's time, so a comparison with an earlier
  -- period can count them at the same age.
  shared AS (
    SELECT r.sid, min(x.created_at) AS at
      FROM report_share x JOIN rep r ON r.report_id = x.personal_report_id
     GROUP BY 1
  ),
  votes AS (
    SELECT f.survey_submission_id AS sid, count(*) AS n, min(f.created_at) AS at
      FROM report_section_feedback f
     WHERE f.survey_submission_id IN (SELECT id FROM subs)
     GROUP BY 1
  ),
  invited AS (
    SELECT s.id AS sid, min(i.created_at) AS at
      FROM subs s
      JOIN app_user u ON u.id = s.user_id
      JOIN invite_event i ON lower(i.referrer_email) = lower(u.email) AND i.created_at >= s.created_date_time
     GROUP BY 1
  ),
  wizard AS (
    SELECT a.survey_submission_id AS sid,
           max(CASE WHEN (a.metadata->>'to_slide') ~ '^[0-5]$' THEN (a.metadata->>'to_slide')::int END)
             FILTER (WHERE a.metadata->>'direction' = 'next') AS slide
      FROM analytics_event a
     WHERE a.event_type = 'wizard_slide_advanced' AND a.survey_submission_id IN (SELECT id FROM subs)
     GROUP BY 1
  ),
  -- Each survey's own country, gender and relationship answers (15001, 15010, 15004); the
  -- profile keeps only a person's latest, so it stands in only where a survey recorded none.
  own_who AS (
    SELECT a.survey_submission_id AS sid,
           max(CASE WHEN sq.frontend_qid = '15001' THEN coalesce(ao.option_text, a.answer_text) END) AS country,
           max(CASE WHEN sq.frontend_qid = '15010' THEN ao.option_text END) AS gender,
           max(CASE WHEN sq.frontend_qid = '15004' THEN ao.option_text END) AS relationship
      FROM survey_submission_answer a
      JOIN survey_question sq ON sq.id = a.survey_question_id AND sq.frontend_qid IN ('15001', '15010', '15004')
      LEFT JOIN answer_option ao ON ao.id = a.answer_option_id
     WHERE a.survey_submission_id IN (SELECT id FROM subs)
     GROUP BY 1
  ),
  who AS (
    SELECT s.id AS sid, coalesce(o.country, up.location_primary) AS country,
           coalesce(o.gender, up.gender) AS gender,
           coalesce(o.relationship, up.relationship_status) AS relationship
      FROM subs s
      LEFT JOIN own_who o ON o.sid = s.id
      LEFT JOIN app_user u ON u.id = s.user_id
      LEFT JOIN user_profile up ON up.id = u.user_profile_id
  ),
  age AS (
    SELECT DISTINCT ON (a.survey_submission_id) a.survey_submission_id AS sid, ao.option_text AS age
      FROM survey_submission_answer a
      JOIN survey_question sq ON sq.id = a.survey_question_id AND sq.frontend_qid = '15003'
      JOIN answer_option ao ON ao.id = a.answer_option_id
     WHERE a.survey_submission_id IN (SELECT id FROM subs)
     ORDER BY a.survey_submission_id, a.id DESC
  ),
  -- The report's archetype, as the pricing readers take it (20260727002336).
  arch AS (
    SELECT DISTINCT ON (sr.survey_submission_id) sr.survey_submission_id AS sid,
           coalesce(sr.v5_primary_archetype, sr.primary_archetype) AS archetype
      FROM scoring_result sr
     WHERE sr.survey_submission_id IN (SELECT id FROM subs)
     ORDER BY sr.survey_submission_id, sr.id DESC
  ),
  -- Each finisher's history, all time: their first finished survey and how many they finished,
  -- and every sale on any of their reports (amount over 0, not a test; a full refund moves a
  -- payment to 'refunded', which is kept here only to count it). For new users, assessments per
  -- user, lifetime value and the cohorts. Staff never reach subs, so never these.
  people AS (
    SELECT s.user_id AS uid, min(s.created_date_time) AS first_at, count(*) AS subs_n
      FROM survey_submission s
     WHERE s.status = 'completed' AND s.user_id IN (SELECT user_id FROM subs)
     GROUP BY 1
  ),
  -- pts: the sale's survey was bought before it was taken, so "Free survey" can leave it out.
  people_pays AS (
    SELECT s.user_id AS uid,
           json_agg(json_build_object(
             'at', coalesce(p.payment_date_time, p.created_date_time), 'amount', p.amount, 'plan', p.metadata->>'plan',
             'refunded', (p.status = 'refunded' OR coalesce(p.refund_amount, 0) > 0),
             'pts', s.id IN (SELECT sid FROM pts_subs))
             ORDER BY coalesce(p.payment_date_time, p.created_date_time), p.id) AS pays
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
      JOIN survey_submission s ON s.id = pr.survey_submission_id
     WHERE p.status IN ('succeeded', 'refunded') AND coalesce(p.is_test, false) = false AND p.amount > 0
       AND s.user_id IN (SELECT user_id FROM subs)
     GROUP BY 1
  ),
  sub_rows AS (
    SELECT s.id, s.created_date_time, s.start_date_time, s.duration_ms, s.j, s.ph, s.pts,
           (s.after_src OR (coalesce(s.j->>'utm_source', '') <> '' OR coalesce(s.j->>'utm_medium', '') <> ''
                 OR coalesce(s.j->>'gclid', '') <> '' OR coalesce(s.j->>'gbraid', '') <> '' OR coalesce(s.j->>'wbraid', '') <> ''
                 OR coalesce(s.j->>'fbclid', '') <> '' OR coalesce(s.j->>'referrer_host', '') <> '')) AS src_known,
           (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day,
           -- Opened: the report's first session or, where none was recorded (before 18 Sep 2026
           -- only with cookie consent), the first sign it was open: the paywall seen, a paywall
           -- click, a checkout or a payment. Never later than those, so no step after "opened"
           -- outnumbers it. A price quote is no such sign: one is made at submission.
           coalesce(r.opened_at, least(q.paywall_at, c.at, q.checkout_at, p.paid_at)) AS opened_at,
           r.visits, r.returned_at, r.read_ms, r.closed, r.sessions,
           q.paywall_at, c.at AS clicked_at, q.checkout_at,
           CASE WHEN sd.tablet AND p_from >= DATE '2026-10-17' THEN 'Tablet' ELSE coalesce(q.device, sd.device) END AS device, q.tier, q.price_arm, q.quoted_at,
           p.paid_at, p.sales, p.revenue, p.gifted, p.plan, p.full_paid, p.full_sales, p.full_revenue, p.pays,
           (sh.sid IS NOT NULL) AS shared, sh.at AS shared_at, coalesce(v.n, 0) AS votes, v.at AS voted_at,
           (iv.sid IS NOT NULL) AS invited, iv.at AS invited_at,
           w.slide AS wizard_slide,
           who.country, who.gender, who.relationship, age.age,
           s.user_id AS uid, pe.first_at AS user_first_at, pe.subs_n AS user_subs, pp.pays AS user_pays,
           ar.archetype
      FROM subs s
      LEFT JOIN reading r ON r.sid = s.id
      LEFT JOIN q ON q.sid = s.id
      LEFT JOIN step_device sd ON sd.sid = s.id
      LEFT JOIN clicked c ON c.sid = s.id
      LEFT JOIN paid p ON p.sid = s.id
      LEFT JOIN shared sh ON sh.sid = s.id
      LEFT JOIN votes v ON v.sid = s.id
      LEFT JOIN invited iv ON iv.sid = s.id
      LEFT JOIN wizard w ON w.sid = s.id
      LEFT JOIN who ON who.sid = s.id
      LEFT JOIN age ON age.sid = s.id
      LEFT JOIN people pe ON pe.uid = s.user_id
      LEFT JOIN people_pays pp ON pp.uid = s.user_id
      LEFT JOIN arch ar ON ar.sid = s.id
  ),
  money AS (
    SELECT (coalesce(p.payment_date_time, p.created_date_time) AT TIME ZONE 'Europe/Berlin')::date AS day, p.amount, s.id AS sid,
           (s.created_date_time >= b.src_from) AS after_src,
           p.metadata->>'plan' AS plan, s.posthog_session_id AS ph, s.user_id AS uid,
           -- The payment types: pay to start's own purchase carries its journey; a full unlock
           -- bought after a paid EUR 1.99 Core Archetype is its upgrade. pts: the finisher's
           -- survey was bought first, for the Funnel filter.
           p.metadata->>'journey' AS journey,
           (p.metadata->>'plan' IN ('full_report', 'all_reports', 'core') AND EXISTS (
             SELECT 1 FROM payment e
              WHERE e.personal_report_id = p.personal_report_id AND e.metadata->>'plan' = 'initial'
                AND e.amount > 0 AND e.status IN ('succeeded', 'refunded')
                AND coalesce(e.is_test, false) = false AND coalesce(e.payment_date_time, e.created_date_time) < coalesce(p.payment_date_time, coalesce(p.payment_date_time, p.created_date_time)))) AS upgrade,
           (s.id IN (SELECT sid FROM pts_subs)) AS pts,
           -- The price arm the checkout was made under (stamped on the payment; a quote's own arm
           -- can be re-synced later, a payment's never is).
           p.metadata->>'experimentGroup' AS price_arm,
           -- How they paid: Stripe Link or the card's brand, as Stripe reported it.
           CASE WHEN p.payment_method_type = 'card' THEN coalesce(p.card_brand, 'card')
                ELSE p.payment_method_type END AS method,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j,
           CASE WHEN p_from >= DATE '2026-10-17' AND EXISTS (SELECT 1 FROM survey_behavior_event e WHERE e.session_id = s.session_id AND e.is_tablet) THEN 'Tablet'
                ELSE coalesce((SELECT q2.device_type FROM report_price_quote q2
                                WHERE q2.survey_submission_id = s.id AND q2.device_type IS NOT NULL
                                  AND q2.id NOT IN (SELECT id FROM cron_q)
                                ORDER BY q2.created_date_time DESC LIMIT 1),
                              (SELECT e.device_type FROM survey_behavior_event e
                                WHERE e.session_id = s.session_id AND e.device_type IS NOT NULL
                                ORDER BY e.created_at DESC LIMIT 1)) END AS device,
           (SELECT q2.country_tier FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.country_tier IS NOT NULL ORDER BY q2.created_date_time DESC LIMIT 1) AS tier
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
      JOIN survey_submission s ON s.id = pr.survey_submission_id, b
     WHERE p.status = 'succeeded' AND coalesce(p.is_test, false) = false
       AND coalesce(p.payment_date_time, p.created_date_time) >= b.since_ts AND coalesce(p.payment_date_time, p.created_date_time) < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  -- The range's sales that were refunded, in full ('refunded', gone from money above) or in
  -- part (still 'succeeded' with a refund_amount), whenever the refund came.
  refunds AS (
    SELECT (coalesce(p.payment_date_time, p.created_date_time) AT TIME ZONE 'Europe/Berlin')::date AS day, s.id AS sid,
           p.metadata->>'plan' AS plan, p.amount, p.refund_amount, (p.status = 'refunded') AS full_refund,
           p.metadata->>'journey' AS journey, (p.metadata->>'plan' IN ('full_report', 'all_reports', 'core') AND EXISTS (
             SELECT 1 FROM payment e
              WHERE e.personal_report_id = p.personal_report_id AND e.metadata->>'plan' = 'initial'
                AND e.amount > 0 AND e.status IN ('succeeded', 'refunded')
                AND coalesce(e.is_test, false) = false AND coalesce(e.payment_date_time, e.created_date_time) < coalesce(p.payment_date_time, coalesce(p.payment_date_time, p.created_date_time)))) AS upgrade,
           (s.id IN (SELECT sid FROM pts_subs)) AS pts
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
      JOIN survey_submission s ON s.id = pr.survey_submission_id, b
     WHERE (p.status = 'refunded' OR (p.status = 'succeeded' AND coalesce(p.refund_amount, 0) > 0))
       AND coalesce(p.is_test, false) = false AND p.amount > 0
       AND coalesce(p.payment_date_time, p.created_date_time) >= b.since_ts AND coalesce(p.payment_date_time, p.created_date_time) < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  -- Every paid checkout opened in the range (a Stripe Checkout session, written when it was paid,
  -- failed or expired): a) reached the payment page; b) attempted, i.e. paid, or a payment method
  -- or a failure is recorded; c) paid. Free (EUR 0) unlocks are left out. Opened = created.
  -- The report's checkouts only: pay to start's own purchase was a checkout on its page before
  -- the survey, written here only once paid and claimed (its unpaid ones never are), so it is
  -- left out; the Pay to start page counts those with their unpaid ones.
  checkouts AS (
    SELECT (o.opened AT TIME ZONE 'Europe/Berlin')::date AS day, p.status, s.id AS sid, s.posthog_session_id AS ph,
           (s.created_date_time >= b.src_from) AS after_src,
           (p.status = 'succeeded' OR p.payment_method_type IS NOT NULL OR p.failure_code IS NOT NULL) AS attempted,
           p.metadata->>'plan' AS plan, p.metadata->>'experimentGroup' AS price_arm,
           (s.id IN (SELECT sid FROM pts_subs)) AS pts,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j,
           CASE WHEN p_from >= DATE '2026-10-17' AND EXISTS (SELECT 1 FROM survey_behavior_event e WHERE e.session_id = s.session_id AND e.is_tablet) THEN 'Tablet'
                ELSE coalesce((SELECT q2.device_type FROM report_price_quote q2
                                WHERE q2.survey_submission_id = s.id AND q2.device_type IS NOT NULL
                                  AND q2.id NOT IN (SELECT id FROM cron_q)
                                ORDER BY q2.created_date_time DESC LIMIT 1),
                              (SELECT e.device_type FROM survey_behavior_event e
                                WHERE e.session_id = s.session_id AND e.device_type IS NOT NULL
                                ORDER BY e.created_at DESC LIMIT 1)) END AS device,
           (SELECT q2.country_tier FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.country_tier IS NOT NULL ORDER BY q2.created_date_time DESC LIMIT 1) AS tier
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
      JOIN survey_submission s ON s.id = pr.survey_submission_id
      CROSS JOIN LATERAL (SELECT CASE WHEN p.status = 'canceled' THEN p.created_date_time - interval '24 hours'
                                      ELSE p.created_date_time END AS opened) o, b
     WHERE coalesce(p.is_test, false) = false AND p.amount > 0
       AND coalesce(p.metadata->>'journey', '') <> 'pay_to_start'
       AND o.opened >= b.since_ts AND o.opened < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  lists AS (SELECT * FROM get_price_list_changes()),
  quotes AS (
    SELECT q.id, q.survey_submission_id AS sid, q.plan, coalesce(h0.arm, q.experiment_group) AS price_arm,
           CASE WHEN q.created_date_time < b.p2_from
                -- Before Pricing 2.0 a quote's personal price is kept only where it was paid: a free
                -- unlock or a test purchase also stamps purchased_at, so a real sale is looked for.
                THEN CASE WHEN EXISTS (SELECT 1 FROM payment p WHERE p.pricing_quote_id = q.id AND p.status = 'succeeded'
                                          AND coalesce(p.is_test, false) = false AND p.amount > 0)
                          THEN coalesce(q.initial_price, q.current_price) END
                ELSE (SELECT l.starting_price FROM lists l
                       WHERE l.arm = coalesce(h0.arm, q.experiment_group) AND l.plan = q.plan
                         AND l.changed_at <= q.created_date_time
                       ORDER BY l.changed_at DESC LIMIT 1) END AS price,
           (s.created_date_time >= b.src_from) AS after_src,
           q.checkout_started_at, q.paywall_reached_at,
           (s.id IN (SELECT sid FROM pts_subs)) AS pts,
           CASE WHEN p_from >= DATE '2026-10-17' AND EXISTS (SELECT 1 FROM survey_behavior_event e WHERE e.session_id = s.session_id AND e.is_tablet) THEN 'Tablet'
                -- A reminder job's quote takes the reader's device from their own quotes or steps.
                WHEN q.id IN (SELECT id FROM cron_q)
                THEN coalesce((SELECT q2.device_type FROM report_price_quote q2
                                WHERE q2.survey_submission_id = q.survey_submission_id AND q2.device_type IS NOT NULL
                                  AND q2.id NOT IN (SELECT id FROM cron_q)
                                ORDER BY q2.created_date_time DESC LIMIT 1),
                              (SELECT e.device_type FROM survey_behavior_event e
                                WHERE e.session_id = s.session_id AND e.device_type IS NOT NULL
                                ORDER BY e.created_at DESC LIMIT 1))
                ELSE q.device_type END AS device,
           q.country_tier AS tier,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j
      FROM report_price_quote q
      JOIN survey_submission s ON s.id = q.survey_submission_id
      LEFT JOIN LATERAL (SELECT h.old_experiment_group AS arm FROM report_price_quote_arm_history h
                          WHERE h.quote_id = q.id ORDER BY h.changed_at, h.id LIMIT 1) h0 ON true, b
     WHERE q.created_date_time >= b.since_ts AND q.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
       AND NOT (q.plan = 'essentials' AND q.created_date_time >= b.p2_from)
       AND NOT (q.plan = 'core' AND q.created_date_time >= b.p3_from)
  ),
  -- The cards before question 1, in order; the intro's and the consent's, and the Back and
  -- Skip steps, exist from 20261014120200. Per visitor and day, the furthest card reached is
  -- where they left, unless it is question 1.
  intro_cards (step, card) AS (
    VALUES ('intro_view', 1), ('intro_slide_1', 2), ('intro_slide_2', 3), ('intro_slide_3', 4),
           ('intro_slide_4', 5), ('consent_view', 6), ('survey_engine_mount', 7)
  ),
  intro_last AS (
    SELECT f.visitor_id, f.day, max(c.card) AS card
      FROM funnel_event f
      JOIN intro_cards c ON c.step = f.event_type
     WHERE f.day >= p_from AND f.day <= p_to
     GROUP BY 1, 2
  ),
  -- Per step and day: visitors, each one's time to the next card, those who went on to it (any
  -- time that day), those who skipped from slides 1 to 3 straight to question 1, and those who
  -- left there. Back and Skip are steps of their own, counted in n. The primary key
  -- (visitor_id, day, event_type) keeps every join to one row at most, so count(*) is still one
  -- per visitor.
  intro AS (
    SELECT f.day, f.event_type AS step,
           -- A Back after reaching question 1 that day is the browser's Back leaving the questions
           -- through the intro's pages (all five within seconds), not a card read again: a Back
           -- counts only before question 1.
           count(*) FILTER (WHERE qb.visitor_id IS NULL OR qb.first_seen > f.first_seen) AS n,
           coalesce(array_agg(round(extract(epoch FROM coalesce(nx.first_seen, q4.first_seen) - f.first_seen) * 1000)::bigint)
                      FILTER (WHERE coalesce(nx.first_seen, q4.first_seen) > f.first_seen AND s4.visitor_id IS NULL), '{}') AS ms,
           count(*) FILTER (WHERE nx.visitor_id IS NULL AND q1.visitor_id IS NOT NULL) AS skipped,
           -- Skip Intro on slide 4 also lands on the consent: that is a skip, not going on.
           count(coalesce(nx.visitor_id, q4.visitor_id)) FILTER (WHERE s4.visitor_id IS NULL) AS went_on,
           count(*) FILTER (WHERE l.card = c.card) AS exited,
           -- Consent viewers who saw no intro that day: the landing card's starters come straight
           -- to the consent, so the consent's reach is read over those who came through the intro.
           count(*) FILTER (WHERE f.event_type = 'consent_view' AND iv.visitor_id IS NULL) AS direct
      FROM funnel_event f
      LEFT JOIN intro_cards c ON c.step = f.event_type
      LEFT JOIN funnel_event nx
        ON nx.visitor_id = f.visitor_id AND nx.day = f.day
       AND nx.event_type = CASE f.event_type
                             WHEN 'intro_view' THEN 'intro_slide_1'
                             WHEN 'intro_slide_1' THEN 'intro_slide_2'
                             WHEN 'intro_slide_2' THEN 'intro_slide_3'
                             WHEN 'intro_slide_3' THEN 'intro_slide_4'
                             WHEN 'intro_slide_4' THEN 'consent_view'
                             WHEN 'consent_view' THEN 'survey_engine_mount'
                           END
      -- Slide 4 went on to question 1 where the consent left no row (before it recorded one).
      LEFT JOIN funnel_event q4
        ON f.event_type = 'intro_slide_4' AND nx.visitor_id IS NULL
       AND q4.visitor_id = f.visitor_id AND q4.day = f.day AND q4.event_type = 'survey_engine_mount'
      LEFT JOIN funnel_event q1
        ON q1.visitor_id = f.visitor_id AND q1.day = f.day
       AND q1.event_type = 'survey_engine_mount' AND q1.first_seen > f.first_seen
       AND f.event_type IN ('intro_slide_1', 'intro_slide_2', 'intro_slide_3')
      LEFT JOIN intro_last l ON l.visitor_id = f.visitor_id AND l.day = f.day
      LEFT JOIN funnel_event s4
        ON f.event_type = 'intro_slide_4' AND s4.visitor_id = f.visitor_id AND s4.day = f.day
       AND s4.event_type = 'intro_skip_4'
      LEFT JOIN funnel_event iv
        ON f.event_type = 'consent_view' AND iv.visitor_id = f.visitor_id AND iv.day = f.day
       AND iv.event_type = 'intro_view'
      LEFT JOIN funnel_event qb
        ON f.event_type IN ('intro_back_1', 'intro_back_2', 'intro_back_3', 'intro_back_4', 'consent_back')
       AND qb.visitor_id = f.visitor_id AND qb.day = f.day AND qb.event_type = 'survey_engine_mount'
     WHERE f.event_type IN ('survey_engine_mount', 'intro_view', 'intro_slide_1', 'intro_slide_2',
                            'intro_slide_3', 'intro_slide_4', 'consent_view',
                            'intro_back_1', 'intro_back_2', 'intro_back_3', 'intro_back_4',
                            'intro_skip_1', 'intro_skip_2', 'intro_skip_3', 'intro_skip_4', 'consent_back')
       AND f.day >= p_from AND f.day <= p_to
     GROUP BY 1, 2
  ),
  invites AS (
    SELECT (i.created_at AT TIME ZONE 'Europe/Berlin')::date AS day, count(*) AS n
      FROM invite_event i, b
     WHERE i.created_at >= b.since_ts AND i.created_at < b.until_ts
       AND coalesce(i.referrer_email, '') !~* '@loveiq\.org$'
       AND NOT EXISTS (SELECT 1 FROM app_user u JOIN staff ON staff.id = u.id
                        WHERE lower(u.email) = lower(i.referrer_email))
     GROUP BY 1
  ),
  quote_sales AS (
    SELECT p.pricing_quote_id AS id, count(*) AS sales, sum(p.amount) AS revenue
      FROM payment p
     WHERE p.status = 'succeeded' AND coalesce(p.is_test, false) = false AND p.amount > 0
       AND p.pricing_quote_id IN (SELECT id FROM quotes)
     GROUP BY 1
  )
  SELECT json_build_object(
    'visits', (SELECT coalesce(json_agg(json_build_object('day', v.day, 'arm', v.arm, 'src', v.src, 'n', v.n)), '[]'::json) FROM visits v),
    'starts', (
      SELECT coalesce(json_agg(json_build_object(
               'day', g.day, 'known', g.known, 'src', g.src, 'med', g.med, 'ads', g.ads, 'arm', g.arm,
               'ref', g.ref, 'fb', g.fb,
               'device', g.device, 'finished', g.finished,
               'camp', g.camp, 'term', g.term, 'cq', g.cq, 'email', g.email_reached,
               'srcKnown', g.src_known, 'pts', g.pts, 'n', g.n)), '[]'::json)
        FROM (
          SELECT sr.day, sr.known, sr.j->>'utm_source' AS src, sr.j->>'utm_medium' AS med,
                 (coalesce(sr.j->>'gclid', '') <> '' OR coalesce(sr.j->>'gbraid', '') <> '' OR coalesce(sr.j->>'wbraid', '') <> '') AS ads,
                 sr.j->>'referrer_host' AS ref, coalesce(sr.j->>'fbclid', '') <> '' AS fb,
                 sr.j->>'landing_variant' AS arm, sr.device, sr.finished,
                 -- The ad's campaign and keyword as the links tag them, and the email test's arm.
                 sr.j->>'utm_campaign' AS camp, sr.j->>'utm_term' AS term,
                 sr.j->>'contact_question_arm' AS cq, sr.email_reached, sr.src_known, sr.pts, count(*) AS n
            FROM start_rows sr
           GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
        ) g
    ),
    'subs', (
      -- Two objects joined: one call takes at most 100 arguments, and a finisher has more.
      SELECT coalesce(json_agg((jsonb_build_object(
               'id', x.id, 'day', x.day, 'at', x.created_date_time, 'startAt', x.start_date_time,
               'durationMs', x.duration_ms,
               'src', x.j->>'utm_source', 'med', x.j->>'utm_medium',
               'ref', x.j->>'referrer_host', 'fb', coalesce(x.j->>'fbclid', '') <> '',
               'ads', (coalesce(x.j->>'gclid', '') <> '' OR coalesce(x.j->>'gbraid', '') <> '' OR coalesce(x.j->>'wbraid', '') <> ''),
               'arm', x.j->>'landing_variant', 'srcKnown', x.src_known,
               'device', x.device, 'tier', x.tier, 'priceArm', x.price_arm, 'quotedAt', x.quoted_at,
               'country', x.country, 'gender', x.gender, 'relationship', x.relationship, 'age', x.age,
               'openedAt', x.opened_at, 'visits', coalesce(x.visits, 0), 'returnedAt', x.returned_at,
               'readMs', coalesce(x.read_ms, 0), 'closed', coalesce(x.closed, 0),
               'sessions', coalesce(x.sessions, '[]'::json)
             ) || jsonb_build_object(
               'paywallAt', x.paywall_at, 'clickedAt', x.clicked_at, 'checkoutAt', x.checkout_at,
               'paidAt', x.paid_at, 'sales', coalesce(x.sales, 0), 'revenue', coalesce(x.revenue, 0),
               'gifted', coalesce(x.gifted, false), 'plan', x.plan, 'full', coalesce(x.full_paid, false),
               'fullSales', coalesce(x.full_sales, 0), 'fullRevenue', coalesce(x.full_revenue, 0),
               'pays', coalesce(x.pays, '[]'::json),
               'shared', x.shared, 'sharedAt', x.shared_at, 'votes', x.votes, 'votedAt', x.voted_at,
               'invited', x.invited, 'invitedAt', x.invited_at, 'wizardSlide', x.wizard_slide,
               -- The visit the survey was finished in, for the new/returning filter (PostHog).
               'ph', x.ph,
               'camp', x.j->>'utm_campaign', 'term', x.j->>'utm_term', 'net', x.j->>'network',
               'cq', x.j->>'contact_question_arm', 'archetype', x.archetype, 'pts', x.pts,
               -- The person (an internal id, never shown) and their history, all time.
               'uid', x.uid, 'userFirstAt', x.user_first_at, 'userSubs', coalesce(x.user_subs, 0),
               'userPays', coalesce(x.user_pays, '[]'::json)
             )) ORDER BY x.created_date_time), '[]'::json)
        FROM sub_rows x
    ),
    'money', (
      SELECT coalesce(json_agg(json_build_object(
               'day', m.day, 'sid', m.sid, 'amount', m.amount, 'plan', m.plan,
               'src', m.j->>'utm_source', 'med', m.j->>'utm_medium',
               'ref', m.j->>'referrer_host', 'fb', coalesce(m.j->>'fbclid', '') <> '',
               'ads', (coalesce(m.j->>'gclid', '') <> '' OR coalesce(m.j->>'gbraid', '') <> '' OR coalesce(m.j->>'wbraid', '') <> ''),
               'arm', m.j->>'landing_variant', 'device', m.device, 'tier', m.tier, 'ph', m.ph,
               'uid', m.uid, 'method', m.method, 'priceArm', m.price_arm,
               'journey', m.journey, 'upgrade', m.upgrade, 'pts', m.pts,
               'srcKnown', (m.after_src OR (coalesce(m.j->>'utm_source', '') <> '' OR coalesce(m.j->>'utm_medium', '') <> ''
                 OR coalesce(m.j->>'gclid', '') <> '' OR coalesce(m.j->>'gbraid', '') <> '' OR coalesce(m.j->>'wbraid', '') <> ''
                 OR coalesce(m.j->>'fbclid', '') <> '' OR coalesce(m.j->>'referrer_host', '') <> '')),
               'camp', m.j->>'utm_campaign', 'term', m.j->>'utm_term', 'net', m.j->>'network')), '[]'::json)
        FROM money m
    ),
    'refunds', (
      SELECT coalesce(json_agg(json_build_object(
               'day', r.day, 'sid', r.sid, 'plan', r.plan, 'amount', r.amount,
               'refund', r.refund_amount, 'full', r.full_refund,
               'journey', r.journey, 'upgrade', r.upgrade, 'pts', r.pts)), '[]'::json)
        FROM refunds r
    ),
    'checkouts', (
      SELECT coalesce(json_agg(json_build_object(
               'day', g.day, 'status', g.status, 'attempted', g.attempted, 'plan', g.plan, 'priceArm', g.price_arm,
               'src', g.src, 'med', g.med, 'ads', g.ads, 'ref', g.ref, 'fb', g.fb, 'arm', g.arm,
               'device', g.device, 'tier', g.tier, 'sid', g.sid, 'ph', g.ph, 'srcKnown', g.src_known,
               'pts', g.pts, 'n', g.n)), '[]'::json)
        FROM (
          SELECT c.day, c.status, c.attempted, c.plan, c.price_arm, c.j->>'utm_source' AS src, c.j->>'utm_medium' AS med,
                 (coalesce(c.j->>'gclid', '') <> '' OR coalesce(c.j->>'gbraid', '') <> '' OR coalesce(c.j->>'wbraid', '') <> '') AS ads,
                 c.j->>'referrer_host' AS ref, coalesce(c.j->>'fbclid', '') <> '' AS fb,
                 c.j->>'landing_variant' AS arm, c.device, c.tier, c.sid, c.ph,
                 (c.after_src OR (coalesce(c.j->>'utm_source', '') <> '' OR coalesce(c.j->>'utm_medium', '') <> ''
                 OR coalesce(c.j->>'gclid', '') <> '' OR coalesce(c.j->>'gbraid', '') <> '' OR coalesce(c.j->>'wbraid', '') <> ''
                 OR coalesce(c.j->>'fbclid', '') <> '' OR coalesce(c.j->>'referrer_host', '') <> '')) AS src_known,
                 c.pts, count(*) AS n
            FROM checkouts c
           GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17
        ) g
    ),
    'intro', (SELECT coalesce(json_agg(json_build_object('day', x.day, 'step', x.step, 'n', x.n, 'ms', x.ms, 'skipped', x.skipped,
                                                         'wentOn', x.went_on, 'left', x.exited, 'direct', x.direct)), '[]'::json) FROM intro x),
    'invites', (SELECT coalesce(json_agg(json_build_object('day', x.day, 'n', x.n)), '[]'::json) FROM invites x),
    'quotes', (
      SELECT coalesce(json_agg(json_build_object(
               'plan', g.plan, 'priceArm', g.price_arm, 'price', g.price, 'src', g.src, 'med', g.med, 'ads', g.ads,
               'ref', g.ref, 'fb', g.fb,
               'device', g.device, 'tier', g.tier, 'srcKnown', g.src_known,
               'quoted', g.quoted, 'paywall', g.paywall, 'checkouts', g.checkouts,
               'sales', g.sales, 'revenue', g.revenue, 'pts', g.pts)), '[]'::json)
        FROM (
          SELECT qu.plan, qu.price_arm, qu.price, qu.j->>'utm_source' AS src, qu.j->>'utm_medium' AS med,
                 (coalesce(qu.j->>'gclid', '') <> '' OR coalesce(qu.j->>'gbraid', '') <> '' OR coalesce(qu.j->>'wbraid', '') <> '') AS ads,
                 qu.j->>'referrer_host' AS ref, coalesce(qu.j->>'fbclid', '') <> '' AS fb,
                 qu.device, qu.tier, (qu.after_src OR (coalesce(qu.j->>'utm_source', '') <> '' OR coalesce(qu.j->>'utm_medium', '') <> ''
                 OR coalesce(qu.j->>'gclid', '') <> '' OR coalesce(qu.j->>'gbraid', '') <> '' OR coalesce(qu.j->>'wbraid', '') <> ''
                 OR coalesce(qu.j->>'fbclid', '') <> '' OR coalesce(qu.j->>'referrer_host', '') <> '')) AS src_known,
                 qu.pts,
                 count(DISTINCT qu.sid) AS quoted,
                 -- Saw the paywall (report_price_quote.paywall_reached_at), people as quoted is.
                 count(DISTINCT qu.sid) FILTER (WHERE qu.paywall_reached_at IS NOT NULL) AS paywall,
                 count(DISTINCT qu.sid) FILTER (WHERE qu.checkout_started_at IS NOT NULL) AS checkouts,
                 -- People, as quoted and checkouts are: one person paying twice is one sale here,
                 -- so the payment CVR (sales ÷ quoted) stays a share of people.
                 count(DISTINCT qu.sid) FILTER (WHERE qs.sales > 0) AS sales,
                 coalesce(sum(qs.revenue), 0) AS revenue
            FROM quotes qu
            LEFT JOIN quote_sales qs ON qs.id = qu.id
           GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
        ) g
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_facts(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_facts(date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.ap_report_extras(p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
  b AS (
    SELECT (p_from::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
           ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
  ),
  staff AS (SELECT id FROM ap_team_user),
  subs AS (
    SELECT s.id, s.created_date_time
      FROM survey_submission s, b
     WHERE s.status = 'completed'
       AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  moves AS (
    SELECT a.survey_submission_id AS sid, a.event_time,
           CASE WHEN (a.metadata->>'from_slide') ~ '^[0-5]$' THEN (a.metadata->>'from_slide')::int END AS from_slide,
           CASE WHEN (a.metadata->>'to_slide') ~ '^[0-5]$' THEN (a.metadata->>'to_slide')::int END AS to_slide,
           a.metadata->>'direction' AS direction
      FROM analytics_event a
     WHERE a.event_type = 'wizard_slide_advanced' AND a.survey_submission_id IN (SELECT id FROM subs)
  ),
  arrivals AS (
    SELECT s.id AS sid, 0 AS slide, s.created_date_time AS at FROM subs s
    UNION ALL
    SELECT m.sid, m.to_slide, min(m.event_time) FROM moves m WHERE m.direction = 'next' AND m.to_slide IS NOT NULL GROUP BY 1, 2
  ),
  leaves AS (
    SELECT m.sid, m.from_slide AS slide, min(m.event_time) AS at
      FROM moves m WHERE m.direction = 'next' AND m.from_slide IS NOT NULL GROUP BY 1, 2
  ),
  dwell AS (
    SELECT l.slide, extract(epoch FROM l.at - a.at) * 1000 AS ms
      FROM leaves l JOIN arrivals a ON a.sid = l.sid AND a.slide = l.slide
     WHERE l.at > a.at AND l.at - a.at < interval '30 minutes'
  ),
  wizard AS (
    SELECT sl.slide,
           (SELECT count(DISTINCT m.sid) FROM moves m WHERE m.direction = 'next' AND m.from_slide = sl.slide) AS went_on,
           (SELECT count(DISTINCT m.sid) FROM moves m WHERE m.direction = 'previous' AND m.from_slide = sl.slide) AS went_back,
           (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY d.ms) FROM dwell d WHERE d.slide = sl.slide) AS median_ms,
           (SELECT count(*) FROM dwell d WHERE d.slide = sl.slide) AS timed
      FROM generate_series(0, 5) AS sl(slide)
  ),
  votes AS (
    SELECT f.created_at, f.survey_submission_id AS sid, f.section_id, f.feedback, f.issue,
           (coalesce(btrim(f.comment), '') <> '') AS commented
      FROM report_section_feedback f, b
     WHERE f.created_at >= b.since_ts AND f.created_at < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM survey_submission s JOIN staff ON staff.id = s.user_id WHERE s.id = f.survey_submission_id)
  ),
  paywall_clicks AS (
    SELECT a.metadata->>'section_id' AS section_id, count(DISTINCT a.survey_submission_id) AS readers
      FROM analytics_event a
     WHERE a.event_type IN ('paywall_initiated', 'lock_icon_clicked')
       AND a.survey_submission_id IN (SELECT id FROM subs)
       AND coalesce(a.metadata->>'section_id', '') <> ''
     GROUP BY 1
  ),
  -- Reading per Report 3.0 chapter (report_chapter_stats): one row per save, holding only
  -- what changed since the save before, so a reader's rows add up. Readers who finished from
  -- the first day it was recorded only: an earlier reader's later visits would be part of their
  -- reading. Every value is checked before a cast: anyone with a CSRF cookie can post this
  -- metadata, and one bad cast would fail the whole page.
  chapter_start AS (
    SELECT (min(a.event_time) AT TIME ZONE 'Europe/Berlin')::date AS day
      FROM analytics_event a
     WHERE a.event_type = 'report_chapter_stats'
  ),
  chapter_reads AS (
    SELECT a.survey_submission_id AS sid, c.key AS section,
           -- Up to 30 minutes per reader and chapter: longer is mostly a tab left open.
           least(coalesce(sum(CASE WHEN c.value->>'ms' ~ '^[0-9]{1,8}$' THEN (c.value->>'ms')::int END), 0), 1800000) AS ms,
           coalesce(bool_or(c.value->>'open' ~ '^[1-9][0-9]{0,5}$'), false) AS opened,
           coalesce(bool_or(c.value->>'show_all' ~ '^[1-9][0-9]{0,5}$'), false) AS show_all,
           coalesce(bool_or(c.value->>'learn_more' ~ '^[1-9][0-9]{0,5}$'), false) AS learn_more,
           coalesce(bool_or(c.value->>'try_this' ~ '^[1-9][0-9]{0,5}$'), false) AS try_this,
           coalesce(bool_or(c.value->>'pw_seen' ~ '^[1-9][0-9]{0,5}$'), false) AS pw_seen,
           coalesce(bool_or(c.value->>'pw_click' ~ '^[1-9][0-9]{0,5}$'), false) AS pw_click
      FROM analytics_event a
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(a.metadata->'chapters') = 'object'
                                         THEN a.metadata->'chapters' ELSE '{}'::jsonb END) AS c
     WHERE a.event_type = 'report_chapter_stats'
       AND a.survey_submission_id IN (
             SELECT s.id FROM subs s, chapter_start cs
              WHERE s.created_date_time >= (cs.day::timestamp AT TIME ZONE 'Europe/Berlin'))
       AND jsonb_typeof(c.value) = 'object'
       AND c.key ~ '^[a-z][a-z0-9_]{0,79}$'
     GROUP BY 1, 2
  ),
  -- Reached: a second or more with the chapter on screen, or anything used in it. A paywall
  -- card that only scrolled into view is not use of the chapter (a click on it is).
  chapter_reached AS (
    SELECT r.* FROM chapter_reads r
     WHERE r.ms >= 1000 OR r.opened OR r.show_all OR r.learn_more OR r.try_this OR r.pw_click
  ),
  -- The paywall's own rate: of every reader whose card in the chapter came into view.
  chapter_paywall AS (
    SELECT r.section, count(*) FILTER (WHERE r.pw_seen) AS pw_seen,
           count(*) FILTER (WHERE r.pw_seen AND r.pw_click) AS pw_click
      FROM chapter_reads r
     GROUP BY r.section
  ),
  chapter_stats AS (
    SELECT r.section, count(*) AS reached, round(avg(r.ms)) AS ms_avg,
           -- The median reader's time (21 Oct 2026: medians, not averages, for times).
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.ms)) AS ms_median,
           count(*) FILTER (WHERE r.opened) AS opened,
           count(*) FILTER (WHERE r.show_all) AS show_all,
           count(*) FILTER (WHERE r.learn_more) AS learn_more,
           count(*) FILTER (WHERE r.try_this) AS try_this
      FROM chapter_reached r
     GROUP BY r.section
  ),
  -- The wizard's Skip Intro (wizard_skipped): who pressed it, by the slide (0-5) it was on.
  skips AS (
    SELECT CASE WHEN (a.metadata->>'from_slide') ~ '^[0-5]$' THEN (a.metadata->>'from_slide')::int END AS slide,
           a.survey_submission_id AS sid
      FROM analytics_event a
     WHERE a.event_type = 'wizard_skipped' AND a.survey_submission_id IN (SELECT id FROM subs)
  ),
  -- Every nurture send of a reader, whenever it was, and their next one: a return counts for
  -- the email it came after, not for every earlier email too.
  all_sends AS (
    SELECT st.stage, q.survey_submission_id AS sid,
           min(coalesce(
             (q.metadata->'nurturePromoCodes'->st.stage->>'expiresAt')::timestamptz - interval '24 hours',
             pr.created_date_time + CASE st.stage WHEN '6h_no_view' THEN interval '6 hours'
                                                  WHEN '6h_no_unlock' THEN interval '6 hours'
                                                  WHEN '30h_no_unlock' THEN interval '30 hours'
                                                  WHEN '54h_no_unlock' THEN interval '54 hours'
                                                  WHEN '72h_no_unlock' THEN interval '72 hours'
                                                  WHEN '78h_no_unlock' THEN interval '78 hours' END)) AS sent_at,
           bool_and((q.metadata->'nurturePromoCodes'->st.stage->>'expiresAt') IS NULL) AS estimated
      FROM report_price_quote q
      JOIN personal_report pr ON pr.id = q.personal_report_id
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(q.metadata->'nurtureEmailsSent') = 'array' THEN q.metadata->'nurtureEmailsSent' ELSE '[]'::jsonb END
      ) AS st(stage)
     GROUP BY 1, 2
  ),
  sends AS (
    SELECT x.stage, x.sid, x.sent_at, x.estimated,
           -- The reader's next email with a report link: the 78h call invite linked only to the
           -- booking page, so a return after it still came from the email before.
           (SELECT min(y.sent_at) FROM all_sends y
             WHERE y.sid = x.sid AND y.sent_at > x.sent_at AND y.stage <> '78h_no_unlock') AS next_at
      FROM all_sends x
     WHERE x.sent_at IS NOT NULL
  ),
  open_start AS (
    SELECT min(d.first_at) AS at
      FROM email_message_event d
     WHERE d.event_type = 'delivered'
       AND EXISTS (SELECT 1 FROM email_message_event o WHERE o.resend_id = d.resend_id AND o.event_type = 'opened')
  ),
  -- delivered, opened, clicked: the readers whose email had that event after it was sent, as the
  -- Resend webhook keeps it by the stage and submission the send tagged it with (from 14 Oct 2026).
  sent AS (
    SELECT se.stage, count(DISTINCT se.sid) AS n, count(DISTINCT a.survey_submission_id) AS returned,
           bool_or(se.estimated) AS estimated,
           count(DISTINCT m.survey_submission_id) FILTER (WHERE m.event_type = 'delivered') AS delivered,
           -- Opens and clicks only of emails known delivered: a lost delivery row would otherwise
           -- count an open over a smaller delivered count (over 100%).
           count(DISTINCT m.survey_submission_id) FILTER (
             WHERE m.event_type = 'opened'
               AND EXISTS (SELECT 1 FROM email_message_event d WHERE d.resend_id = m.resend_id AND d.event_type = 'delivered')
           ) AS opened,
           count(DISTINCT m.survey_submission_id) FILTER (
             WHERE m.event_type = 'clicked'
               AND EXISTS (SELECT 1 FROM email_message_event d WHERE d.resend_id = m.resend_id AND d.event_type = 'delivered')
           ) AS clicked,
           -- Delivered once emails carried the open image: what an open rate can be out of. The
           -- image goes in at send time, so tracking began no later than the delivery of the first
           -- email that was ever opened.
           count(DISTINCT m.survey_submission_id) FILTER (
             WHERE m.event_type = 'delivered' AND m.first_at >= (SELECT os.at FROM open_start os)
           ) AS delivered_opens
      FROM sends se
      CROSS JOIN b
      LEFT JOIN analytics_event a
        ON a.survey_submission_id = se.sid AND a.event_type = 'paywall_initiated'
       AND a.metadata->>'source' = 'offer_link' AND a.event_time >= se.sent_at
       AND (se.next_at IS NULL OR a.event_time < se.next_at)
      LEFT JOIN email_message_event m
        ON m.survey_submission_id = se.sid AND m.stage = se.stage AND m.first_at >= se.sent_at
     WHERE se.sent_at >= b.since_ts AND se.sent_at < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM survey_submission s JOIN staff ON staff.id = s.user_id WHERE s.id = se.sid)
     GROUP BY se.stage
  ),
  bought AS (
    SELECT coalesce(p.metadata->>'promoStage',
                    CASE p.metadata->>'couponName' WHEN 'Nurture 50% off (30h reminder)' THEN '30h_no_unlock'
                                                   WHEN 'Nurture 75% off (54h reminder)' THEN '54h_no_unlock' END) AS stage,
           count(*) AS n, sum(p.amount) AS revenue
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
      JOIN survey_submission s ON s.id = pr.survey_submission_id, b
     WHERE p.status = 'succeeded' AND coalesce(p.is_test, false) = false AND p.amount > 0
       AND coalesce(p.metadata->>'promoStage',
                    CASE p.metadata->>'couponName' WHEN 'Nurture 50% off (30h reminder)' THEN '30h_no_unlock'
                                                   WHEN 'Nurture 75% off (54h reminder)' THEN '54h_no_unlock' END) IS NOT NULL
       AND coalesce(p.payment_date_time, p.created_date_time) >= b.since_ts
       AND coalesce(p.payment_date_time, p.created_date_time) < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
     GROUP BY 1
  )
  SELECT json_build_object(
    'wizard', (SELECT coalesce(json_agg(json_build_object(
                 'slide', w.slide, 'went_on', w.went_on, 'went_back', w.went_back,
                 'median_ms', round(w.median_ms), 'timed', w.timed) ORDER BY w.slide), '[]'::json) FROM wizard w),
    'map_steppers', (SELECT coalesce(json_agg(DISTINCT a.survey_submission_id), '[]'::json)
                       FROM analytics_event a
                      WHERE a.event_type = 'wizard_map_step' AND a.metadata->>'control' IN ('next', 'previous')
                        AND a.survey_submission_id IN (SELECT id FROM subs)),
    'chapters', (SELECT coalesce(json_agg(json_build_object('section', c.section_id, 'up', c.up, 'down', c.down)), '[]'::json)
                   FROM (SELECT section_id, count(*) FILTER (WHERE feedback = 'up') AS up, count(*) FILTER (WHERE feedback = 'down') AS down
                           FROM votes GROUP BY section_id) c),
    'paywall_clicks', (SELECT coalesce(json_agg(json_build_object('section', pc.section_id, 'readers', pc.readers)), '[]'::json) FROM paywall_clicks pc),
    'chapter_stats', (SELECT coalesce(json_agg(json_build_object(
                        'section', coalesce(cs.section, cp.section), 'reached', coalesce(cs.reached, 0), 'ms_avg', cs.ms_avg,
                        'ms_median', cs.ms_median,
                        'opened', coalesce(cs.opened, 0), 'show_all', coalesce(cs.show_all, 0),
                        'learn_more', coalesce(cs.learn_more, 0), 'try_this', coalesce(cs.try_this, 0),
                        -- Clicked a paywall they had seen: the click rate is within those who saw one.
                        'pw_seen', coalesce(cp.pw_seen, 0), 'pw_click', coalesce(cp.pw_click, 0))
                        ORDER BY coalesce(cs.section, cp.section)), '[]'::json)
                        FROM chapter_stats cs FULL JOIN chapter_paywall cp ON cp.section = cs.section),
    -- Reach's denominator: the readers above who reached any chapter.
    'chapter_readers', (SELECT count(DISTINCT r.sid) FROM chapter_reached r),
    -- Of those readers, the ones with a chapter read saved before the slimmed report went live
    -- (22 Oct 2026, 18:48 Berlin): the readers the chapters it left out could reach.
    'chapter_readers_before_slim', (SELECT count(DISTINCT a.survey_submission_id)
                                      FROM analytics_event a
                                     WHERE a.event_type = 'report_chapter_stats'
                                       AND a.event_time < TIMESTAMPTZ '2026-10-22 16:48:00+00'
                                       AND a.survey_submission_id IN (SELECT r.sid FROM chapter_reached r)),
    -- Each of those readers' chapters reached: how far into the report they got (the page
    -- orders the chapters, as the report's nav does).
    'chapter_depth', (SELECT coalesce(json_agg(json_build_object('sid', d.sid, 'chapters', d.chapters)), '[]'::json)
                        FROM (SELECT r.sid, json_agg(r.section ORDER BY r.section) AS chapters
                                FROM chapter_reached r GROUP BY r.sid) d),
    'chapter_stats_from', (SELECT st.day FROM chapter_start st),
    'wizard_skips', (SELECT coalesce(json_agg(json_build_object('slide', k.slide, 'n', k.n, 'sids', k.sids) ORDER BY k.slide), '[]'::json)
                       FROM (SELECT x.slide, count(DISTINCT x.sid) AS n, array_agg(DISTINCT x.sid) AS sids
                               FROM skips x WHERE x.slide IS NOT NULL GROUP BY x.slide) k),
    'wizard_skips_from', (SELECT (min(a.event_time) AT TIME ZONE 'Europe/Berlin')::date
                            FROM analytics_event a WHERE a.event_type = 'wizard_skipped'),
    'issues', (SELECT coalesce(json_agg(json_build_object('issue', i.issue, 'n', i.n)), '[]'::json)
                 FROM (SELECT issue, count(*) AS n FROM votes WHERE feedback = 'down' AND issue IS NOT NULL GROUP BY issue) i),
    'feedback', (SELECT coalesce(json_agg(json_build_object(
                   'at', v.created_at, 'submission', v.sid, 'section', v.section_id, 'vote', v.feedback,
                   'issue', v.issue, 'commented', v.commented) ORDER BY v.created_at DESC), '[]'::json)
                   FROM (SELECT * FROM votes ORDER BY created_at DESC LIMIT 200) v),
    'votes_total', (SELECT count(*) FROM votes),
    'emails', (SELECT coalesce(json_agg(json_build_object('stage', x.stage, 'sent', x.sent, 'returned', x.returned,
                                                          'estimated', x.estimated,
                                                          'delivered', x.delivered, 'delivered_opens', x.delivered_opens,
                                                          'opened', x.opened, 'clicked', x.clicked,
                                                          'bought', x.bought, 'revenue', x.revenue)), '[]'::json)
                 FROM (SELECT coalesce(s.stage, bo.stage) AS stage, coalesce(s.n, 0) AS sent, coalesce(s.returned, 0) AS returned,
                              coalesce(s.estimated, false) AS estimated,
                              coalesce(s.delivered, 0) AS delivered, coalesce(s.delivered_opens, 0) AS delivered_opens,
                              coalesce(s.opened, 0) AS opened, coalesce(s.clicked, 0) AS clicked,
                              coalesce(bo.n, 0) AS bought, coalesce(bo.revenue, 0) AS revenue
                         FROM sent s FULL JOIN bought bo ON bo.stage = s.stage) x),
    -- The first Berlin day an email's own event was kept (deliveries and clicks count from it),
    -- and the first an open was: open tracking is switched on in Resend after the rest. Null
    -- until then.
    'email_events_from', (SELECT (min(m.first_at) AT TIME ZONE 'Europe/Berlin')::date FROM email_message_event m),
    'email_opens_from', (SELECT (os.at AT TIME ZONE 'Europe/Berlin')::date FROM open_start os)
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_report_extras(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_report_extras(date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.ap_question_answers(p_from date, p_to date, p_qid text, p_other text DEFAULT NULL)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
  b AS (
    SELECT (p_from::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
           ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
  ),
  subs AS (
    SELECT s.id, s.user_id, s.utm_tracker, s.session_id, s.posthog_session_id
      FROM survey_submission s, b
     WHERE s.status = 'completed'
       AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM ap_team_user t WHERE t.id = s.user_id)
  ),
  -- As ap_facts: a survey bought before it was taken (pay to start), for the Funnel filter.
  pts_subs AS (
    SELECT DISTINCT p.consumed_submission_id AS sid
      FROM prepaid_report_access p
     WHERE p.consumed_submission_id IS NOT NULL AND p.offer IS NOT NULL
       AND p.paid_at IS NOT NULL AND p.status IN ('succeeded', 'refunded')
  ),
  q AS (
    SELECT sq.id, sq.frontend_qid, sq.type
      FROM survey_question sq
     WHERE sq.frontend_qid IN (p_qid, p_other)
       AND (sq.type IN ('scale', 'single', 'multiple') OR sq.frontend_qid = '15001')
  ),
  answers AS (
    SELECT a.survey_submission_id AS sid, q.frontend_qid AS qid,
           CASE
             WHEN q.type = 'scale' THEN array[trim(to_char(a.normalized_value, 'FM999990'))]
             WHEN q.type = 'multiple' THEN (
               SELECT array_agg(ao.option_text ORDER BY ao.display_order, ao.id)
                 FROM survey_submission_answer_options o
                 JOIN answer_option ao ON ao.id = o.answer_option_id
                WHERE o.survey_submission_answer_id = a.id)
             WHEN a.answer_option_id IS NOT NULL THEN (SELECT array[ao.option_text] FROM answer_option ao WHERE ao.id = a.answer_option_id)
             WHEN q.frontend_qid = '15001' THEN array[a.answer_text]
           END AS vals
      FROM survey_submission_answer a
      JOIN q ON q.id = a.survey_question_id
     WHERE a.survey_submission_id IN (SELECT id FROM subs)
       AND coalesce(a.was_skipped, false) = false
  ),
  own_who AS (
    SELECT a.survey_submission_id AS sid,
           max(CASE WHEN sq.frontend_qid = '15010' THEN ao.option_text END) AS gender,
           max(CASE WHEN sq.frontend_qid = '15004' THEN ao.option_text END) AS relationship
      FROM survey_submission_answer a
      JOIN survey_question sq ON sq.id = a.survey_question_id AND sq.frontend_qid IN ('15010', '15004')
      LEFT JOIN answer_option ao ON ao.id = a.answer_option_id
     WHERE a.survey_submission_id IN (SELECT id FROM subs)
     GROUP BY 1
  ),
  -- As ap_facts: quotes a reminder job made (no browser, so "Desktop"): one plan alone, over an
  -- hour after the survey.
  cron_q AS (
    SELECT q.id
      FROM report_price_quote q
      JOIN survey_submission s ON s.id = q.survey_submission_id
     WHERE q.device_type = 'Desktop' AND s.id IN (SELECT id FROM subs)
       AND q.created_date_time > s.created_date_time + interval '1 hour'
       -- A quote someone used (the paywall seen, a checkout opened) was a person's.
       AND q.paywall_reached_at IS NULL AND q.checkout_started_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM report_price_quote o
                        WHERE o.survey_submission_id = q.survey_submission_id AND o.id <> q.id
                          AND o.created_date_time BETWEEN q.created_date_time - interval '5 minutes'
                                                      AND q.created_date_time + interval '5 minutes')
  )
  SELECT json_build_object(
    'rows', (
      SELECT coalesce(json_agg(json_build_object(
               'answer', mine.vals,
               'other', other.vals,
               'src', t.j->>'utm_source', 'med', t.j->>'utm_medium',
               'ads', (coalesce(t.j->>'gclid', '') <> '' OR coalesce(t.j->>'gbraid', '') <> '' OR coalesce(t.j->>'wbraid', '') <> ''),
               -- As ap_facts: the site a visit came from and Meta's click id (from 15 Oct 2026).
               'ref', t.j->>'referrer_host', 'fb', coalesce(t.j->>'fbclid', '') <> '',
               -- As ap_facts: the survey's own answers, the profile (a person's latest) only
               -- where it recorded none.
               'gender', coalesce(own.gender, up.gender), 'relationship', coalesce(own.relationship, up.relationship_status),
               -- As ap_facts: a tablet the survey steps flagged (told apart in ranges from 17 Oct
               -- 2026), else the reader's own price quotes' device (not a reminder job's), else
               -- the survey steps' (from 12 Oct 2026).
               'device', CASE WHEN p_from >= DATE '2026-10-17' AND EXISTS (SELECT 1 FROM survey_behavior_event e WHERE e.session_id = s.session_id AND e.is_tablet) THEN 'Tablet'
                 ELSE coalesce(
                   (SELECT q2.device_type FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.device_type IS NOT NULL
                       AND q2.id NOT IN (SELECT id FROM cron_q) ORDER BY q2.created_date_time DESC LIMIT 1),
                   (SELECT e.device_type FROM survey_behavior_event e WHERE e.session_id = s.session_id AND e.device_type IS NOT NULL ORDER BY e.created_at DESC LIMIT 1)) END,
               'tier', (SELECT q2.country_tier FROM report_price_quote q2 WHERE q2.survey_submission_id = s.id AND q2.country_tier IS NOT NULL ORDER BY q2.created_date_time DESC LIMIT 1),
               -- As ap_facts: the visit the survey was finished in, for the new/returning filter.
               'ph', s.posthog_session_id,
               'pts', s.id IN (SELECT sid FROM pts_subs)
             )), '[]'::json)
        FROM subs s
        JOIN answers mine ON mine.sid = s.id AND mine.qid = p_qid
        LEFT JOIN answers other ON other.sid = s.id AND other.qid = p_other
        LEFT JOIN own_who own ON own.sid = s.id
        LEFT JOIN app_user u ON u.id = s.user_id
        LEFT JOIN user_profile up ON up.id = u.user_profile_id,
        LATERAL (SELECT CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                              AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                         THEN s.utm_tracker::jsonb END AS j) t
       WHERE mine.vals IS NOT NULL
    ),
    'finished', (SELECT count(*) FROM subs)
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_question_answers(date, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_question_answers(date, date, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.ap_survey_steps(p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
  b AS (
    SELECT (p_from::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
           ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
  ),
  staff_sessions AS (
    SELECT s.session_id
      FROM survey_submission s
     WHERE s.user_id IN (SELECT id FROM ap_team_user) AND s.session_id IS NOT NULL
  ),
  -- The networks the team's own surveys came from: an unfinished run from one is the team
  -- testing, though it has no user (30 scripted runs on 4-5 Oct 2026), as ap_facts reads it.
  staff_ips AS (
    SELECT e.client_ip FROM survey_behavior_event e
     WHERE e.session_id IN (SELECT session_id FROM staff_sessions) AND e.client_ip IS NOT NULL
    UNION
    SELECT d.client_ip FROM survey_partial_save d
     WHERE d.session_id IN (SELECT session_id FROM staff_sessions) AND d.client_ip IS NOT NULL
  ),
  team_sessions AS (
    SELECT session_id FROM staff_sessions
    UNION
    SELECT DISTINCT e.session_id FROM survey_behavior_event e, b
     WHERE e.created_at >= b.since_ts AND e.created_at < b.until_ts AND e.session_id IS NOT NULL
       AND e.client_ip IN (SELECT client_ip FROM staff_ips)
       AND NOT EXISTS (SELECT 1 FROM survey_submission s WHERE s.session_id = e.session_id AND s.status = 'completed')
  ),
  -- Runs with steps in the range that began before it: a draft resumed in it, or a survey that
  -- ran past midnight into it. ap_facts dates a start by the run's first step, its draft's
  -- start or its submission's, so these are an earlier period's starts; counted here they
  -- reach later questions without the first ones, and a question would have more than the one
  -- before it (24 Oct 2026: three such runs in 10-23 Oct).
  earlier AS (
    SELECT w.session_id
      FROM (SELECT DISTINCT e.session_id FROM survey_behavior_event e, b
             WHERE e.created_at >= b.since_ts AND e.created_at < b.until_ts
               AND e.session_id IS NOT NULL) w, b
     WHERE EXISTS (SELECT 1 FROM survey_behavior_event e
                    WHERE e.session_id = w.session_id AND e.created_at < b.since_ts)
        OR EXISTS (SELECT 1 FROM survey_partial_save d
                    WHERE d.session_id = w.session_id AND d.started_at < b.since_ts)
        OR EXISTS (SELECT 1 FROM survey_submission s
                    WHERE s.session_id = w.session_id AND s.start_date_time < b.since_ts)
  ),
  -- Where a run began walking back out of the questions: the first of the Backs after its last
  -- forward (or complete) step. The browser's Back, pressed again and again or held, passes each
  -- question in a fraction of a second, and hiding the tab on the way records an abandon.
  walk AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.created_at, e.id
      FROM survey_behavior_event e, b
     WHERE e.created_at >= b.since_ts AND e.direction = 'back'
       AND e.question_index IS NOT NULL AND e.session_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM survey_behavior_event o
                        WHERE o.session_id = e.session_id AND o.question_index IS NOT NULL
                          AND o.direction IN ('forward', 'complete')
                          AND (o.created_at, o.id) > (e.created_at, e.id))
     ORDER BY e.session_id, e.created_at, e.id
  ),
  -- From a walk's first Back on, the run was leaving: none of its Backs is Went back, and after
  -- that first Back (its stay on the question it had got to) no step is a time on a question.
  ev AS (
    SELECT e.session_id, e.q_id, e.direction, e.answered,
           CASE WHEN e.time_spent_ms >= 0 AND e.time_spent_ms < 1800000 THEN e.time_spent_ms END AS ms,
           coalesce((e.created_at, e.id) >= (w.created_at, w.id), false) AS walking_out,
           coalesce((e.created_at, e.id) > (w.created_at, w.id), false) AS after_walk
      FROM survey_behavior_event e
      LEFT JOIN walk w ON w.session_id = e.session_id
      CROSS JOIN b
     WHERE e.created_at >= b.since_ts AND e.created_at < b.until_ts
       AND e.session_id IS NOT NULL AND e.q_id IS NOT NULL
       AND e.session_id NOT IN (SELECT session_id FROM team_sessions)
       AND e.session_id NOT IN (SELECT session_id FROM earlier)
  ),
  steps AS (
    SELECT q_id,
           count(DISTINCT session_id) FILTER (WHERE direction = 'back' AND NOT walking_out) AS went_back,
           count(DISTINCT session_id) FILTER (WHERE answered IS FALSE AND direction = 'forward') AS skipped,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY ms) FILTER (WHERE ms IS NOT NULL AND NOT after_walk) AS median_ms,
           count(ms) FILTER (WHERE NOT after_walk) AS timed
      FROM ev
     GROUP BY q_id
  ),
  last_step AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.q_id, e.created_at
      FROM survey_behavior_event e
     WHERE e.session_id IN (SELECT DISTINCT session_id FROM ev) AND e.q_id IS NOT NULL
     ORDER BY e.session_id, e.created_at DESC, e.id DESC
  ),
  done AS (
    SELECT DISTINCT e.session_id
      FROM survey_behavior_event e
     WHERE e.direction = 'complete' AND e.session_id IN (SELECT DISTINCT session_id FROM ev)
  ),
  -- The order each run was asked in, for runs begun once the opening-order test (C13) went
  -- live (6 Oct 2026, 20:46 Berlin; earlier ones were all asked the survey's order): its first
  -- six questions, by the place each had on its screen (question_index). Steps are saved in
  -- batches with one timestamp, so the time alone can't order them. The page tells the test's
  -- order from the survey's by them, so each order's funnel falls from one question to the next.
  orders AS (
    SELECT f.session_id, (array_agg(f.q_id ORDER BY f.first_idx, f.first_at, f.q_id))[1:6] AS qs
      FROM (SELECT e.session_id, e.q_id, min(e.question_index) AS first_idx,
                   min(e.created_at) AS first_at
              FROM survey_behavior_event e
             WHERE e.session_id IN (SELECT DISTINCT session_id FROM ev)
               AND e.q_id IS NOT NULL AND e.question_index IS NOT NULL
             GROUP BY 1, 2) f
     GROUP BY f.session_id
    HAVING min(f.first_at) >= TIMESTAMPTZ '2026-10-06 18:40:00+00'
  ),
  exits AS (
    SELECT l.q_id, (l.created_at AT TIME ZONE 'Europe/Berlin')::date AS day, count(*) AS n
      FROM last_step l, b
     WHERE l.created_at >= b.since_ts AND l.created_at < b.until_ts
       AND l.session_id NOT IN (SELECT session_id FROM done)
     GROUP BY 1, 2
  ),
  -- When each question was first asked, by anyone but the team: its first step, or its first
  -- answer in a finished survey (answers go back to the first survey, steps not as far). The
  -- page marks a question first asked during the range, and leaves out one first asked after
  -- it. The team tries a question before release (16016-16018: two team surveys on 18 Sep
  -- 2026, everyone else from 6 Oct), so its own runs and surveys are left out.
  first_asked AS (
    SELECT x.q_id, min(x.at) AS at
      FROM (SELECT e.q_id, min(e.created_at) AS at
              FROM survey_behavior_event e
             WHERE e.q_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM staff_sessions t WHERE t.session_id = e.session_id)
               AND NOT (coalesce(e.client_ip IN (SELECT client_ip FROM staff_ips), false)
                        AND NOT EXISTS (SELECT 1 FROM survey_submission s
                                         WHERE s.session_id = e.session_id AND s.status = 'completed'))
             GROUP BY 1
            UNION ALL
            SELECT sq.frontend_qid, min(coalesce(a.answered_at, a.created_date_time))
              FROM survey_submission_answer a
              JOIN survey_question sq ON sq.id = a.survey_question_id
              JOIN survey_submission s ON s.id = a.survey_submission_id
             WHERE sq.frontend_qid IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM ap_team_user t WHERE t.id = s.user_id)
             GROUP BY 1) x
     GROUP BY 1
  )
  SELECT json_build_object(
    'steps', (SELECT coalesce(json_agg(json_build_object(
                'q_id', s.q_id, 'went_back', s.went_back, 'skipped', s.skipped,
                'median_ms', round(s.median_ms), 'timed', s.timed)), '[]'::json) FROM steps s),
    'exits', (SELECT coalesce(json_agg(json_build_object('q_id', x.q_id, 'day', x.day, 'n', x.n)), '[]'::json) FROM exits x),
    -- Our own test runs, for the question table to leave out (get_survey_dropoff_runs keeps
    -- everyone, as the weekly drop-off report counts them).
    'staff', (SELECT coalesce(json_agg(DISTINCT x.session_id), '[]'::json) FROM team_sessions x),
    -- Runs begun before the range, for the question table to leave out likewise.
    'earlier', (SELECT coalesce(json_agg(DISTINCT x.session_id), '[]'::json) FROM earlier x),
    'orders', (SELECT coalesce(json_agg(json_build_object('s', o.session_id, 'q', o.qs)), '[]'::json) FROM orders o),
    'first_asked', (SELECT coalesce(json_object_agg(f.q_id, f.at), '{}'::json) FROM first_asked f)
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_survey_steps(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_survey_steps(date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.get_survey_dropoff_runs(since_ts timestamp with time zone, until_ts timestamp with time zone)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH win AS (
    -- Each question once, in the order the run was asked them: the place each had on its screen
    -- (question_index; steps saved in one batch share a timestamp). AP's question funnel follows
    -- a run along today's order from there; a set to everyone else.
    SELECT x.session_id, array_agg(x.q_id ORDER BY x.first_idx, x.first_at, x.q_id) AS reached
      FROM (SELECT e.session_id, e.q_id, min(e.question_index) AS first_idx,
                   min(e.created_at) AS first_at
              FROM survey_behavior_event e
             WHERE e.created_at >= since_ts
               AND e.created_at <  until_ts
               AND e.question_index IS NOT NULL
               AND e.session_id IS NOT NULL
               AND e.q_id IS NOT NULL
             GROUP BY e.session_id, e.q_id) x
     GROUP BY x.session_id
  ),
  last_event AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.q_id, e.created_at, e.device_type
      FROM survey_behavior_event e
     WHERE e.created_at >= since_ts
       AND e.question_index IS NOT NULL
       AND e.session_id IS NOT NULL
     ORDER BY e.session_id, e.created_at DESC, e.id DESC
  ),
  -- A run whose steps after its last forward (or complete) step went back was walking back out
  -- of the questions (the browser's Back, pressed again and again or held, passes each in a
  -- fraction of a second; a tab hidden on the way records an abandon): it left where that walk
  -- began, the question it had got to, not the one the walk ended on.
  walk AS (
    SELECT DISTINCT ON (e.session_id) e.session_id, e.q_id
      FROM survey_behavior_event e
     WHERE e.created_at >= since_ts AND e.direction = 'back'
       AND e.question_index IS NOT NULL AND e.session_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM survey_behavior_event o
                        WHERE o.session_id = e.session_id AND o.question_index IS NOT NULL
                          AND o.direction IN ('forward', 'complete')
                          AND (o.created_at, o.id) > (e.created_at, e.id))
     ORDER BY e.session_id, e.created_at, e.id
  ),
  finished AS (
    SELECT DISTINCT e.session_id
      FROM survey_behavior_event e
     WHERE e.direction = 'complete'
       AND e.created_at >= since_ts
       AND e.session_id IS NOT NULL
  ),
  started AS (
    SELECT e.session_id, min(e.created_at) AS started_at
      FROM survey_behavior_event e
      JOIN win w ON w.session_id = e.session_id
     GROUP BY e.session_id
  ),
  trackers AS (
    SELECT w.session_id,
           bool_or(t.has_row) AS has_row,
           bool_or(tracker_arm(t.tracker, 'gclid') <> 'unknown'
                OR tracker_arm(t.tracker, 'gbraid') <> 'unknown'
                OR tracker_arm(t.tracker, 'wbraid') <> 'unknown'
                -- Tagged google / cpc (ppc, paid, ads) too, as AP's sources read a visit.
                OR (lower(tracker_arm(t.tracker, 'utm_source')) = 'google'
                    AND lower(tracker_arm(t.tracker, 'utm_medium')) IN ('cpc', 'ppc', 'paid', 'ads'))) AS ads
      FROM win w
      LEFT JOIN LATERAL (
        SELECT s.utm_tracker AS tracker, true AS has_row
          FROM survey_submission s
         WHERE s.session_id = w.session_id
        UNION ALL
        SELECT d.utm_tracker, true
          FROM survey_partial_save d
         WHERE d.session_id = w.session_id
      ) t ON true
     GROUP BY w.session_id
  )
  SELECT coalesce(json_agg(json_build_object(
           'session_id', w.session_id,
           'started_at', st.started_at,
           'reached',    w.reached,
           'left_at',    CASE WHEN f.session_id IS NULL AND l.created_at < until_ts THEN coalesce(wk.q_id, l.q_id) END,
           'source',     CASE
                           WHEN coalesce(tr.ads, false) THEN 'google_ads'
                           WHEN coalesce(tr.has_row, false) THEN 'other'
                           ELSE 'unknown'
                         END,
           'device',     l.device_type,
           -- Their last step ever: a run still on a question isn't one that left it yet.
           'last_at',    l.created_at
         ) ORDER BY w.session_id), '[]'::json)
    FROM win w
    JOIN started st ON st.session_id = w.session_id
    LEFT JOIN last_event l ON l.session_id = w.session_id
    LEFT JOIN walk wk ON wk.session_id = w.session_id
    LEFT JOIN finished f ON f.session_id = w.session_id
    LEFT JOIN trackers tr ON tr.session_id = w.session_id;
$function$;

REVOKE ALL ON FUNCTION public.get_survey_dropoff_runs(timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_survey_dropoff_runs(timestamp with time zone, timestamp with time zone) TO service_role;

CREATE OR REPLACE FUNCTION public.ap_report_tour(p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
  b AS (
    SELECT (p_from::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
           ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
  ),
  staff AS (SELECT id FROM ap_team_user),
  subs AS (
    SELECT s.id, (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day
      FROM survey_submission s, b
     WHERE s.status = 'completed'
       AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  ev AS (
    SELECT a.id, a.survey_submission_id AS sid, a.event_type, a.metadata->>'audience' AS audience,
           CASE WHEN jsonb_typeof(a.metadata->'stops') = 'array' THEN a.metadata->'stops' ELSE '[]'::jsonb END AS stops
      FROM analytics_event a
     WHERE a.event_type IN ('tour_started', 'tour_completed', 'tour_skipped', 'tour_left')
       AND a.metadata->>'trigger' = 'auto'
       AND a.metadata->>'audience' IN ('free', 'paid')
       AND a.survey_submission_id IN (SELECT id FROM subs)
  ),
  by_reader AS (
    SELECT e.sid, e.audience,
           count(*) FILTER (WHERE e.event_type = 'tour_started') AS started,
           count(*) FILTER (WHERE e.event_type = 'tour_completed') AS completed,
           count(*) FILTER (WHERE e.event_type = 'tour_skipped') AS skipped,
           count(*) FILTER (WHERE e.event_type = 'tour_left') AS left_page
      FROM ev e
     GROUP BY 1, 2
  ),
  -- An end is placed on its stops only when every one of them is a known stop with whole
  -- numbers: a run is placed whole or not at all, so each stop's outcomes add up.
  ends AS (
    SELECT e.id, e.audience, e.event_type, e.stops
      FROM ev e
     WHERE e.event_type <> 'tour_started'
       AND jsonb_array_length(e.stops) BETWEEN 1 AND 5
       AND NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(e.stops) x
              WHERE coalesce(x->>'id', '') NOT IN ('chapter_menu', 'show_all', 'chapter_toggle', 'try_this', 'unlock')
                 OR coalesce(x->>'ms', '') !~ '^[0-9]{1,10}$'
                 OR coalesce(x->>'back', '') !~ '^[0-9]{1,4}$')
  ),
  placed AS (
    SELECT en.audience, en.event_type, x.value->>'id' AS stop,
           CASE WHEN x.value->>'ms' ~ '^[0-9]{1,10}$' THEN (x.value->>'ms')::bigint END AS ms,
           CASE WHEN x.value->>'back' ~ '^[0-9]{1,4}$' THEN (x.value->>'back')::int END AS back,
           x.ord = jsonb_array_length(en.stops) AS furthest
      FROM ends en
      CROSS JOIN LATERAL jsonb_array_elements(en.stops) WITH ORDINALITY AS x(value, ord)
  ),
  per_stop AS (
    SELECT p.audience, p.stop,
           count(*) AS reached,
           count(*) FILTER (WHERE NOT p.furthest OR p.event_type = 'tour_completed') AS went_on,
           count(*) FILTER (WHERE p.back > 0) AS went_back,
           count(*) FILTER (WHERE p.furthest AND p.event_type = 'tour_skipped') AS skipped,
           count(*) FILTER (WHERE p.furthest AND p.event_type = 'tour_left') AS exited,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY p.ms) FILTER (WHERE p.ms > 0 AND p.ms < 1800000) AS median_ms,
           count(*) FILTER (WHERE p.ms > 0 AND p.ms < 1800000) AS timed
      FROM placed p
     GROUP BY 1, 2
  )
  SELECT json_build_object(
    'days', (SELECT coalesce(json_agg(json_build_object(
               'day', d.day, 'audience', d.audience, 'readers', d.readers, 'runs', d.runs,
               'completed', d.completed, 'skipped', d.skipped, 'left', d.left_page, 'unended', d.unended)
               ORDER BY d.day, d.audience), '[]'::json)
               FROM (SELECT s.day, r.audience, count(*) AS readers,
                            sum(greatest(r.started, r.completed + r.skipped + r.left_page)) AS runs,
                            sum(r.completed) AS completed, sum(r.skipped) AS skipped, sum(r.left_page) AS left_page,
                            sum(greatest(0, r.started - r.completed - r.skipped - r.left_page)) AS unended
                       FROM by_reader r JOIN subs s ON s.id = r.sid
                      GROUP BY 1, 2) d),
    'stops', (SELECT coalesce(json_agg(json_build_object(
                'audience', st.audience, 'id', st.stop, 'reached', st.reached, 'next', st.went_on,
                'back', st.went_back, 'skip', st.skipped, 'exit', st.exited,
                'median_ms', round(st.median_ms), 'timed', st.timed) ORDER BY st.audience, st.stop), '[]'::json)
                FROM per_stop st),
    'placed', (SELECT coalesce(json_agg(json_build_object('audience', x.audience, 'runs', x.n) ORDER BY x.audience), '[]'::json)
                 FROM (SELECT en.audience, count(*) AS n FROM ends en GROUP BY 1) x)
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_report_tour(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_report_tour(date, date) TO service_role;

CREATE OR REPLACE FUNCTION public.ap_unlock_feedback(p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH
  b AS (
    SELECT (p_from::timestamp AT TIME ZONE 'Europe/Berlin') AS since_ts,
           ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Berlin') AS until_ts
  ),
  staff AS (SELECT id FROM ap_team_user),
  sent AS (
    SELECT uf.survey_submission_id AS sid, uf.subject_arm, uf.sent_at, uf.reason, uf.answered_at,
           uf.changed_at, uf.answer_loads, uf.chips, uf.note, uf.detail_at, uf.device,
           uf.already_paid, uf.unlocked_at, s.user_id,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j
      FROM unlock_feedback uf
      JOIN survey_submission s ON s.id = uf.survey_submission_id, b
     WHERE uf.sent_at >= b.since_ts AND uf.sent_at < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  -- Resend's events for these emails: the webhook keeps the first of each kind per email, by
  -- the stage and submission the send tagged it with. Not cut at sent_at: these times are
  -- Resend's, and a delivery can be stamped a moment before our own sent_at is written.
  ev AS (
    SELECT m.survey_submission_id AS sid,
           min(m.first_at) FILTER (WHERE m.event_type = 'delivered') AS delivered_at,
           min(m.first_at) FILTER (WHERE m.event_type = 'opened') AS opened_at,
           min(m.first_at) FILTER (WHERE m.event_type = 'clicked') AS clicked_at,
           min(m.first_at) FILTER (WHERE m.event_type = 'bounced') AS bounced_at
      FROM email_message_event m
     WHERE m.stage = 'unlock_feedback' AND m.survey_submission_id IN (SELECT sid FROM sent)
     GROUP BY 1
  ),
  -- Gender and age as ap_facts reads them (the profile, and question 15003's answer); the
  -- address only to find an unsubscribe below, never returned.
  who AS (
    SELECT s.sid, up.gender, lower(btrim(u.email)) AS addr
      FROM sent s
      JOIN app_user u ON u.id = s.user_id
      LEFT JOIN user_profile up ON up.id = u.user_profile_id
  ),
  age AS (
    SELECT DISTINCT ON (a.survey_submission_id) a.survey_submission_id AS sid, ao.option_text AS age
      FROM survey_submission_answer a
      JOIN survey_question sq ON sq.id = a.survey_question_id AND sq.frontend_qid = '15003'
      JOIN answer_option ao ON ao.id = a.answer_option_id
     WHERE a.survey_submission_id IN (SELECT sid FROM sent)
     ORDER BY a.survey_submission_id, a.id DESC
  ),
  -- The report's archetype, as ap_facts takes it.
  arch AS (
    SELECT DISTINCT ON (sr.survey_submission_id) sr.survey_submission_id AS sid,
           coalesce(sr.v5_primary_archetype, sr.primary_archetype) AS archetype
      FROM scoring_result sr
     WHERE sr.survey_submission_id IN (SELECT sid FROM sent)
     ORDER BY sr.survey_submission_id, sr.id DESC
  ),
  -- Unsubscribed through this email: the footer and one-click paths keep the campaign its link
  -- carried.
  unsub AS (
    SELECT lower(btrim(es.email)) AS addr, min(es.created_at) AS at
      FROM email_suppression es
     WHERE es.reason = 'unsubscribed' AND es.source_campaign = 'unlock_feedback'
     GROUP BY 1
  ),
  -- Each reader's first full unlock that was paid, when it was paid. This email's gift is a
  -- succeeded EUR 0 payment with metadata.source unlock_feedback (plan full_report), so never
  -- one of these.
  full_buys AS (
    SELECT pr.survey_submission_id AS sid, min(coalesce(p.payment_date_time, p.created_date_time)) AS at
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
     WHERE p.status = 'succeeded' AND coalesce(p.is_test, false) = false AND p.amount > 0
       AND p.metadata->>'plan' IN ('full_report', 'all_reports', 'core')
     GROUP BY 1
  ),
  gifts AS (
    SELECT pr.survey_submission_id AS sid, min(coalesce(p.payment_date_time, p.created_date_time)) AS at
      FROM payment p
      JOIN personal_report pr ON pr.id = p.personal_report_id
     WHERE p.status = 'succeeded' AND p.metadata->>'source' = 'unlock_feedback'
     GROUP BY 1
  ),
  -- A reader this email gifted the report to before they paid (All Reports, say) is not a
  -- reader who paid to unlock it: left out of the paid group. Nor is one who bought the full
  -- report before taking the survey (pay to start's full offer, claimed by a completed purchase
  -- as ap_facts reads it): their report came unlocked, never read locked first. One who bought
  -- the EUR 1.99 first read the rest locked, and their full unlock is a paid unlock like any.
  paid AS (
    SELECT fb.sid, fb.at, s.user_id,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j
      FROM full_buys fb
      JOIN survey_submission s ON s.id = fb.sid, b
     WHERE fb.at >= b.since_ts AND fb.at < b.until_ts
       AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
       AND NOT EXISTS (SELECT 1 FROM gifts g WHERE g.sid = fb.sid AND g.at < fb.at)
       AND NOT EXISTS (SELECT 1 FROM prepaid_report_access pa
                        WHERE pa.consumed_submission_id = fb.sid AND pa.offer = 'full'
                          AND pa.paid_at IS NOT NULL AND pa.status IN ('succeeded', 'refunded'))
  ),
  -- Both groups, each reader with the moment of their unlock. A reader can be in both (a free
  -- unlock, then All Reports bought): each is read from its own moment.
  unlocked AS (
    SELECT 'free'::text AS grp, s.sid, s.unlocked_at AS at, s.user_id
      FROM sent s
     WHERE s.unlocked_at IS NOT NULL AND NOT s.already_paid
    UNION ALL
    SELECT 'paid', p.sid, p.at, p.user_id FROM paid p
  ),
  -- Reading per chapter after the unlock: one row per save, holding only what changed since the
  -- save before, so a reader's rows add up. Every value is checked before a cast, as in
  -- ap_report_extras: anyone with a CSRF cookie can post this metadata.
  chapter_saves AS (
    SELECT un.grp, un.sid, a.event_time, c.key AS section,
           CASE WHEN c.value->>'ms' ~ '^[0-9]{1,8}$' THEN (c.value->>'ms')::int ELSE 0 END AS ms,
           (coalesce(c.value->>'open', '') ~ '^[1-9][0-9]{0,5}$'
             OR coalesce(c.value->>'show_all', '') ~ '^[1-9][0-9]{0,5}$'
             OR coalesce(c.value->>'learn_more', '') ~ '^[1-9][0-9]{0,5}$'
             OR coalesce(c.value->>'try_this', '') ~ '^[1-9][0-9]{0,5}$'
             OR coalesce(c.value->>'pw_seen', '') ~ '^[1-9][0-9]{0,5}$'
             OR coalesce(c.value->>'pw_click', '') ~ '^[1-9][0-9]{0,5}$') AS used
      FROM unlocked un
      JOIN analytics_event a
        ON a.survey_submission_id = un.sid AND a.event_type = 'report_chapter_stats'
       AND a.event_time >= un.at
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(a.metadata->'chapters') = 'object'
                                         THEN a.metadata->'chapters' ELSE '{}'::jsonb END) AS c
     WHERE jsonb_typeof(c.value) = 'object'
       AND c.key ~ '^[a-z][a-z0-9_]{0,79}$'
  ),
  -- A chapter is reached at the save where its time since the unlock first adds up to a second,
  -- or where something in it is first used.
  chapter_reach AS (
    SELECT x.grp, x.sid, x.section,
           min(x.event_time) FILTER (WHERE x.ms_so_far >= 1000 OR x.used_so_far) AS at
      FROM (SELECT y.grp, y.sid, y.section, y.event_time,
                   sum(y.ms) OVER w AS ms_so_far, bool_or(y.used) OVER w AS used_so_far
              FROM chapter_saves y
            WINDOW w AS (PARTITION BY y.grp, y.sid, y.section ORDER BY y.event_time
                         ROWS UNBOUNDED PRECEDING)) x
     GROUP BY 1, 2, 3
  ),
  reached AS (
    SELECT r.grp, r.sid, json_object_agg(r.section, r.at ORDER BY r.at) AS chapters
      FROM chapter_reach r
     WHERE r.at IS NOT NULL
     GROUP BY 1, 2
  ),
  reading AS (
    SELECT un.grp, un.sid,
           coalesce(sum(least(extract(epoch FROM rs.ended_at - rs.started_at), 1800) * 1000)
                      FILTER (WHERE rs.ended_at > rs.started_at AND rs.ended_at - rs.started_at < interval '4 hours'), 0)::bigint AS read_ms,
           count(*) FILTER (WHERE rs.ended_at > rs.started_at AND rs.ended_at - rs.started_at < interval '4 hours') AS closed
      FROM unlocked un
      JOIN personal_report pr ON pr.survey_submission_id = un.sid
      JOIN report_session rs ON rs.personal_report_id = pr.id AND rs.started_at >= un.at
     WHERE NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = rs.user_id)
     GROUP BY 1, 2
  ),
  votes AS (
    SELECT un.grp, un.sid,
           count(*) FILTER (WHERE f.feedback = 'up') AS ups,
           count(*) FILTER (WHERE f.feedback = 'down') AS downs
      FROM unlocked un
      JOIN report_section_feedback f ON f.survey_submission_id = un.sid AND f.created_at >= un.at
     GROUP BY 1, 2
  ),
  shared AS (
    SELECT un.grp, un.sid
      FROM unlocked un
      JOIN personal_report pr ON pr.survey_submission_id = un.sid
      JOIN report_share x ON x.personal_report_id = pr.id AND x.created_at >= un.at
    UNION
    SELECT un.grp, un.sid
      FROM unlocked un
      JOIN app_user u ON u.id = un.user_id
      JOIN invite_event i ON lower(i.referrer_email) = lower(u.email) AND i.created_at >= un.at
  ),
  after_unlock AS (
    SELECT un.grp, un.sid,
           json_build_object(
             'reached', coalesce(r.chapters, '{}'::json),
             'read_ms', coalesce(rd.read_ms, 0), 'closed', coalesce(rd.closed, 0),
             'ups', coalesce(v.ups, 0), 'downs', coalesce(v.downs, 0),
             'shared', (sh.sid IS NOT NULL)) AS j
      FROM unlocked un
      LEFT JOIN reached r ON r.grp = un.grp AND r.sid = un.sid
      LEFT JOIN reading rd ON rd.grp = un.grp AND rd.sid = un.sid
      LEFT JOIN votes v ON v.grp = un.grp AND v.sid = un.sid
      LEFT JOIN shared sh ON sh.grp = un.grp AND sh.sid = un.sid
  )
  SELECT json_build_object(
    'rows', (
      SELECT coalesce(json_agg(json_build_object(
               'day', (s.sent_at AT TIME ZONE 'Europe/Berlin')::date,
               'arm', s.subject_arm, 'sent_at', s.sent_at,
               'src', s.j->>'utm_source', 'med', s.j->>'utm_medium',
               'delivered_at', ev.delivered_at, 'opened_at', ev.opened_at,
               'clicked_at', ev.clicked_at, 'bounced_at', ev.bounced_at,
               'reason', s.reason, 'answered_at', s.answered_at, 'changed_at', s.changed_at,
               'loads', s.answer_loads, 'chips', s.chips, 'note', s.note, 'detail_at', s.detail_at,
               'device', s.device, 'already_paid', s.already_paid, 'unlocked_at', s.unlocked_at,
               'gender', who.gender, 'age', age.age, 'archetype', arch.archetype,
               'unsub_at', us.at, 'after', af.j
             ) ORDER BY s.sent_at), '[]'::json)
        FROM sent s
        LEFT JOIN ev ON ev.sid = s.sid
        LEFT JOIN who ON who.sid = s.sid
        LEFT JOIN age ON age.sid = s.sid
        LEFT JOIN arch ON arch.sid = s.sid
        LEFT JOIN unsub us ON us.addr = who.addr
        LEFT JOIN after_unlock af ON af.grp = 'free' AND af.sid = s.sid
    ),
    'paid', (
      SELECT coalesce(json_agg(json_build_object(
               'day', (p.at AT TIME ZONE 'Europe/Berlin')::date,
               'src', p.j->>'utm_source', 'med', p.j->>'utm_medium', 'after', af.j
             ) ORDER BY p.at), '[]'::json)
        FROM paid p
        JOIN after_unlock af ON af.grp = 'paid' AND af.sid = p.sid
    ),
    'first_sent', (
      SELECT (min(uf.sent_at) AT TIME ZONE 'Europe/Berlin')::date
        FROM unlock_feedback uf
        JOIN survey_submission s ON s.id = uf.survey_submission_id
       WHERE NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_unlock_feedback(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_unlock_feedback(date, date) TO service_role;

-- The data catalog's notes may now be kept on Search Console's tables too.
ALTER TABLE public.admin_field_note DROP CONSTRAINT IF EXISTS admin_field_note_source_check;
ALTER TABLE public.admin_field_note ADD CONSTRAINT admin_field_note_source_check
  CHECK (source = ANY (ARRAY['production'::text, 'posthog'::text, 'ga4'::text, 'ads'::text, 'gsc'::text]));

-- PostgREST serves the new view (the pages read the team from it).
NOTIFY pgrst, 'reload schema';

COMMIT;
