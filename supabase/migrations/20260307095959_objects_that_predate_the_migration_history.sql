-- Objects that exist in production but that NO migration ever created.
--
-- Found 2026-09-20 while checking whether this repo can rebuild the database
-- from scratch — for a staging environment, and for disaster recovery. It
-- could not. `supabase db push` against an empty project FAILS at
-- 20260329231617_admin_security_hardening.sql, which loops over a list of RPCs
-- and does `RAISE EXCEPTION 'Function not found: %'`. Three of the functions
-- in that list are created by no migration at all, so the replay stops there.
--
-- The check-migration-drift job could not see this. It compares repo -> live
-- and reports what the repo declares but production lacks. This is the other
-- direction: what production has and the repo cannot rebuild. Nothing looked
-- at that until now.
--
-- What was missing, and where each one is first NEEDED by an existing
-- migration (which is why this file sorts before all of them):
--
--   get_archetype_comparison    20260329231617  RAISE EXCEPTION if absent
--   get_automated_insights      20260329231617  RAISE EXCEPTION if absent
--   get_conversion_pipeline     20260329231617  RAISE EXCEPTION if absent
--   check_rate_limit            20260430215616  REVOKE on a missing function
--   rate_limits                 20260308094841  DROP POLICY needs the TABLE
--   waitlist_signups            20260308094841  DROP POLICY needs the TABLE
--   survey_behavior_event       20260308135925  read by get_behavior_stats
--   brain_person                20260911123752  ALTER TABLE
--   brain_person_normalise      (its trigger, below)
--
-- Every definition below is the LIVE one, emitted verbatim by
-- pg_get_functiondef / pg_get_constraintdef / pg_get_triggerdef and written
-- straight to this file. Nothing was retyped.
--
-- Idempotent throughout (CREATE OR REPLACE, IF NOT EXISTS, DROP POLICY IF
-- EXISTS), so a replay over a database that already has these is a no-op.
-- Production never runs it: a ledger row was inserted for this version at the
-- same time, exactly as for the 17 recorded in #218.
--
-- Safe to create the functions before their tables exist: all five are
-- LANGUAGE plpgsql, whose bodies are not resolved until first call. The two
-- later ALTERs that touch these tables (20260911123752 on brain_person,
-- 20260630193337 on survey_behavior_event) both use ADD COLUMN IF NOT EXISTS,
-- so capturing today's shape here does not collide with them.
--
-- Extensions were checked too and deliberately NOT added: pg_stat_statements
-- and supabase_vault are platform-managed, uuid-ossp is unused (0 references),
-- and the only pgcrypto function this schema uses is gen_random_uuid, which is
-- core since PostgreSQL 13. The one line below pins it anyway so a fresh
-- project cannot differ on it.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- brain_person_normalise
CREATE OR REPLACE FUNCTION public.brain_person_normalise()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.aliases := (SELECT coalesce(array_agg(DISTINCT lower(trim(a))), '{}')
                    FROM unnest(NEW.aliases) a WHERE trim(a) <> '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

-- check_rate_limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_limit integer, p_window_ms bigint, p_now bigint)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_window_start BIGINT;
  v_hits         BIGINT[];
  v_valid_hits   BIGINT[];
  v_hit_count    INTEGER;
  v_reset_at     TIMESTAMPTZ;
BEGIN
  v_window_start := p_now - p_window_ms;

  -- Ensure a row exists for this key (no-op if already present)
  INSERT INTO rate_limits (key, hits, updated_at)
  VALUES (p_key, ARRAY[]::BIGINT[], NOW())
  ON CONFLICT (key) DO NOTHING;

  -- Lock the row to serialize concurrent requests for the same key
  SELECT hits
  INTO   v_hits
  FROM   rate_limits
  WHERE  key = p_key
  FOR UPDATE;

  -- Keep only hits within the current sliding window
  SELECT COALESCE(ARRAY_AGG(h ORDER BY h), ARRAY[]::BIGINT[])
  INTO   v_valid_hits
  FROM   UNNEST(COALESCE(v_hits, ARRAY[]::BIGINT[])) AS h
  WHERE  h > v_window_start;

  v_hit_count := COALESCE(ARRAY_LENGTH(v_valid_hits, 1), 0);

  -- Over the limit — return blocked
  IF v_hit_count >= p_limit THEN
    -- Reset time is when the oldest valid hit ages out of the window
    v_reset_at := TO_TIMESTAMP((v_valid_hits[1] + p_window_ms) / 1000.0);

    RETURN JSON_BUILD_OBJECT(
      'allowed',   false,
      'remaining', 0,
      'reset_at',  v_reset_at
    );
  END IF;

  -- Under the limit — record the hit and persist cleaned hits only
  UPDATE rate_limits
  SET    hits       = v_valid_hits || p_now,
         updated_at = NOW()
  WHERE  key = p_key;

  v_reset_at := TO_TIMESTAMP((p_now + p_window_ms) / 1000.0);

  RETURN JSON_BUILD_OBJECT(
    'allowed',   true,
    'remaining', p_limit - v_hit_count - 1,
    'reset_at',  v_reset_at
  );
END;
$function$
;

-- get_archetype_comparison
CREATE OR REPLACE FUNCTION public.get_archetype_comparison(p_archetypes text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'archetypes', COALESCE((
      SELECT json_agg(row_to_json(a)) FROM (
        SELECT
          sr.primary_archetype AS name,
          COUNT(*)::int AS count,
          ROUND(AVG(ss.duration_ms)::numeric / 60000, 1) AS avg_duration_min,
          json_build_object(
            'percentages', (
              SELECT json_object_agg(key, ROUND(val::numeric, 2))
              FROM (
                SELECT key, AVG(value::numeric) AS val
                FROM scoring_result sr2
                CROSS JOIN LATERAL jsonb_each_text(sr2.percentages)
                WHERE sr2.primary_archetype = sr.primary_archetype
                GROUP BY key
              ) avg_pcts
            )
          ) AS scoring
        FROM scoring_result sr
        JOIN survey_submission ss ON ss.id = sr.survey_submission_id
        WHERE sr.primary_archetype = ANY(p_archetypes)
        GROUP BY sr.primary_archetype
      ) a
    ), '[]'::json),

    'dimension_profiles', COALESCE((
      SELECT json_agg(row_to_json(dp)) FROM (
        SELECT
          sr.primary_archetype AS archetype,
          sq.frontend_qid AS q_id,
          ROUND(AVG(ssa.normalized_value)::numeric, 2) AS avg_value,
          COUNT(*)::int AS n
        FROM survey_submission_answer ssa
        JOIN survey_question sq ON sq.id = ssa.survey_question_id
        JOIN survey_submission ss ON ss.id = ssa.survey_submission_id
        JOIN scoring_result sr ON sr.survey_submission_id = ss.id
        WHERE sq.type = 'scale'
          AND ssa.normalized_value IS NOT NULL
          AND sr.primary_archetype = ANY(p_archetypes)
        GROUP BY sr.primary_archetype, sq.frontend_qid
      ) dp
    ), '[]'::json),

    'behavior', COALESCE((
      SELECT json_agg(row_to_json(b)) FROM (
        SELECT
          sr.primary_archetype AS archetype,
          COUNT(DISTINCT sbe.session_id)::int AS sessions,
          ROUND(AVG(sbe.time_spent_ms)::numeric / 1000, 1) AS avg_time_per_q_sec,
          COUNT(CASE WHEN sbe.direction = 'back' THEN 1 END)::int AS backtracks,
          COUNT(CASE WHEN sbe.direction = 'abandon' THEN 1 END)::int AS abandonments
        FROM scoring_result sr
        JOIN survey_submission ss ON ss.id = sr.survey_submission_id
        LEFT JOIN survey_behavior_event sbe ON sbe.session_id = ss.session_id
        WHERE sr.primary_archetype = ANY(p_archetypes)
        GROUP BY sr.primary_archetype
      ) b
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$function$
;

-- get_automated_insights
CREATE OR REPLACE FUNCTION public.get_automated_insights(p_days integer DEFAULT 7)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  current_start TIMESTAMPTZ;
  prev_start TIMESTAMPTZ;
  prev_end TIMESTAMPTZ;
BEGIN
  current_start := now() - (p_days || ' days')::interval;
  prev_end := current_start;
  prev_start := prev_end - (p_days || ' days')::interval;

  SELECT json_build_object(
    'period_comparison', json_build_object(
      'current_submissions', (
        SELECT COUNT(*)::int FROM survey_submission WHERE created_date_time >= current_start
      ),
      'previous_submissions', (
        SELECT COUNT(*)::int FROM survey_submission WHERE created_date_time >= prev_start AND created_date_time < prev_end
      ),
      'current_completion_rate', (
        SELECT ROUND(
          COUNT(CASE WHEN status = 'completed' THEN 1 END)::numeric /
          NULLIF(COUNT(*), 0) * 100, 1
        ) FROM survey_submission WHERE created_date_time >= current_start
      ),
      'previous_completion_rate', (
        SELECT ROUND(
          COUNT(CASE WHEN status = 'completed' THEN 1 END)::numeric /
          NULLIF(COUNT(*), 0) * 100, 1
        ) FROM survey_submission WHERE created_date_time >= prev_start AND created_date_time < prev_end
      ),
      'current_avg_duration_min', (
        SELECT ROUND(AVG(duration_ms)::numeric / 60000, 1)
        FROM survey_submission WHERE created_date_time >= current_start AND duration_ms > 0
      ),
      'previous_avg_duration_min', (
        SELECT ROUND(AVG(duration_ms)::numeric / 60000, 1)
        FROM survey_submission WHERE created_date_time >= prev_start AND created_date_time < prev_end AND duration_ms > 0
      ),
      'current_waitlist', (
        SELECT COUNT(*)::int FROM waitlist_user WHERE created_date_time >= current_start
      ),
      'previous_waitlist', (
        SELECT COUNT(*)::int FROM waitlist_user WHERE created_date_time >= prev_start AND created_date_time < prev_end
      )
    ),

    'top_drop_off_questions', COALESCE((
      SELECT json_agg(row_to_json(q)) FROM (
        SELECT sbe.q_id, COUNT(*)::int AS abandon_count
        FROM survey_behavior_event sbe
        WHERE sbe.direction = 'abandon' AND sbe.event_time >= current_start
        GROUP BY sbe.q_id
        ORDER BY abandon_count DESC
        LIMIT 5
      ) q
    ), '[]'::json),

    'fastest_growing_archetype', (
      SELECT json_build_object('archetype', archetype, 'current', cur, 'previous', prev)
      FROM (
        SELECT
          sr.primary_archetype AS archetype,
          COUNT(CASE WHEN ss.created_date_time >= current_start THEN 1 END)::int AS cur,
          COUNT(CASE WHEN ss.created_date_time >= prev_start AND ss.created_date_time < prev_end THEN 1 END)::int AS prev
        FROM scoring_result sr
        JOIN survey_submission ss ON ss.id = sr.survey_submission_id
        WHERE ss.created_date_time >= prev_start
        GROUP BY sr.primary_archetype
        HAVING COUNT(CASE WHEN ss.created_date_time >= prev_start AND ss.created_date_time < prev_end THEN 1 END) > 0
        ORDER BY (
          COUNT(CASE WHEN ss.created_date_time >= current_start THEN 1 END)::numeric /
          NULLIF(COUNT(CASE WHEN ss.created_date_time >= prev_start AND ss.created_date_time < prev_end THEN 1 END), 0)
        ) DESC NULLS LAST
        LIMIT 1
      ) fg
    ),

    'high_friction_questions', COALESCE((
      SELECT json_agg(row_to_json(hf)) FROM (
        SELECT
          sbe.q_id,
          ROUND(AVG(sbe.time_spent_ms)::numeric / 1000, 1) AS avg_time_sec,
          COUNT(CASE WHEN sbe.direction = 'back' THEN 1 END)::int AS backtrack_count
        FROM survey_behavior_event sbe
        WHERE sbe.event_time >= current_start
        GROUP BY sbe.q_id
        HAVING AVG(sbe.time_spent_ms) > (
          SELECT AVG(time_spent_ms) * 2 FROM survey_behavior_event WHERE event_time >= current_start
        )
        ORDER BY avg_time_sec DESC
        LIMIT 5
      ) hf
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$function$
;

-- get_conversion_pipeline
CREATE OR REPLACE FUNCTION public.get_conversion_pipeline(since_ts timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
  effective_since TIMESTAMPTZ := COALESCE(since_ts, '2000-01-01'::TIMESTAMPTZ);
BEGIN
  SELECT json_build_object(
    'stages', json_build_object(
      'waitlist_signups', (
        SELECT COUNT(*)::int FROM waitlist_user
        WHERE created_date_time >= effective_since
      ),
      'survey_started', (
        SELECT COUNT(DISTINCT session_id)::int FROM survey_behavior_event
        WHERE event_time >= effective_since
      ),
      'survey_completed', (
        SELECT COUNT(*)::int FROM survey_submission
        WHERE status = 'completed' AND created_date_time >= effective_since
      ),
      'scored', (
        SELECT COUNT(*)::int FROM scoring_result sr
        JOIN survey_submission ss ON ss.id = sr.survey_submission_id
        WHERE ss.created_date_time >= effective_since
      ),
      'report_generated', (
        SELECT COUNT(*)::int FROM personal_report pr
        JOIN survey_submission ss ON ss.id = pr.survey_submission_id
        WHERE ss.created_date_time >= effective_since
      ),
      'report_viewed', (
        SELECT COUNT(DISTINCT rs.personal_report_id)::int
        FROM report_session rs
        JOIN personal_report pr ON pr.id = rs.personal_report_id
        JOIN survey_submission ss ON ss.id = pr.survey_submission_id
        WHERE rs.started_at >= effective_since
      ),
      'payment_completed', (
        SELECT COUNT(*)::int FROM payment
        WHERE status = 'completed' AND created_date_time >= effective_since
      )
    ),
    'daily_funnel', COALESCE((
      SELECT json_agg(row_to_json(d)) FROM (
        SELECT
          dt.day::date AS date,
          COALESCE(wl.cnt, 0) AS waitlist,
          COALESCE(sv.cnt, 0) AS survey_started,
          COALESCE(sc.cnt, 0) AS survey_completed
        FROM generate_series(
          (effective_since AT TIME ZONE 'Europe/Berlin')::date,
          CURRENT_DATE,
          '1 day'::interval
        ) dt(day)
        LEFT JOIN (
          SELECT (created_date_time AT TIME ZONE 'Europe/Berlin')::date AS d, COUNT(*)::int AS cnt
          FROM waitlist_user WHERE created_date_time >= effective_since
          GROUP BY d
        ) wl ON wl.d = dt.day::date
        LEFT JOIN (
          SELECT (event_time AT TIME ZONE 'Europe/Berlin')::date AS d, COUNT(DISTINCT session_id)::int AS cnt
          FROM survey_behavior_event WHERE event_time >= effective_since AND direction = 'forward' AND question_index = 0
          GROUP BY d
        ) sv ON sv.d = dt.day::date
        LEFT JOIN (
          SELECT (created_date_time AT TIME ZONE 'Europe/Berlin')::date AS d, COUNT(*)::int AS cnt
          FROM survey_submission WHERE status = 'completed' AND created_date_time >= effective_since
          GROUP BY d
        ) sc ON sc.d = dt.day::date
        ORDER BY dt.day
      ) d
    ), '[]'::json),
    'time_to_complete', json_build_object(
      'avg_hours', (
        SELECT ROUND(AVG(duration_ms::numeric / 3600000), 1)
        FROM survey_submission
        WHERE status = 'completed' AND duration_ms > 0 AND created_date_time >= effective_since
      ),
      'median_hours', (
        SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms::numeric / 3600000)::numeric, 1)
        FROM survey_submission
        WHERE status = 'completed' AND duration_ms > 0 AND created_date_time >= effective_since
      )
    ),
    'by_utm', COALESCE((
      SELECT json_agg(row_to_json(u)) FROM (
        SELECT
          COALESCE(
            (ss.utm_tracker::jsonb ->> 'utm_source'),
            'Direct'
          ) AS source,
          COUNT(*)::int AS total,
          COUNT(CASE WHEN ss.status = 'completed' THEN 1 END)::int AS completed,
          ROUND(
            COUNT(CASE WHEN ss.status = 'completed' THEN 1 END)::numeric / NULLIF(COUNT(*), 0) * 100
          , 1) AS conversion_rate
        FROM survey_submission ss
        WHERE ss.created_date_time >= effective_since
        GROUP BY source
        ORDER BY total DESC
        LIMIT 10
      ) u
    ), '[]'::json)
  ) INTO result;
  RETURN result;
END;
$function$
;

CREATE TABLE IF NOT EXISTS public.brain_person (
  canonical text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}'::text[],
  kind text NOT NULL DEFAULT 'person'::text,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  role text,
  role_confidence text,
  CONSTRAINT brain_person_kind_check CHECK ((kind = ANY (ARRAY['person'::text, 'bot'::text, 'shared'::text]))),
  CONSTRAINT brain_person_pkey PRIMARY KEY (canonical),
  CONSTRAINT brain_person_role_confidence_check CHECK (((role_confidence IS NULL) OR (role_confidence = ANY (ARRAY['confirmed'::text, 'unconfirmed'::text]))))
);
ALTER TABLE public.brain_person ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS brain_person_aliases_idx ON public.brain_person USING gin (aliases);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text NOT NULL,
  hits bigint[] DEFAULT ARRAY[]::bigint[],
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT rate_limits_pkey PRIMARY KEY (key)
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON public.rate_limits; CREATE POLICY "Service role only" ON public.rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_rate_limits_updated_at ON public.rate_limits USING btree (updated_at);

CREATE TABLE IF NOT EXISTS public.survey_behavior_event (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  session_id uuid NOT NULL,
  q_id text NOT NULL,
  chapter text NOT NULL,
  question_index smallint NOT NULL,
  time_spent_ms integer NOT NULL,
  answered boolean NOT NULL DEFAULT false,
  direction text NOT NULL,
  client_ip text,
  event_time timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  email_position text,
  CONSTRAINT survey_behavior_event_direction_check CHECK ((direction = ANY (ARRAY['forward'::text, 'back'::text, 'abandon'::text, 'complete'::text]))),
  CONSTRAINT survey_behavior_event_pkey PRIMARY KEY (id)
);
ALTER TABLE public.survey_behavior_event ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_only ON public.survey_behavior_event; CREATE POLICY service_role_only ON public.survey_behavior_event FOR ALL TO PUBLIC USING (false);
CREATE INDEX IF NOT EXISTS idx_sbe_event_time ON public.survey_behavior_event USING btree (event_time);
CREATE INDEX IF NOT EXISTS idx_sbe_qid_direction ON public.survey_behavior_event USING btree (q_id, direction);
CREATE INDEX IF NOT EXISTS idx_sbe_session ON public.survey_behavior_event USING btree (session_id);

CREATE TABLE IF NOT EXISTS public.waitlist_signups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  email text NOT NULL,
  source text,
  CONSTRAINT waitlist_signups_email_key UNIQUE (email),
  CONSTRAINT waitlist_signups_pkey PRIMARY KEY (id)
);
ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role can insert" ON public.waitlist_signups; CREATE POLICY "Service role can insert" ON public.waitlist_signups FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS "Service role can select" ON public.waitlist_signups; CREATE POLICY "Service role can select" ON public.waitlist_signups FOR SELECT TO service_role USING (true);

DROP TRIGGER IF EXISTS brain_person_normalise_trg ON public.brain_person;
CREATE TRIGGER brain_person_normalise_trg BEFORE INSERT OR UPDATE ON public.brain_person FOR EACH ROW EXECUTE FUNCTION brain_person_normalise();
