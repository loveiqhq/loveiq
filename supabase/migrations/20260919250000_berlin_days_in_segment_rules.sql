-- The saved-segment rule builder resolved "on this day" in UTC too.
--
-- `admin_segment_where_clause` turns an admin's saved-segment rules into a WHERE
-- clause. For a TIMESTAMP field it emitted, among six operators:
--
--     (created_date_time >= '2026-09-19'::date
--      AND created_date_time < ('2026-09-19'::date + interval '1 day'))
--
-- A timestamptz compared against a date implicitly widens the date at the SESSION
-- TimeZone, which is UTC on the pooler. So "submissions on 19 Sep" actually
-- selected 02:00 Berlin on the 19th to 02:00 Berlin on the 20th — the first two
-- hours of the chosen day missing, and two hours of the next day pulled in.
--
-- `timestamp AT TIME ZONE 'Europe/Berlin'` is the correct widening: it reads the
-- naive timestamp AS Berlin local time and returns the instant. (The identically
-- spelled `timestamptz AT TIME ZONE z` runs the other way and would be wrong here;
-- the two differ only by operand type, which is why this class of bug is quiet.)
--
-- Live: called by get_segment_match_count, admin_segment_match_count_scalar and
-- get_segment_metrics_by_rules — the saved-segment path of /admin comparisons.
--
-- Not reached by this fix, deliberately: the `%L::timestamptz` operators in the
-- same CASE. Those take a full timestamp string, and the admin UI's date inputs
-- are `<input type="date">`, so they only ever emit YYYY-MM-DD and always land in
-- the ::date branch above. An offset-bearing ISO string through ::timestamptz is
-- already unambiguous. Left alone on that evidence rather than on assumption.

DO $migration$
DECLARE
  src TEXT;
  next TEXT;
  n INT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
    FROM pg_proc p JOIN pg_namespace n2 ON n2.oid = p.pronamespace
   WHERE n2.nspname = 'public' AND p.proname = 'admin_segment_where_clause' AND p.prokind = 'f';
  IF src IS NULL THEN RAISE EXCEPTION 'admin_segment_where_clause not found'; END IF;

  SELECT count(*) INTO n FROM regexp_matches(src, $pat$(%(?:\d+\$)?L)::date$pat$, 'g');
  -- 8, not 6: the "on this day" and "not on this day" operators each spell
  -- %2$L::date twice, once bare as the lower bound and once inside the +1 day
  -- upper bound. Counting the six affected LINES instead of the eight casts is
  -- what this guard caught on the first attempt.
  IF n <> 8 THEN
    RAISE EXCEPTION 'admin_segment_where_clause: expected 8 date casts, found %', n;
  END IF;

  -- The bounded variants first, so the bare-date pass cannot re-match inside the
  -- wrapper this one just built.
  next := regexp_replace(src,
    $pat$\((%(?:\d+\$)?L)::date \+ interval ''1 day''\)$pat$,
    $rep$((\1::date + interval ''1 day'')::timestamp AT TIME ZONE ''Europe/Berlin'')$rep$, 'g');
  next := regexp_replace(next,
    $pat$(%(?:\d+\$)?L)::date(?! \+ interval)$pat$,
    $rep$(\1::date::timestamp AT TIME ZONE ''Europe/Berlin'')$rep$, 'g');

  IF next = src THEN RAISE EXCEPTION 'admin_segment_where_clause: rewrite was a no-op'; END IF;
  EXECUTE next;
  RAISE NOTICE 'admin_segment_where_clause — all 6 date operators now mean Berlin days';
END
$migration$;
