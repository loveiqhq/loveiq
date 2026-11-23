-- AP-Analytics: Survey 2.0's short guide (Mark's Pre Survey Wizard, 23 Nov 2026), read as ap_facts
-- reads the intro, so the Survey page can show its cards the same way: per day and step, the
-- visitors who reached it, each one's time to the next card, those who went on to it that day and
-- those whose furthest card it was (they left there). Back and Skip are steps of their own.
--
--   guide_card_1..3       the three cards; then consent_view and survey_engine_mount (question 1)
--   guide_back_2..3       went back from card N (counted only before question 1, as the intro's)
--   guide_skip_1..3       pressed Skip Intro on card N (card 3's lands on the consent: not going on)
--   consent_back          went back from the consent
--
-- Only the visitors who saw a guide card that day: its consent and question 1 rows are theirs
-- alone. ap_facts counts every visitor's consent (a guide visitor there reads as "direct", having
-- seen no intro), so the page takes these rows out of the intro's consent row
-- (features/admin/server/ap/guide.ts, withoutGuide).
--
-- A new function beside ap_facts, which stays as it is. Reads funnel_event only (the steps
-- 20261123130000 allows). Rollback: supabase/rollbacks/20261123140000_ap_guide_facts_down.sql

CREATE OR REPLACE FUNCTION public.ap_guide_facts(p_from date, p_to date)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH guide_cards (step, card) AS (
    VALUES ('guide_card_1', 1), ('guide_card_2', 2), ('guide_card_3', 3),
           ('consent_view', 4), ('survey_engine_mount', 5)
  ),
  -- The visitors who saw the short guide, per day.
  guided AS (
    SELECT DISTINCT f.visitor_id, f.day
      FROM funnel_event f
     WHERE f.event_type IN ('guide_card_1', 'guide_card_2', 'guide_card_3')
       AND f.day >= p_from AND f.day <= p_to
  ),
  steps AS (
    SELECT f.visitor_id, f.day, f.event_type, f.first_seen
      FROM funnel_event f
      JOIN guided g ON g.visitor_id = f.visitor_id AND g.day = f.day
     WHERE f.event_type IN ('guide_card_1', 'guide_card_2', 'guide_card_3', 'consent_view',
                            'survey_engine_mount', 'guide_back_2', 'guide_back_3',
                            'guide_skip_1', 'guide_skip_2', 'guide_skip_3', 'consent_back')
       AND f.day >= p_from AND f.day <= p_to
  ),
  -- Per visitor and day, the furthest card reached is where they left, unless it is question 1.
  guide_last AS (
    SELECT s.visitor_id, s.day, max(c.card) AS card
      FROM steps s
      JOIN guide_cards c ON c.step = s.event_type
     GROUP BY 1, 2
  ),
  guide AS (
    SELECT f.day, f.event_type AS step,
           -- A Back after reaching question 1 that day is the browser's Back leaving the questions
           -- through the guide's pages, not a card read again: a Back counts only before question 1.
           count(*) FILTER (WHERE qb.visitor_id IS NULL OR qb.first_seen > f.first_seen) AS n,
           coalesce(array_agg(round(extract(epoch FROM nx.first_seen - f.first_seen) * 1000)::bigint)
                      FILTER (WHERE nx.first_seen > f.first_seen AND s3.visitor_id IS NULL), '{}') AS ms,
           -- Skip Intro on card 3 also lands on the consent: that is a skip, not going on.
           count(nx.visitor_id) FILTER (WHERE s3.visitor_id IS NULL) AS went_on,
           count(*) FILTER (WHERE l.card = c.card) AS exited
      FROM steps f
      LEFT JOIN guide_cards c ON c.step = f.event_type
      LEFT JOIN funnel_event nx
        ON nx.visitor_id = f.visitor_id AND nx.day = f.day
       AND nx.event_type = CASE f.event_type
                             WHEN 'guide_card_1' THEN 'guide_card_2'
                             WHEN 'guide_card_2' THEN 'guide_card_3'
                             WHEN 'guide_card_3' THEN 'consent_view'
                             WHEN 'consent_view' THEN 'survey_engine_mount'
                           END
      LEFT JOIN guide_last l ON l.visitor_id = f.visitor_id AND l.day = f.day
      LEFT JOIN funnel_event s3
        ON f.event_type = 'guide_card_3' AND s3.visitor_id = f.visitor_id AND s3.day = f.day
       AND s3.event_type = 'guide_skip_3'
      LEFT JOIN funnel_event qb
        ON f.event_type IN ('guide_back_2', 'guide_back_3', 'consent_back')
       AND qb.visitor_id = f.visitor_id AND qb.day = f.day AND qb.event_type = 'survey_engine_mount'
     GROUP BY 1, 2
  )
  SELECT coalesce(json_agg(json_build_object('day', x.day, 'step', x.step, 'n', x.n, 'ms', x.ms,
                                             'wentOn', x.went_on, 'left', x.exited)), '[]'::json)
    FROM guide x;
$function$;

REVOKE ALL ON FUNCTION public.ap_guide_facts(date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ap_guide_facts(date, date) TO service_role;

NOTIFY pgrst, 'reload schema';
