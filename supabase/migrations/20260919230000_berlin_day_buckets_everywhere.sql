-- Bucket every daily series on a BERLIN day, not the session's.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT IS STILL WRONG AFTER 20260919180000.
--
-- That migration fixed the WINDOW BOUNDS of the four sparkline functions. It did
-- not touch the per-day BUCKETING inside them, and there are 61 more bare
-- `column::date` casts across ten functions. A cast from timestamptz to date
-- resolves against the session TimeZone, which is UTC on the pooler, so every
-- one of those buckets a row by its UTC day.
--
-- Measured 2026-09-19 over 30 days, rows whose UTC day differs from their
-- Berlin day:
--
--     analytics_event.event_time              990 of 6,493   15.2%
--     survey_submission.created_date_time      52 of   410   12.7%
--     report_price_quote.paywall_reached_at    56 of   500   11.2%
--
-- One row in seven, on a daily chart, attributed to the wrong day. Window totals
-- are unaffected — which is exactly why it survived: the headline is right and
-- only the line is wrong.
--
-- It also no longer LINES UP. The `days` CTE generates Berlin days and
-- `funnel_event.day` is already a Berlin DATE column, so those join correctly
-- while the analytics- and submission-derived CTEs join on a UTC day. The
-- mismatch predates today's work (funnel_event has been Berlin since
-- 20260915162358), but fixing the bounds without the buckets leaves it half
-- done, and half done is what this pass exists to finish.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHY AN EXPLICIT COLUMN ALLOW-LIST AND NOT A BLANKET REPLACE.
--
-- `::date` appears on plenty of things that are NOT timestamptz and MUST NOT be
-- converted. Enumerated from the live definitions:
--
--     d::date              9x   the loop variable of generate_series in the
--                               `days` CTE. Already a plain timestamp; wrapping
--                               it in AT TIME ZONE would shift the axis itself.
--     NULL::date           7x   a typed null.
--     L::date              8x   a text literal in admin_segment_where_clause.
--     dt.day::date         4x   an already-bucketed day.
--     p_since::date              a date parameter.
--     effective_since::date      a date column.
--
-- So the replacement is keyed on a NAMED LIST of timestamptz columns, with an
-- optional table alias, and nothing else is touched.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- AND WHY EVERY OCCURRENCE IN A FUNCTION IS REPLACED AT ONCE.
--
-- Earlier today a narrower substitution in this same family replaced a SELECT
-- and left the `GROUP BY` beneath it alone; the replacement added a JOIN to a
-- table sharing that column name, and the surviving GROUP BY became ambiguous.
-- The function compiled and threw at call time. Replacing every occurrence of a
-- given expression keeps SELECT and GROUP BY in agreement by construction,
-- which is what makes this pass safer than that one was.
--
-- Bounds (`since_ts::date`, `until_ts::date`) are included: five functions still
-- carry them.
--
-- Nothing is verified here that the caller cannot verify better. After this
-- applies, CALL every affected function — a runtime error like the ambiguity
-- above cannot be caught at definition time.

DO $migration$
DECLARE
  fn        RECORD;
  src       TEXT;
  next      TEXT;
  col       TEXT;
  n_changed INT;
  total_fns INT := 0;

  -- TIMESTAMPTZ columns and parameters only. See the note above for what is
  -- deliberately absent.
  ts_names CONSTANT TEXT[] := ARRAY[
    'since_ts', 'until_ts',
    'event_time',
    'created_date_time', 'updated_date_time',
    'created_at', 'updated_at',
    'started_at', 'saved_at',
    'paywall_reached_at', 'checkout_started_at', 'purchased_at',
    'refunded_at', 'payment_date_time', 'first_seen', 'ended_at'
  ];
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
       )
     ORDER BY p.proname
  LOOP
    src  := pg_get_functiondef(fn.oid);
    next := src;

    FOREACH col IN ARRAY ts_names LOOP
      -- Optional `alias.` prefix, word-bounded, and NOT already wrapped: the
      -- negative lookbehind on "TIME ZONE " keeps a re-run idempotent and stops
      -- a column being wrapped twice.
      next := regexp_replace(
        next,
        '(?<!AT TIME ZONE ''Europe/Berlin''\)\s)(\m(?:[A-Za-z_][A-Za-z_0-9]*\.)?' || col || '\M)::date',
        '(\1 AT TIME ZONE ''Europe/Berlin'')::date',
        'g'
      );
    END LOOP;

    IF next <> src THEN
      -- Each wrap adds exactly 31 bytes: " AT TIME ZONE 'Europe/Berlin'" plus two
      -- parens. So the byte delta IS the count of casts this pass converted, and a
      -- delta that is not a multiple of 31 means the pattern did something else.
      n_changed := (length(next) - length(src)) / 31;
      IF (length(next) - length(src)) <> n_changed * 31 THEN
        RAISE EXCEPTION 'unexpected rewrite in %: % bytes added is not a whole number of wraps',
          fn.proname, length(next) - length(src);
      END IF;
      EXECUTE next;
      total_fns := total_fns + 1;
      RAISE NOTICE '% — now buckets on Berlin days (% casts converted)',
        fn.proname, n_changed;
    END IF;
  END LOOP;

  RAISE NOTICE 'rewrote % function(s)', total_fns;

  -- A re-run legitimately rewrites nothing. But leaving a bare cast on one of
  -- the named columns behind IS a failure, and this is the only place that
  -- would notice.
  IF EXISTS (
    SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace,
      LATERAL unnest(ts_names) AS c
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
       )
       AND pg_get_functiondef(p.oid) ~ ('(?<!AT TIME ZONE ''Europe/Berlin''\)\s)\m(?:[A-Za-z_][A-Za-z_0-9]*\.)?' || c || '\M::date')
  ) THEN
    RAISE EXCEPTION
      'a bare ::date on a timestamptz column survived this pass — the pattern is not matching what it claims to';
  END IF;
END
$migration$;
