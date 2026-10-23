-- Crosstabs of survey answers, for Jarvis: how the people who gave each answer to one question
-- answered others. Sanjin asked on 21 Oct 2026 to get "cross tabs and multiple comparison"
-- straight from Claude, e.g. obstacles (16014) by satisfaction (01002) and wanted changes
-- (16001). An analysis function the brain calls through query_product_data (`get_` is its
-- read-only prefix), like get_answer_correlations.
--
-- WHO IS COUNTED, as user_totals counts them (features/brain/server/user-totals.ts): finished
-- surveys, the team's own left out ('@loveiq\.org$', mirroring isStaffEmail), each person once,
-- with the answers of their latest finish in the dates (Berlin days, like every daily figure
-- here). Also left out: anyone who asked us to restrict processing their data (GDPR Art. 18),
-- as the team export does. Gender, age, orientation and relationship are the person's own
-- answers to 15010, 15003, 15011 and 15004, so legacy profile labels ("Monogamous") count
-- under the survey's current wording; country is the profile's, archetype the scoring's.
--
-- WHAT AN ANSWER IS. Options picked, and scale values 1 to 7. Written-in text is never read,
-- with one exception that reads no free text: from 22 May to 14 Jun 2026 single-choice answers
-- were stored as the option's own words instead of a link to it (~130 finishers, every one an
-- exact match, checked 21 Oct 2026), so a stored text equal to one of the question's options
-- counts as that option. Two answer rows for one question keep the later one.
--
-- NEVER A PERSON (decision of 26 Sep 2026, user_totals' rules, plus the margins a crosstab adds):
-- - Fewer than 5 people matched: nothing is shown.
-- - A group (an answer to the row question, within a group_by value) under 5 is hidden. Where
--   groups split people into one each (single choice, scale), while the hidden ones add up to 1
--   to 4 the smallest shown one is hidden too, so subtraction cannot give one back. group_by
--   values follow the same rule. How many people a hidden group holds is never said.
-- - Inside a group a count or share is exact only when it and the rest of the group are 5 or
--   more ("<5", "all but <5"); zero included, since "nobody chose it" is everyone's answer. In a
--   single-choice column a lone hidden share is given back by 100% minus the others, so the
--   next-smallest is withheld with it. A mean needs 20 answers, as user_totals' averages do.
-- - A share or a mean is shown only beside an exact count of who answered: rounded shares and a
--   mean pin that count down, and with it the 1 to 4 people who did not answer.
-- - The "(all)" row is everyone in the group_by value. Where groups split people into one each,
--   it minus the shown groups gives the hidden people's figure, so each of its numbers is
--   withheld unless that remainder is none, or would itself be shown (5 or more each way; 20
--   answers for a mean).
-- - A filter value fewer than 5 people hold in the dates is refused, zero included, in the same
--   words either way: in a list it is the difference between two tables, and "nobody" against
--   "fewer than 5" would say whether someone is there.
-- - What this does not promise, as user_totals does not: each table is protected on its own, so
--   two tables (a day apart, one filter narrower) can still be subtracted. Never use it to find
--   out about one person.
--
-- WHICH DIFFERENCES ARE REAL. Every shown group's mean and share is tested against the rest of
-- its group_by value (everyone else who answered): Welch's t for a mean, read as a normal deviate
-- by the usual z = t(1 - 1/4df) / sqrt(1 + t^2/2df), which errs a little to the cautious side
-- (within 2.3% of the exact t at p = 0.02 with 19 degrees of freedom, the fewest a mean has,
-- checked 21 Oct 2026); a pooled two-proportion z for a share, only
-- where every expected count is 5 or more. The p values of one call are corrected together
-- with Benjamini-Hochberg, and only "higher" or "lower" at a 5% false discovery rate is
-- returned: an exact p could give back a withheld figure.
--
-- Hash joins only (enable_nestloop off): the planner estimates 1 row for most of the CTEs below
-- and nests loops over thousands, so 25 columns grouped by country took 26 s against PostgREST's
-- 8 s limit, and re-ran one aggregate 8,442 times. Off, it took 0.9 s, and 2 columns 0.2 s
-- instead of 0.3 (measured on production data, 21 Oct 2026).
--
-- Returns json, not jsonb, so the reader gets the keys in the order written. Mistakes come back
-- as {"error": ...} with what would work, because PostgREST's error text reaches Jarvis cut at
-- 400 characters. No defaults, so no overload can appear later: pass null for what is not used.

CREATE OR REPLACE FUNCTION public.get_answer_crosstab(
  row_question text,
  col_questions text[],
  group_by text,
  filters jsonb,
  since_day date,
  until_day date
)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
 SET enable_nestloop TO 'off'
AS $function$
DECLARE
  -- The demographics that are survey answers, by the survey's own question ids.
  dim_q constant jsonb := '{"gender": "15010", "age": "15003", "orientation": "15011", "relationship": "15004"}';
  dims constant text[] := ARRAY['gender', 'age', 'orientation', 'relationship', 'country', 'archetype', 'month'];
  v_row text := btrim(coalesce(row_question, ''));
  v_row_type text;
  v_cols text[];
  v_by text := nullif(btrim(coalesce(group_by, '')), '');
  v_by_q text;
  v_f jsonb := '{}';        -- the filters, a demographic's key lower-cased
  v_need text[];
  v_bad text[];
  v_key text;
  v_q text;
  v_type text;
  v_raw jsonb;
  v_v jsonb;
  v_s text;
  v_n text;
  v_ids text[];
  v_texts text[];
  v_keys text[];
  v_echo text[];
  v_lo int;
  v_hi int;
  v_filter jsonb := '{}';   -- resolved: {"<question id>" | "country" | "archetype" | "month": [keys]}
  v_shown jsonb := '[]';    -- the filters as matched, for the reader
  v_out json;
BEGIN
  -- ---- what was asked ----------------------------------------------------------------------
  IF v_row = '' THEN
    RETURN json_build_object('error', 'row_question is required: the survey question id to split people by, e.g. 16014.');
  END IF;
  SELECT array_agg(c ORDER BY o) INTO v_cols
    FROM (SELECT DISTINCT ON (btrim(c)) btrim(c) AS c, o
            FROM unnest(col_questions) WITH ORDINALITY AS t(c, o)
           WHERE btrim(coalesce(c, '')) <> ''
           ORDER BY btrim(c), o) d;
  IF coalesce(cardinality(v_cols), 0) = 0 THEN
    RETURN json_build_object('error', 'col_questions is required: 1 to 25 survey question ids to show for each answer, e.g. ["01002", "16001"].');
  END IF;
  IF cardinality(v_cols) > 25 THEN
    RETURN json_build_object('error', format('col_questions takes up to 25 question ids; %s were given.', cardinality(v_cols)));
  END IF;
  IF since_day > until_day THEN
    RETURN json_build_object('error', format('since_day %s is after until_day %s.', since_day, until_day));
  END IF;
  IF filters IS NOT NULL AND jsonb_typeof(filters) <> 'object' THEN
    RETURN json_build_object('error', 'filters must be an object, e.g. {"relationship": "Single", "16014": "Shame"}.');
  END IF;
  SELECT coalesce(jsonb_object_agg(CASE WHEN lower(btrim(key)) = ANY (dims) THEN lower(btrim(key)) ELSE btrim(key) END, value), '{}')
    INTO v_f FROM jsonb_each(coalesce(filters, '{}'));
  IF (SELECT count(*) FROM jsonb_object_keys(v_f)) < (SELECT count(*) FROM jsonb_object_keys(coalesce(filters, '{}'))) THEN
    RETURN json_build_object('error', 'filters name one key twice. Give each once.');
  END IF;

  IF lower(v_by) = ANY (dims) THEN
    v_by := lower(v_by);
    v_by_q := dim_q ->> v_by;
  ELSE
    v_by_q := v_by;
  END IF;

  -- Every question named, and each one's kind.
  v_need := array_remove(ARRAY[v_row, v_by_q] || v_cols
    || coalesce((SELECT array_agg(k) FROM jsonb_object_keys(v_f) k WHERE NOT k = ANY (dims)), '{}'), NULL);
  SELECT array_agg(DISTINCT x) INTO v_bad
    FROM unnest(v_need) x
   WHERE NOT EXISTS (SELECT 1 FROM survey_question q WHERE q.frontend_qid = x);
  IF v_bad IS NOT NULL THEN
    RETURN json_build_object(
      'error', format('No survey question has the id %s. Ids look like 01002; group_by and filter keys may also be one of %s.',
                      array_to_string(v_bad, ', '), array_to_string(dims, ', ')));
  END IF;
  SELECT array_agg(DISTINCT x) INTO v_bad
    FROM unnest(v_need) x JOIN survey_question q ON q.frontend_qid = x
   WHERE q.type NOT IN ('scale', 'single', 'multiple') OR x = '15001';
  IF v_bad IS NOT NULL THEN
    RETURN json_build_object(
      'error', format('%s %s answered in written text, which is never read. For countries use group_by or filters "country".',
                      array_to_string(v_bad, ', '), CASE WHEN cardinality(v_bad) = 1 THEN 'is' ELSE 'are' END));
  END IF;
  SELECT type INTO v_row_type FROM survey_question WHERE frontend_qid = v_row;
  IF (SELECT type FROM survey_question WHERE frontend_qid = v_by_q) = 'multiple' THEN
    RETURN json_build_object(
      'error', format('group_by needs one answer per person, and %s is multiple choice. Use it as row_question or in filters.', v_by_q));
  END IF;

  -- ---- filters: each value matched to what the survey offers -------------------------------
  FOR v_key, v_raw IN SELECT key, value FROM jsonb_each(v_f) LOOP
    v_q := CASE WHEN v_key = ANY (dims) THEN dim_q ->> v_key ELSE v_key END;
    v_raw := CASE jsonb_typeof(v_raw) WHEN 'array' THEN v_raw ELSE jsonb_build_array(v_raw) END;
    IF jsonb_array_length(v_raw) = 0 OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(v_raw) e WHERE jsonb_typeof(e) NOT IN ('string', 'number')) THEN
      RETURN json_build_object('error', format('filters "%s" takes a value or a list of values.', v_key));
    END IF;
    IF v_q IS NOT NULL AND v_filter ? v_q THEN
      RETURN json_build_object('error', format('filters name question %s twice (%s is its demographic). Give it once.',
                                               v_q, (SELECT k FROM jsonb_each_text(dim_q) d(k, q) WHERE q = v_q)));
    END IF;
    SELECT type INTO v_type FROM survey_question WHERE frontend_qid = v_q;
    v_keys := '{}';
    v_echo := '{}';
    FOR v_v IN SELECT value FROM jsonb_array_elements(v_raw) LOOP
      v_s := btrim(v_v #>> '{}');
      v_n := lower(btrim(regexp_replace(translate(v_s, '‘’–—', $q$''--$q$), '[\s\u00a0]+', ' ', 'g')));
      IF v_q IS NULL THEN
        -- country, archetype, month: matched whole, checked against who is there below.
        IF v_key = 'month' AND v_n !~ '^\d{4}-\d{2}$' THEN
          RETURN json_build_object('error', format('filters "month" takes months like 2026-09, not "%s".', v_s));
        END IF;
        v_keys := v_keys || v_n;
        v_echo := v_echo || v_s;
      ELSIF v_n = 'not given' AND v_key = ANY (dims) THEN
        v_keys := v_keys || 'none'::text;
        v_echo := v_echo || 'not given'::text;
      ELSIF v_type = 'scale' THEN
        IF v_n !~ '^[1-7]( ?- ?[1-7])?$' THEN
          RETURN json_build_object('error', format('%s is a 1 to 7 scale: filter it with values like 6 or "5-7", not "%s".', v_q, v_s));
        END IF;
        v_lo := left(v_n, 1)::int;
        v_hi := right(v_n, 1)::int;
        IF v_lo > v_hi THEN
          RETURN json_build_object('error', format('%s: "%s" runs backwards; write it low to high, e.g. "5-7".', v_q, v_s));
        END IF;
        v_keys := v_keys || (SELECT array_agg(g::text) FROM generate_series(v_lo, v_hi) g);
        v_echo := v_echo || CASE WHEN v_lo = v_hi THEN v_lo::text ELSE v_lo || '-' || v_hi END;
      ELSE
        -- The option whose words match whole, else the one option containing them.
        SELECT array_agg(o.id::text), array_agg(o.option_text) INTO v_ids, v_texts
          FROM answer_option o JOIN survey_question q ON q.id = o.survey_question_id
         WHERE q.frontend_qid = v_q
           AND lower(btrim(regexp_replace(translate(o.option_text, '‘’–—', $q$''--$q$), '[\s\u00a0]+', ' ', 'g'))) = v_n;
        IF v_ids IS NULL AND v_n <> '' THEN
          SELECT array_agg(o.id::text), array_agg(o.option_text) INTO v_ids, v_texts
            FROM answer_option o JOIN survey_question q ON q.id = o.survey_question_id
           WHERE q.frontend_qid = v_q
             AND strpos(lower(btrim(regexp_replace(translate(o.option_text, '‘’–—', $q$''--$q$), '[\s\u00a0]+', ' ', 'g'))), v_n) > 0;
        END IF;
        IF coalesce(cardinality(v_ids), 0) <> 1 THEN
          RETURN json_build_object(
            'error', format('filters "%s": %s option of %s matches "%s". Use one of these options, whole or a part only it contains%s.',
                            v_key, CASE WHEN v_ids IS NULL THEN 'no' ELSE 'more than one' END, v_q, v_s,
                            CASE WHEN v_key = ANY (dims) THEN ', or "not given"' ELSE '' END),
            'options', (SELECT json_agg(o.option_text ORDER BY o.display_order, o.id)
                          FROM answer_option o JOIN survey_question q ON q.id = o.survey_question_id
                         WHERE q.frontend_qid = v_q));
        END IF;
        v_keys := v_keys || v_ids;
        v_echo := v_echo || v_texts;
      END IF;
    END LOOP;
    v_filter := v_filter || jsonb_build_object(coalesce(v_q, v_key), to_jsonb(v_keys));
    v_shown := v_shown || jsonb_build_array(jsonb_build_object('by', v_key, 'is any of', to_jsonb(v_echo)));
  END LOOP;

  -- Country, archetype and month are matched whole, and a value fewer than 5 people hold is
  -- refused with the values 5 or more hold: a typo is told how to fix itself, and nobody and
  -- 1 to 4 people get the same words, so the refusal says nothing about who is there.
  FOR v_key IN SELECT k FROM jsonb_object_keys(v_filter) k WHERE k IN ('country', 'archetype', 'month') LOOP
    WITH fin AS (
      SELECT DISTINCT ON (coalesce(s.user_id, -s.id)) s.id AS sid, s.user_id, s.created_date_time AS at
        FROM survey_submission s
        LEFT JOIN app_user u ON u.id = s.user_id
       WHERE s.status = 'completed'
         AND (since_day IS NULL OR s.created_date_time >= (since_day::timestamp AT TIME ZONE 'Europe/Berlin'))
         AND (until_day IS NULL OR s.created_date_time < ((until_day + 1)::timestamp AT TIME ZONE 'Europe/Berlin'))
         AND coalesce(u.email, '') !~* '@loveiq\.org$'
         AND u.processing_restricted_at IS NULL
       ORDER BY coalesce(s.user_id, -s.id), s.created_date_time DESC, s.id DESC
    ),
    val AS (
      SELECT btrim(regexp_replace(translate(coalesce(nullif(btrim(
               CASE v_key
                 WHEN 'country' THEN up.location_primary
                 WHEN 'archetype' THEN coalesce(r.v5_primary_archetype, r.primary_archetype, 'not scored')
                 ELSE to_char(f.at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM')
               END), ''), 'not given'), '‘’–—', $q$''--$q$), '[\s\u00a0]+', ' ', 'g')) AS v
        FROM fin f
        LEFT JOIN app_user u ON u.id = f.user_id
        LEFT JOIN user_profile up ON up.id = u.user_profile_id
        LEFT JOIN scoring_result r ON r.survey_submission_id = f.sid
    )
    SELECT (SELECT array_agg(typed.v ORDER BY typed.i)  -- as typed: the keys are lower-cased
              FROM jsonb_array_elements_text(v_filter -> v_key) WITH ORDINALITY k(v, i)
              JOIN jsonb_array_elements_text((SELECT x -> 'is any of' FROM jsonb_array_elements(v_shown) x
                                               WHERE x ->> 'by' = v_key)) WITH ORDINALITY typed(v, i) ON typed.i = k.i
             WHERE (SELECT count(*) FROM val WHERE lower(val.v) = k.v) < 5),
           (SELECT array_agg(v ORDER BY v) FROM (SELECT v FROM val GROUP BY v HAVING count(*) >= 5) h)
      INTO v_bad, v_texts;
    IF v_bad IS NOT NULL THEN
      RETURN json_build_object(
        'error', format('filters "%s": fewer than 5 people in these dates have %s, so it is not used. The values 5 or more people have are listed.',
                        v_key, array_to_string(v_bad, ', ')),
        'options', to_json(coalesce(v_texts, '{}')));
    END IF;
  END LOOP;

  v_need := v_need || ARRAY['15010', '15003', '15011', '15004'];

  -- ---- the table ---------------------------------------------------------------------------
  -- Rows are keyed (s, rk): s the group_by value ('' without one), rk the row answer's key, and
  -- '*' for the "(all)" row, so every join below is a plain equality.
  WITH
  fin AS (  -- finished in the dates, one per person (their latest), staff and Art. 18 left out
    SELECT DISTINCT ON (coalesce(s.user_id, -s.id)) s.id AS sid, s.user_id, s.created_date_time AS at
      FROM survey_submission s
      LEFT JOIN app_user u ON u.id = s.user_id
     WHERE s.status = 'completed'
       AND (since_day IS NULL OR s.created_date_time >= (since_day::timestamp AT TIME ZONE 'Europe/Berlin'))
       AND (until_day IS NULL OR s.created_date_time < ((until_day + 1)::timestamp AT TIME ZONE 'Europe/Berlin'))
       AND coalesce(u.email, '') !~* '@loveiq\.org$'
       AND u.processing_restricted_at IS NULL
     ORDER BY coalesce(s.user_id, -s.id), s.created_date_time DESC, s.id DESC
  ),
  qs AS (
    SELECT q.id, q.frontend_qid AS qid, q.type, q.question FROM survey_question q WHERE q.frontend_qid = ANY (v_need)
  ),
  opt AS (  -- every option of the questions read, in the survey's order and words
    SELECT o.id, q.qid,
           row_number() OVER (PARTITION BY q.qid ORDER BY o.display_order NULLS LAST, o.id) AS pos,
           btrim(regexp_replace(translate(o.option_text, '‘’–—', $q$''--$q$), '[\s\u00a0]+', ' ', 'g')) AS label
      FROM answer_option o JOIN qs q ON q.id = o.survey_question_id
     WHERE q.type IN ('single', 'multiple')
  ),
  last_ans AS (  -- one answer row per person and question: the later, where two were stored
    SELECT DISTINCT ON (a.survey_submission_id, a.survey_question_id)
           a.id AS aid, a.survey_submission_id AS sid, q.qid, q.type, a.answer_option_id, a.answer_text, a.normalized_value
      FROM survey_submission_answer a
      JOIN fin f ON f.sid = a.survey_submission_id
      JOIN qs q ON q.id = a.survey_question_id
     ORDER BY a.survey_submission_id, a.survey_question_id, a.id DESC
  ),
  pick AS (  -- (person, question, key): an option's id, or a scale value 1 to 7 (then v is it)
    SELECT la.sid, la.qid, trim_scale(la.normalized_value)::text AS k, la.normalized_value AS v
      FROM last_ans la
     WHERE la.type = 'scale' AND la.normalized_value IN (1, 2, 3, 4, 5, 6, 7)
    UNION
    SELECT la.sid, la.qid, o.id::text, NULL
      FROM last_ans la JOIN opt o ON o.id = la.answer_option_id AND o.qid = la.qid
     WHERE la.type IN ('single', 'multiple')
    UNION
    SELECT la.sid, la.qid, o.id::text, NULL
      FROM last_ans la
      JOIN opt o ON o.qid = la.qid
               AND lower(o.label) = lower(btrim(regexp_replace(translate(la.answer_text, '‘’–—', $q$''--$q$), '[\s\u00a0]+', ' ', 'g')))
     WHERE la.type = 'single' AND la.answer_option_id IS NULL
    UNION
    SELECT la.sid, la.qid, o.id::text, NULL
      FROM last_ans la
      JOIN survey_submission_answer_options x ON x.survey_submission_answer_id = la.aid
      JOIN opt o ON o.id = x.answer_option_id AND o.qid = la.qid
     WHERE la.type = 'multiple'
  ),
  person AS (
    SELECT f.sid,
           btrim(regexp_replace(translate(coalesce(nullif(btrim(up.location_primary), ''), 'not given'), '‘’–—', $q$''--$q$), '[\s\u00a0]+', ' ', 'g')) AS country,
           btrim(regexp_replace(translate(coalesce(r.v5_primary_archetype, r.primary_archetype, 'not scored'), '‘’–—', $q$''--$q$), '[\s\u00a0]+', ' ', 'g')) AS archetype,
           to_char(f.at AT TIME ZONE 'Europe/Berlin', 'YYYY-MM') AS month
      FROM fin f
      LEFT JOIN app_user u ON u.id = f.user_id
      LEFT JOIN user_profile up ON up.id = u.user_profile_id
      LEFT JOIN scoring_result r ON r.survey_submission_id = f.sid
  ),
  fv AS (  -- the filters, one row per accepted key
    SELECT f.key, v.val FROM jsonb_each(v_filter) f(key, vals), jsonb_array_elements_text(f.vals) v(val)
  ),
  fmatch AS (  -- (person, filter, value) for every filter value the person has
    SELECT p.sid, p.qid AS key, fv.val FROM pick p JOIN fv ON fv.key = p.qid AND fv.val = p.k
    UNION
    SELECT pe.sid, fv.key, fv.val
      FROM person pe JOIN fv ON fv.key IN ('country', 'archetype', 'month')
                            AND fv.val = lower(CASE fv.key WHEN 'country' THEN pe.country WHEN 'archetype' THEN pe.archetype ELSE pe.month END)
    UNION
    SELECT pe.sid, fv.key, fv.val
      FROM person pe JOIN fv ON fv.val = 'none' AND fv.key NOT IN ('country', 'archetype', 'month')
     WHERE NOT EXISTS (SELECT 1 FROM pick p WHERE p.sid = pe.sid AND p.qid = fv.key)
  ),
  -- A filter value fewer than 5 people hold in these dates is refused, zero included: in a list
  -- it would be the difference between this table and the one without it.
  fweak AS (
    SELECT fv.key, fv.val FROM fv LEFT JOIN fmatch m ON m.key = fv.key AND m.val = fv.val
     GROUP BY fv.key, fv.val HAVING count(m.sid) < 5
  ),
  kept AS (  -- who is in the table: answered the row question and met every filter
    SELECT pe.*
      FROM person pe
     WHERE pe.sid IN (SELECT sid FROM pick WHERE qid = v_row)
       AND (v_filter = '{}' OR pe.sid IN (SELECT sid FROM fmatch GROUP BY sid
                                           HAVING count(DISTINCT key) = (SELECT count(*) FROM jsonb_object_keys(v_filter))))
  ),
  byq AS (  -- the group_by question's answer, when group_by is one
    SELECT p.sid, coalesce(o.label, p.k) AS label
      FROM pick p LEFT JOIN opt o ON o.id::text = p.k AND o.qid = p.qid
     WHERE p.qid = v_by_q
  ),
  strat AS (  -- each person's group_by value ('' without one)
    SELECT k.sid,
           CASE
             WHEN v_by IS NULL THEN ''
             WHEN v_by = 'country' THEN k.country
             WHEN v_by = 'archetype' THEN k.archetype
             WHEN v_by = 'month' THEN k.month
             ELSE coalesce(b.label, 'not given')
           END AS s
      FROM kept k LEFT JOIN byq b ON b.sid = k.sid
  ),
  ss AS (SELECT s, count(*) AS size FROM strat GROUP BY s),
  ss_vis AS (  -- group_by values shown: 5 or more, then the subtraction guard
    SELECT s, size, size >= 5 AND NOT (hid BETWEEN 1 AND 4 AND rnk = 1) AS shown,
           CASE WHEN v_by = 'month' THEN s END AS by_month
      FROM (SELECT ss.*,
                   coalesce(sum(size) FILTER (WHERE size < 5) OVER (), 0) AS hid,
                   row_number() OVER (ORDER BY size >= 5 DESC, size, s) AS rnk
              FROM ss) x
  ),
  rkeys AS (  -- every answer the row question offers, in the survey's order
    SELECT o.id::text AS rk, o.label, o.pos FROM opt o WHERE o.qid = v_row
    UNION ALL
    SELECT g::text, g::text, g FROM generate_series(1, 7) g WHERE v_row_type = 'scale'
  ),
  rp AS (SELECT st.s, p.sid, p.k AS rk FROM strat st JOIN pick p ON p.sid = st.sid AND p.qid = v_row),
  gsz AS (SELECT s, rk, count(*) AS size FROM rp GROUP BY s, rk),
  g_vis AS (  -- groups shown: 5 or more, and where they split people one each, the guard
    SELECT s, rk, label, pos, size,
           size >= 5 AND NOT (v_row_type <> 'multiple' AND hid BETWEEN 1 AND 4 AND rnk = 1) AS shown
      FROM (SELECT sv.s, r.rk, r.label, r.pos, coalesce(gz.size, 0) AS size,
                   coalesce(sum(coalesce(gz.size, 0)) FILTER (WHERE coalesce(gz.size, 0) < 5) OVER (PARTITION BY sv.s), 0) AS hid,
                   row_number() OVER (PARTITION BY sv.s ORDER BY coalesce(gz.size, 0) >= 5 DESC, coalesce(gz.size, 0), r.pos) AS rnk
              FROM ss_vis sv CROSS JOIN rkeys r
              LEFT JOIN gsz gz ON gz.s = sv.s AND gz.rk = r.rk
             WHERE sv.shown) x
  ),
  rows_ AS (  -- the table's rows: each shown group, and "(all)" for each shown group_by value
    SELECT s, rk, label, pos, size FROM g_vis WHERE shown
    UNION ALL
    SELECT s, '*', '(all)', 0, size FROM ss_vis WHERE shown
  ),
  mem AS (
    SELECT rp.s, rp.rk, rp.sid FROM rp JOIN g_vis g ON g.s = rp.s AND g.rk = rp.rk AND g.shown
    UNION ALL
    SELECT st.s, '*', st.sid FROM strat st JOIN ss_vis sv ON sv.s = st.s AND sv.shown
  ),
  cols AS (
    SELECT c.qid AS c, c.o AS cpos, q.type, q.question
      FROM unnest(v_cols) WITH ORDINALITY AS c(qid, o) JOIN qs q ON q.qid = c.qid
  ),
  ans_c AS (  -- one row per person and column answered, with the value for a scale
    SELECT p.sid, p.qid AS c, max(p.v) AS v FROM pick p WHERE p.qid = ANY (v_cols) GROUP BY p.sid, p.qid
  ),
  nc AS (
    SELECT m.s, m.rk, a.c, count(*) AS n, sum(a.v) AS sv, sum(a.v * a.v) AS sv2,
           count(*) FILTER (WHERE a.v >= 5) AS k57
      FROM mem m JOIN ans_c a ON a.sid = m.sid
     GROUP BY m.s, m.rk, a.c
  ),
  oc AS (
    SELECT m.s, m.rk, p.qid AS c, p.k, count(*) AS cnt
      FROM mem m JOIN pick p ON p.sid = m.sid AND p.qid = ANY (v_cols) AND p.v IS NULL
     GROUP BY m.s, m.rk, p.qid, p.k
  ),
  cn0 AS (  -- every row x column: who answered it, and a scale's sums
    SELECT r.s, r.rk, r.size, c.c, c.type,
           coalesce(nc.n, 0) AS n, nc.sv, nc.sv2, coalesce(nc.k57, 0) AS k57
      FROM rows_ r CROSS JOIN cols c
      LEFT JOIN nc ON nc.s = r.s AND nc.rk = r.rk AND nc.c = c.c
  ),
  -- The cell rule inside each row. A figure over n is shown only beside an exact n: rounded
  -- shares and a mean pin n down, and with it the 1 to 4 people who did not answer.
  cn1 AS (
    SELECT cn0.*, d.n_d,
           d.n_d = 'exact' AND cn0.n >= 20 AS mean_ok,
           CASE WHEN d.n_d <> 'exact' THEN NULL WHEN cn0.k57 < 5 THEN '<5'
                WHEN cn0.n - cn0.k57 < 5 THEN 'all but <5' ELSE 'exact' END AS k57_d
      FROM cn0,
           LATERAL (SELECT CASE WHEN cn0.n = cn0.size THEN 'exact' WHEN cn0.n < 5 THEN '<5'
                                WHEN cn0.size - cn0.n < 5 THEN 'all but <5' ELSE 'exact' END AS n_d) d
  ),
  co0 AS (  -- every row x option of a choice column, with the cell rule
    SELECT cn.s, cn.rk, cn.c, cn.type, o.id::text AS k, o.pos, coalesce(oc.cnt, 0) AS cnt, cn.n,
           CASE WHEN cn.n_d <> 'exact' THEN NULL WHEN coalesce(oc.cnt, 0) < 5 THEN '<5'
                WHEN cn.n - coalesce(oc.cnt, 0) < 5 THEN 'all but <5' ELSE 'exact' END AS d
      FROM cn1 cn
      JOIN opt o ON o.qid = cn.c
      LEFT JOIN oc ON oc.s = cn.s AND oc.rk = cn.rk AND oc.c = cn.c AND oc.k = o.id::text
     WHERE cn.type IN ('single', 'multiple')
  ),
  co1 AS (  -- groups, single choice: a lone hidden share is 100% minus the rest, so one more goes
    SELECT s, rk, c, type, k, pos, cnt, n,
           CASE WHEN d = 'exact' AND rk <> '*' AND type = 'single' AND hid = 1 AND rnk = 1 THEN 'withheld' ELSE d END AS d
      FROM (SELECT co0.*,
                   count(*) FILTER (WHERE d <> 'exact') OVER (PARTITION BY s, rk, c) AS hid,
                   row_number() OVER (PARTITION BY s, rk, c ORDER BY d = 'exact' DESC NULLS LAST, cnt, pos) AS rnk
              FROM co0) x
  ),
  -- "(all)" minus the shown groups whose figure is exact: the people that leaves, and their figure.
  rest_o AS (
    SELECT a.s, a.c, a.k, a.n - coalesce(sum(g.n), 0) AS un, a.cnt - coalesce(sum(g.cnt), 0) AS uk
      FROM co1 a LEFT JOIN co1 g ON g.s = a.s AND g.c = a.c AND g.k = a.k AND g.rk <> '*' AND g.d = 'exact'
     WHERE a.rk = '*'
     GROUP BY a.s, a.c, a.k, a.n, a.cnt
  ),
  rest_n AS (
    SELECT a.s, a.c,
           a.size - coalesce(sum(g.size) FILTER (WHERE g.n_d = 'exact'), 0) AS u_size,
           a.n - coalesce(sum(g.n) FILTER (WHERE g.n_d = 'exact'), 0) AS u_n,
           a.n - coalesce(sum(g.n) FILTER (WHERE g.mean_ok), 0) AS u_mean,
           a.n - coalesce(sum(g.n) FILTER (WHERE g.k57_d = 'exact'), 0) AS u57_n,
           a.k57 - coalesce(sum(g.k57) FILTER (WHERE g.k57_d = 'exact'), 0) AS u57_k
      FROM cn1 a LEFT JOIN cn1 g ON g.s = a.s AND g.c = a.c AND g.rk <> '*'
     WHERE a.rk = '*'
     GROUP BY a.s, a.c, a.size, a.n, a.k57
  ),
  cn2 AS (  -- "(all)": each number withheld unless the remainder it gives back is none or shown;
            -- its figures go with its n, as in any row
    SELECT s, rk, size, c, type, n, sv, sv2, k57, n_d,
           mean_ok AND n_d = 'exact' AS mean_ok,
           CASE WHEN n_d <> 'exact' THEN NULL ELSE k57_d END AS k57_d
      FROM (SELECT cn1.s, cn1.rk, cn1.size, cn1.c, cn1.type, cn1.n, cn1.sv, cn1.sv2, cn1.k57,
                   CASE WHEN r.s IS NOT NULL AND cn1.n_d = 'exact'
                         AND NOT (r.u_size = 0 OR r.u_n = r.u_size OR (r.u_n >= 5 AND r.u_size - r.u_n >= 5))
                        THEN 'withheld' ELSE cn1.n_d END AS n_d,
                   cn1.mean_ok AND (r.s IS NULL OR r.u_mean = 0 OR r.u_mean >= 20) AS mean_ok,
                   CASE WHEN r.s IS NOT NULL AND cn1.k57_d = 'exact'
                         AND NOT (r.u57_n = 0 OR (r.u57_k >= 5 AND r.u57_n - r.u57_k >= 5))
                        THEN 'withheld' ELSE cn1.k57_d END AS k57_d
              FROM cn1 LEFT JOIN rest_n r ON v_row_type <> 'multiple' AND cn1.rk = '*' AND r.s = cn1.s AND r.c = cn1.c) x
  ),
  co2 AS (
    SELECT co1.s, co1.rk, co1.c, co1.type, co1.k, co1.pos, co1.cnt, co1.n,
           CASE WHEN cn.n_d <> 'exact' THEN NULL
                WHEN r.s IS NOT NULL AND co1.d = 'exact' AND NOT (r.un = 0 OR (r.uk >= 5 AND r.un - r.uk >= 5))
                THEN 'withheld' ELSE co1.d END AS d
      FROM co1
      JOIN cn2 cn ON cn.s = co1.s AND cn.rk = co1.rk AND cn.c = co1.c
      LEFT JOIN rest_o r ON v_row_type <> 'multiple' AND co1.rk = '*' AND r.s = co1.s AND r.c = co1.c AND r.k = co1.k
  ),
  co3 AS (  -- "(all)", single choice: the lone-hidden-share rule again, after the remainder rule
    SELECT s, rk, c, k, pos, cnt, n,
           CASE WHEN d = 'exact' AND rk = '*' AND type = 'single' AND hid = 1 AND rnk = 1 THEN 'withheld' ELSE d END AS d
      FROM (SELECT co2.*,
                   count(*) FILTER (WHERE d <> 'exact') OVER (PARTITION BY s, rk, c) AS hid,
                   row_number() OVER (PARTITION BY s, rk, c ORDER BY d = 'exact' DESC NULLS LAST, cnt, pos) AS rnk
              FROM co2) x
  ),
  -- Each shown group against the rest of its group_by value: everyone else who answered.
  t_mean AS (
    SELECT g.s, g.rk, g.c,
           (g.sv / g.n)::float8 AS m1, ((a.sv - g.sv) / (a.n - g.n))::float8 AS m2,
           ((g.sv2 - g.sv * g.sv / g.n) / (g.n - 1) / g.n)::float8 AS e1,
           (((a.sv2 - g.sv2) - (a.sv - g.sv) * (a.sv - g.sv) / (a.n - g.n)) / (a.n - g.n - 1) / (a.n - g.n))::float8 AS e2,
           g.n::float8 AS n1, (a.n - g.n)::float8 AS n2
      FROM cn2 g JOIN cn2 a ON a.s = g.s AND a.c = g.c AND a.rk = '*'
     WHERE g.rk <> '*' AND g.type = 'scale' AND g.mean_ok AND a.n - g.n >= 20
  ),
  tests AS (
    SELECT s, rk, c, NULL::text AS k, m1 > m2 AS up,
           -- Welch's t as a normal deviate (see the header).
           erfc(abs(t * (1 - 1 / (4 * df)) / sqrt(1 + t * t / (2 * df))) / sqrt(2)) AS p
      FROM (SELECT t_mean.*, (m1 - m2) / sqrt(e1 + e2) AS t,
                   (e1 + e2) ^ 2 / (e1 ^ 2 / (n1 - 1) + e2 ^ 2 / (n2 - 1)) AS df
              FROM t_mean WHERE e1 + e2 > 0) w
    UNION ALL
    SELECT s, rk, c, k, x1 * n2 > x2 * n1,
           erfc(abs((x1 / n1 - x2 / n2) / sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2))) / sqrt(2))
      FROM (SELECT g.s, g.rk, g.c, g.k,
                   g.cnt::float8 AS x1, g.n::float8 AS n1,
                   (a.cnt - g.cnt)::float8 AS x2, (a.n - g.n)::float8 AS n2,
                   a.cnt::float8 / a.n AS pp
              FROM co3 g JOIN co3 a ON a.s = g.s AND a.c = g.c AND a.k = g.k AND a.rk = '*'
             WHERE g.rk <> '*' AND g.d = 'exact' AND a.n > g.n) t
     WHERE least(n1 * pp, n1 * (1 - pp), n2 * pp, n2 * (1 - pp)) >= 5
  ),
  sig AS (  -- Benjamini-Hochberg over every test in this call; only the direction leaves
    SELECT s, rk, c, k, CASE WHEN up THEN 'higher' ELSE 'lower' END AS flag
      FROM (SELECT r.*, min(p * m / i) OVER (ORDER BY i DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS q
              FROM (SELECT tests.*, row_number() OVER (ORDER BY p, s, rk, c, k) AS i, count(*) OVER () AS m
                      FROM tests) r) b
     WHERE q < 0.05
  ),
  -- Shares are whole percents, but one decimal where a whole percent would read 0 or 100: an
  -- exact share is always 5 people or more each way, and "0" would read as nobody.
  pct AS (  -- a choice column's shares, per row
    SELECT o.s, o.rk, o.c,
           json_object_agg(o.pos, CASE WHEN o.d IS DISTINCT FROM 'exact' THEN to_json(o.d)
                                       WHEN 200 * o.cnt < o.n OR 200 * o.cnt >= 199 * o.n THEN to_json(round(100.0 * o.cnt / o.n, 1))
                                       ELSE to_json(round(100.0 * o.cnt / o.n)) END ORDER BY o.pos) AS j
      FROM co3 o GROUP BY o.s, o.rk, o.c
  ),
  osig AS (
    SELECT sg.s, sg.rk, sg.c, json_object_agg(o.pos, sg.flag ORDER BY o.pos) AS j
      FROM sig sg JOIN opt o ON o.qid = sg.c AND o.id::text = sg.k
     GROUP BY sg.s, sg.rk, sg.c
  ),
  cell AS (  -- one column of one row, as the reader gets it
    SELECT cn.s, cn.rk, c.cpos,
           CASE
             WHEN cn.n_d <> 'exact' THEN json_build_object('q', cn.c, 'n', cn.n_d)
             ELSE json_strip_nulls(json_build_object(
               'q', cn.c,
               'n', cn.n,
               'mean', CASE WHEN cn.type <> 'scale' THEN NULL WHEN cn.mean_ok THEN to_json(round(cn.sv / cn.n, 2)) ELSE to_json('withheld'::text) END,
               'pct_5_7', CASE WHEN cn.type <> 'scale' THEN NULL WHEN cn.k57_d IS DISTINCT FROM 'exact' THEN to_json(cn.k57_d)
                               WHEN 200 * cn.k57 < cn.n OR 200 * cn.k57 >= 199 * cn.n THEN to_json(round(100.0 * cn.k57 / cn.n, 1))
                               ELSE to_json(round(100.0 * cn.k57 / cn.n)) END,
               'pct', p.j,
               'vs_rest', CASE WHEN cn.type = 'scale' THEN to_json(ms.flag) ELSE os.j END))
           END AS j
      FROM cn2 cn
      JOIN cols c ON c.c = cn.c
      LEFT JOIN pct p ON p.s = cn.s AND p.rk = cn.rk AND p.c = cn.c
      LEFT JOIN sig ms ON ms.s = cn.s AND ms.rk = cn.rk AND ms.c = cn.c AND ms.k IS NULL
      LEFT JOIN osig os ON os.s = cn.s AND os.rk = cn.rk AND os.c = cn.c
  ),
  row_cols AS (SELECT s, rk, json_agg(j ORDER BY cpos) AS j FROM cell GROUP BY s, rk),
  hidden AS (  -- the row answers hidden, by name: the survey lists them anyway
    SELECT g.s, array_agg(g.label ORDER BY g.pos) AS labels FROM g_vis g WHERE NOT g.shown GROUP BY g.s
  )
  SELECT CASE
  WHEN EXISTS (SELECT 1 FROM fweak) THEN
    json_build_object('error', 'Fewer than 5 people in these dates have '
                        || (SELECT string_agg(coalesce((SELECT d.k FROM jsonb_each_text(dim_q) d(k, q) WHERE d.q = w.key), w.key)
                                              || ' ' || CASE WHEN w.val = 'none' THEN 'not given' ELSE coalesce(o.label, w.val) END,
                                              ', ' ORDER BY w.key, o.pos, w.val)
                              FROM fweak w LEFT JOIN opt o ON o.qid = w.key AND o.id::text = w.val)
                        || ', so that filter is not used: a number that small can point to a person.',
                      'filters', v_shown)
  WHEN (SELECT count(*) FROM kept) < 5 THEN
    json_build_object('error', 'Fewer than 5 people match, so nothing is shown: a number that small can point to a person.',
                      'filters', v_shown)
  ELSE json_strip_nulls(json_build_object(
    'about', 'Survey finishers who answered ' || v_row || ', each person once (their latest finish), the team''s own surveys '
      || 'left out. "people" is a row''s size; each column gives how many of them answered it ("n"), then for a 1 to 7 '
      || 'scale the mean and the share answering 5, 6 or 7, and for a choice question the share picking each option, '
      || 'numbered as in "columns". Never a person: groups under 5 are hidden; "<5" and "all but <5" mark a share of '
      || 'fewer than 5 people, or all but fewer than 5; "withheld" is a figure held back so a hidden one cannot be '
      || 'worked out by subtraction, or a mean of fewer than 20 answers. A column whose "n" is not a number shows no '
      || 'figures, which would give that number back. "(all)" is everyone in the table'
      || CASE WHEN v_by IS NOT NULL THEN ' in that group' ELSE '' END
      || '. "vs_rest" marks a mean or share that differs from everyone else''s'
      || CASE WHEN v_by IS NOT NULL THEN ' in the same group' ELSE '' END
      || ': two-sided tests (Welch''s t for means, two-proportion z for shares), Benjamini-Hochberg corrected across all '
      || (SELECT count(*) FROM tests) || ' comparisons in this table at a 5% false discovery rate. Unmarked means not shown to differ.',
    'row_question', (SELECT json_build_object('q', q.qid, 'type', q.type, 'text', q.question) FROM qs q WHERE q.qid = v_row),
    'group_by', v_by,
    'filters', CASE WHEN jsonb_array_length(v_shown) > 0 THEN v_shown::json END,
    'dates', CASE WHEN since_day IS NULL AND until_day IS NULL THEN 'all time'
                  ELSE coalesce(since_day::text, 'the start') || ' to ' || coalesce(until_day::text, 'today')
                       || ' (Berlin days, by when the survey was finished)' END,
    'people', (SELECT count(*) FROM kept),
    'columns', (SELECT json_agg(json_strip_nulls(json_build_object(
                  'q', c.c, 'type', c.type, 'text', c.question,
                  'options', (SELECT json_object_agg(o.pos, o.label ORDER BY o.pos) FROM opt o WHERE o.qid = c.c)))
                ORDER BY c.cpos) FROM cols c),
    'rows', (SELECT coalesce(json_agg(json_strip_nulls(json_build_object(
                      'group', CASE WHEN v_by IS NOT NULL THEN r.s END,
                      'answer', r.label,
                      'people', r.size,
                      'cols', rc.j))
                    ORDER BY sv.by_month, sv.size DESC, r.s, r.rk <> '*', r.pos), '[]')
               FROM rows_ r JOIN ss_vis sv ON sv.s = r.s JOIN row_cols rc ON rc.s = r.s AND rc.rk = r.rk),
    'hidden_rows', CASE WHEN v_by IS NULL THEN (SELECT to_json(h.labels) FROM hidden h)
                        ELSE (SELECT json_agg(json_build_object('group', h.s, 'rows', h.labels) ORDER BY sv.by_month, sv.size DESC, h.s)
                                FROM hidden h JOIN ss_vis sv ON sv.s = h.s) END,
    'people_in_hidden_groups', (SELECT nullif(sum(size), 0) FROM ss_vis WHERE NOT shown),
    'notes', (SELECT json_agg(x) FROM unnest(ARRAY[
      CASE WHEN v_row_type = 'multiple' THEN 'People could pick several answers to ' || v_row || ', so one person can be in several rows.' END,
      CASE WHEN EXISTS (SELECT 1 FROM cols WHERE type = 'multiple') THEN 'In a multiple-choice column people could pick several options, so its shares add up to more than 100%.' END,
      -- Measured on 16014 by 16001: one row was "higher" on 10 of 11 options.
      CASE WHEN v_row_type = 'multiple' AND EXISTS (SELECT 1 FROM cols WHERE type = 'multiple')
           THEN 'Where both questions are multiple choice, people who tick more boxes tick more in both, so a row "higher" '
                || 'on most options says more about how many boxes its people tick than about a link: compare rows '
                || 'with each other, and look for the options where a row stands out against that.' END,
      'Written-in answers are never read: only the options people picked count.']) x WHERE x IS NOT NULL)
  )) END
  INTO v_out;
  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_answer_crosstab(text, text[], text, jsonb, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_answer_crosstab(text, text[], text, jsonb, date, date) TO service_role;
