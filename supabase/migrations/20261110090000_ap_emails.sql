-- AP-Analytics' Emails pages (Marcus's design, LoveIQ Sync 5 and 9 Nov 2026): every email we
-- send, how many arrive, get opened and clicked, and how many readers did what the email was
-- sent for, per email and per version.
--
-- 1. email_message_event.variant: the A/B version an email was sent as (its `arm` tag), so a
--    test's versions can be compared per reader, conversions included, not only as Resend's daily
--    tallies (email_experiment_event). Null for an email that is not in a test. Nullable with a
--    CHECK and no default: no rewrite, a quick scan of a small table.
-- 2. ap_emails(p_from, p_to, p_goals): one read per range for the page, every rule in
--    features/admin/server/ap/emails.ts:
--    - msgs: each email with an event in the range, kept per reader (the stage and sub tags,
--      app/api/resend/webhook): when it was sent (its `sent` event; the first event for an email
--      sent before `sent` was kept), delivered, opened, clicked, bounced and complained, the
--      reader's survey tracker (our own probes are left out by the page), and the first time the
--      reader did what the email was sent for within 7 days of it (the goal, by stage, from
--      p_goals). The team's readers (ap_team_user) are left out here.
--    - tallies: Resend's daily counts per test version (email_experiment_event), for the emails
--      no reader can be named for (survey paused goes to an unfinished survey).
--    - unsubs: unsubscribes per campaign and day, the team's addresses left out.
--    - finished: finished surveys per day and tracker, the base for "% of submissions".
--    Addresses are read only to leave the team out and to match an invite to its reader; none is
--    returned.
-- Rollback: supabase/rollbacks/20261110090000_ap_emails_down.sql.

ALTER TABLE public.email_message_event
  ADD COLUMN IF NOT EXISTS variant text
  CONSTRAINT email_message_event_variant_check CHECK (variant ~ '^[A-Za-z0-9_-]{1,16}$');

COMMENT ON TABLE public.email_message_event IS
  'Each email''s sending, delivery, opens, clicks, bounce and spam complaint, kept per reader: the first of each kind per email, from the Resend webhook, by the stage, submission and version the send tagged it with. Ids and a time only, never the address, IP, user agent or the link clicked.';
COMMENT ON COLUMN public.email_message_event.event_type IS
  'sent, delivered, opened, clicked, bounced or complained.';
COMMENT ON COLUMN public.email_message_event.stage IS
  'Which email, as its campaign: report_ready, unlock_feedback, 72h_no_unlock, initial_gift…';
COMMENT ON COLUMN public.email_message_event.variant IS
  'The A/B version it was sent as (its arm tag): a, b, c or A–D; null outside a test.';

CREATE OR REPLACE FUNCTION public.ap_emails(p_from date, p_to date, p_goals jsonb DEFAULT '{}'::jsonb)
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
  -- Every email with an event in the range, with all of its events: an email sent before the
  -- range can be opened in it.
  touched AS (
    SELECT DISTINCT m.resend_id
      FROM email_message_event m, b
     WHERE m.first_at >= b.since_ts AND m.first_at < b.until_ts
  ),
  ev AS (
    SELECT m.resend_id,
           max(m.stage) AS stage,
           max(m.variant) AS variant,
           max(m.survey_submission_id) AS sid,
           min(m.first_at) FILTER (WHERE m.event_type = 'sent') AS sent_ev_at,
           min(m.first_at) AS first_at,
           min(m.first_at) FILTER (WHERE m.event_type = 'delivered') AS delivered_at,
           min(m.first_at) FILTER (WHERE m.event_type = 'opened') AS opened_at,
           min(m.first_at) FILTER (WHERE m.event_type = 'clicked') AS clicked_at,
           min(m.first_at) FILTER (WHERE m.event_type = 'bounced') AS bounced_at,
           min(m.first_at) FILTER (WHERE m.event_type = 'complained') AS complained_at
      FROM email_message_event m
     WHERE m.resend_id IN (SELECT resend_id FROM touched)
     GROUP BY m.resend_id
  ),
  -- The unlock question's own send log: its sends Resend refused (an address on Resend's own
  -- list) left no event, and its subject version is kept there from its first send.
  uf_log AS (
    SELECT uf.resend_id, uf.sent_at, uf.subject_arm, uf.survey_submission_id AS sid
      FROM unlock_feedback uf, b
     WHERE uf.resend_id IS NOT NULL AND uf.sent_at IS NOT NULL
       AND (uf.resend_id IN (SELECT resend_id FROM touched)
            OR (uf.sent_at >= b.since_ts AND uf.sent_at < b.until_ts))
  ),
  -- When it was sent: Resend's `sent` (kept from 10 Nov 2026), else the email's own log, else its
  -- first event (a delivery comes seconds after the send).
  msg AS (
    SELECT coalesce(e.resend_id, u.resend_id) AS resend_id,
           coalesce(e.stage, 'unlock_feedback') AS stage,
           coalesce(e.variant, u.subject_arm) AS variant,
           coalesce(e.sid, u.sid) AS sid,
           coalesce(e.sent_ev_at, u.sent_at, e.first_at) AS sent_at,
           e.delivered_at, e.opened_at, e.clicked_at, e.bounced_at, e.complained_at
      FROM ev e
      FULL JOIN uf_log u ON u.resend_id = e.resend_id
  ),
  readers AS (
    SELECT g.*, s.user_id, p_goals->>g.stage AS goal,
           CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                     AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                THEN s.utm_tracker::jsonb END AS j
      FROM msg g
      JOIN survey_submission s ON s.id = g.sid
     WHERE NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
  ),
  -- The goal, once, in the 7 days after the send. A report opened (a session, not the team's own
  -- look at it), a paid purchase (EUR 0 gifts and codes are no purchase), the unlock question
  -- answered (its reason too: the page counts an answer as that page does), an invite sent, the
  -- report shared.
  goals AS (
    SELECT r.resend_id,
           CASE r.goal
             WHEN 'open_report' THEN (
               SELECT min(rs.started_at)
                 FROM personal_report pr
                 JOIN report_session rs ON rs.personal_report_id = pr.id
                WHERE pr.survey_submission_id = r.sid
                  AND rs.started_at >= r.sent_at AND rs.started_at < r.sent_at + interval '7 days'
                  AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = rs.user_id))
             WHEN 'buy_full' THEN (
               SELECT min(coalesce(p.payment_date_time, p.created_date_time))
                 FROM personal_report pr
                 JOIN payment p ON p.personal_report_id = pr.id
                WHERE pr.survey_submission_id = r.sid
                  AND p.status = 'succeeded' AND coalesce(p.is_test, false) = false AND p.amount > 0
                  AND p.metadata->>'plan' IN ('full_report', 'all_reports')
                  AND coalesce(p.payment_date_time, p.created_date_time) >= r.sent_at
                  AND coalesce(p.payment_date_time, p.created_date_time) < r.sent_at + interval '7 days')
             WHEN 'buy_core' THEN (
               SELECT min(coalesce(p.payment_date_time, p.created_date_time))
                 FROM personal_report pr
                 JOIN payment p ON p.personal_report_id = pr.id
                WHERE pr.survey_submission_id = r.sid
                  AND p.status = 'succeeded' AND coalesce(p.is_test, false) = false AND p.amount > 0
                  AND p.metadata->>'plan' = 'initial'
                  AND coalesce(p.payment_date_time, p.created_date_time) >= r.sent_at
                  AND coalesce(p.payment_date_time, p.created_date_time) < r.sent_at + interval '7 days')
             WHEN 'answer' THEN (
               SELECT min(uf.answered_at)
                 FROM unlock_feedback uf
                WHERE uf.survey_submission_id = r.sid
                  AND uf.answered_at >= r.sent_at AND uf.answered_at < r.sent_at + interval '7 days')
             WHEN 'invite' THEN (
               SELECT min(i.created_at)
                 FROM app_user u
                 JOIN invite_event i ON lower(btrim(i.referrer_email)) = lower(btrim(u.email))
                WHERE u.id = r.user_id
                  AND i.created_at >= r.sent_at AND i.created_at < r.sent_at + interval '7 days')
             WHEN 'share' THEN (
               SELECT min(x.created_at)
                 FROM personal_report pr
                 JOIN report_share x ON x.personal_report_id = pr.id
                WHERE pr.survey_submission_id = r.sid
                  AND x.created_at >= r.sent_at AND x.created_at < r.sent_at + interval '7 days')
           END AS goal_at,
           CASE WHEN r.goal = 'answer' THEN (
             SELECT uf.reason FROM unlock_feedback uf
              WHERE uf.survey_submission_id = r.sid AND uf.answered_at IS NOT NULL
              ORDER BY uf.answered_at LIMIT 1)
           END AS goal_reason
      FROM readers r
  ),
  team_addr AS (
    SELECT lower(btrim(u.email)) AS addr
      FROM app_user u
     WHERE u.id IN (SELECT id FROM staff)
  )
  SELECT json_build_object(
    'msgs', (
      SELECT coalesce(json_agg(json_build_object(
               'stage', r.stage, 'variant', r.variant, 'sent_at', r.sent_at,
               'delivered_at', r.delivered_at, 'opened_at', r.opened_at,
               'clicked_at', r.clicked_at, 'bounced_at', r.bounced_at,
               'complained_at', r.complained_at,
               'src', r.j->>'utm_source', 'med', r.j->>'utm_medium',
               'goal_at', g.goal_at, 'goal_reason', g.goal_reason
             ) ORDER BY r.sent_at), '[]'::json)
        FROM readers r
        JOIN goals g ON g.resend_id = r.resend_id
    ),
    'tallies', (
      SELECT coalesce(json_agg(json_build_object(
               'experiment', t.experiment, 'arm', t.arm, 'day', t.day,
               'event', t.event_type, 'n', t.n
             ) ORDER BY t.day, t.experiment, t.arm, t.event_type), '[]'::json)
        FROM email_experiment_event t
       WHERE t.day >= p_from AND t.day <= p_to
    ),
    'unsubs', (
      SELECT coalesce(json_agg(json_build_object('campaign', x.campaign, 'day', x.day, 'n', x.n)
                               ORDER BY x.day, x.campaign), '[]'::json)
        FROM (
          SELECT es.source_campaign AS campaign,
                 (es.created_at AT TIME ZONE 'Europe/Berlin')::date AS day,
                 count(*) AS n
            FROM email_suppression es, b
           WHERE es.reason = 'unsubscribed'
             AND es.created_at >= b.since_ts AND es.created_at < b.until_ts
             AND NOT EXISTS (SELECT 1 FROM team_addr t WHERE t.addr = lower(btrim(es.email)))
             AND split_part(lower(btrim(es.email)), '@', 2) <> 'loveiq.org'
           GROUP BY 1, 2
        ) x
    ),
    'finished', (
      SELECT coalesce(json_agg(json_build_object('day', f.day, 'src', f.src, 'med', f.med, 'n', f.n)
                               ORDER BY f.day), '[]'::json)
        FROM (
          SELECT (s.created_date_time AT TIME ZONE 'Europe/Berlin')::date AS day,
                 CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                           AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                      THEN s.utm_tracker::jsonb->>'utm_source' END AS src,
                 CASE WHEN s.utm_tracker IS NOT NULL AND pg_input_is_valid(s.utm_tracker, 'jsonb')
                           AND jsonb_typeof(s.utm_tracker::jsonb) = 'object'
                      THEN s.utm_tracker::jsonb->>'utm_medium' END AS med,
                 count(*) AS n
            FROM survey_submission s, b
           WHERE s.status = 'completed'
             AND s.created_date_time >= b.since_ts AND s.created_date_time < b.until_ts
             AND NOT EXISTS (SELECT 1 FROM staff WHERE staff.id = s.user_id)
           GROUP BY 1, 2, 3
        ) f
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.ap_emails(date, date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_emails(date, date, jsonb) TO service_role;

COMMENT ON FUNCTION public.ap_emails(date, date, jsonb) IS
  'AP-Analytics Emails pages: each email kept per reader with an event in the range (team left out, goal within 7 days of the send by p_goals {stage: open_report|buy_full|buy_core|answer|invite|share}), Resend''s daily tallies per test version, unsubscribes per campaign and day, and finished surveys per day. No address is returned.';
