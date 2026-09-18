-- c13_arm(session_id) — the C13 opening-order arm, computed in SQL.
--
-- WHY THIS IS NEEDED. C13's readout is a completion RATE by arm, and a rate needs a
-- denominator. The arm is stamped onto `survey_submission.utm_tracker`, which exists only
-- for people who FINISHED — so the numerator was available and the denominator was not.
-- Nothing on the start side (`survey_partial_save`, `survey_behavior_event`,
-- `funnel_event`) carries the arm; the previous experiment had one
-- (`survey_behavior_event.email_position`, last written 2026-08-16) and C13 has no
-- equivalent. Without this the experiment runs but cannot be read.
--
-- Every one of those tables does store `session_id`, and the arm is a pure function of it,
-- so nothing had to be captured differently — it only had to be derivable here.
--
-- FNV-1a, 32-bit, over 'c13-opening-order:' || session_id, matching
-- `assignQuestionOrderArm` in shared/experiments/questionOrderArm.ts exactly. Verified
-- against the TypeScript over 300 real session ids: identical arm for all 300
-- (md5 of the sorted "sid:arm" payload agreed, d410933…). A readout that disagreed with
-- what respondents actually saw would be worse than no readout, which is why the check
-- compares the whole payload rather than a count.
--
-- IMMUTABLE: the same session id always gives the same arm, so this is indexable and
-- safe in any query. search_path is pinned (the linter flags mutable ones).
CREATE OR REPLACE FUNCTION public.c13_arm(session_id text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $function$
DECLARE
  s TEXT;
  h BIGINT := 2166136261;  -- 0x811c9dc5
  i INT;
BEGIN
  -- No session id means control, matching the client: a respondent we cannot slice is
  -- shown the current order rather than an unattributable variant.
  IF session_id IS NULL OR btrim(session_id) = '' THEN
    RETURN 'control';
  END IF;

  s := 'c13-opening-order:' || session_id;

  FOR i IN 1..length(s) LOOP
    h := ((h # ascii(substr(s, i, 1))) * 16777619) % 4294967296;  -- 0x01000193, mod 2^32
  END LOOP;

  RETURN CASE WHEN h % 2 = 0 THEN 'control' ELSE 'variant' END;
END;
$function$;

COMMENT ON FUNCTION public.c13_arm(text) IS
  'C13 opening-order arm for a survey session id. Mirrors assignQuestionOrderArm in shared/experiments/questionOrderArm.ts. Use for the START side of the experiment (survey_partial_save, survey_behavior_event); completions can also read the stamp via tracker_arm(utm_tracker, ''question_order_arm'').';
