-- Pin the funnel RPCs' day boundaries to UTC explicitly.
--
-- WHY. Three of the four daily funnel functions bucket with a bare
-- `some_timestamptz::date`, which resolves against the SESSION TimeZone, not
-- against anything the query states. The fourth,
-- `get_landing_start_funnel_daily`, already says `AT TIME ZONE 'UTC'`.
--
-- Today they agree, because the server default is UTC and no role or database
-- setting overrides it. That agreement is ambient, not guaranteed:
--
--   SET TimeZone='UTC';            '2026-09-14 23:30+00'::timestamptz::date -> 2026-09-14
--   SET TimeZone='Europe/Berlin';  '2026-09-14 23:30+00'::timestamptz::date -> 2026-09-15
--
-- So the day someone sets a role-level TimeZone — and "let's put everything in
-- Berlin time" is exactly the request that leads there — three of these
-- functions move their day boundaries and the fourth does not. The conversion
-- digest joins their output into one table, so it would mix two definitions of
-- "day" with no error anywhere.
--
-- This changes NO results while the session is UTC. It makes the day boundary a
-- property of the query instead of the connection, so a future move to Berlin
-- has to be a deliberate edit here rather than a side effect somewhere else.
DO $migration$
DECLARE
  target   RECORD;
  body     TEXT;
  before   TEXT;
  pattern  TEXT;
  patterns TEXT[];
BEGIN
  FOR target IN
    SELECT p.oid,
           p.proname,
           CASE p.proname
             WHEN 'get_axis_funnel_daily' THEN
               ARRAY['ss.created_date_time']
             WHEN 'get_landing_arm_funnel_daily' THEN
               ARRAY['since_ts', 'until_ts', 'ss.created_date_time',
                     'rs.started_at', 'q.checkout_started_at',
                     'q.purchased_at', 'p.created_date_time']
           END AS cols
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_axis_funnel_daily', 'get_landing_arm_funnel_daily')
  LOOP
    body := pg_get_functiondef(target.oid);
    patterns := target.cols;

    FOREACH pattern IN ARRAY patterns LOOP
      before := body;
      body := replace(body, pattern || '::date', '(' || pattern || E' AT TIME ZONE \'UTC\')::date');

      -- An anchor that no longer matches means the function was rewritten since
      -- this migration was authored. Fail loudly: silently applying a
      -- substitution that hit nothing is how a migration reports success while
      -- changing nothing.
      IF body = before THEN
        RAISE EXCEPTION 'migration anchor missing: %.% has no "%::date"',
          target.proname, pattern, pattern;
      END IF;
    END LOOP;

    EXECUTE body;
  END LOOP;

  -- Nothing may still bucket a day against the session clock. Postgres regex
  -- has no lookbehind, so this counts instead: every ::date must be preceded by
  -- an explicit UTC conversion.
  FOR target IN
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_axis_funnel_daily', 'get_landing_arm_funnel_daily')
  LOOP
    IF (SELECT count(*) FROM regexp_matches(target.def, '::date', 'g'))
       <> (SELECT count(*) FROM regexp_matches(target.def, 'AT TIME ZONE ''UTC''\)::date', 'g')) THEN
      RAISE EXCEPTION 'a bare ::date survived the rewrite in %', target.proname;
    END IF;
  END LOOP;

END
$migration$;
