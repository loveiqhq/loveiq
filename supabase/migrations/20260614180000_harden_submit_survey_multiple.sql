-- Harden submit_survey's 'multiple' branch so a future option-text drift can
-- never again SILENTLY DROP a user's multi-select picks (root cause of the
-- 2026-05-19 → 2026-06-14 data loss: the client option labels were reworded but
-- the DB answer_option.option_text was not, so the exact-text lookup missed and
-- the pick vanished with no trace).
--
-- Two defensive changes, behaviour-neutral when the DB is in sync:
--   1. On an option-text lookup MISS, capture the raw selected label into the
--      answer row's answer_text (the admin detail already appends answer_text to
--      a multiple answer's value list, so the pick stays visible + recoverable).
--   2. Guard jsonb_array_elements behind a jsonb_typeof = 'array' check so a
--      non-array value (legacy/stale client) is stored as raw text instead of
--      raising and aborting the ENTIRE submission.
--
-- Everything else (open/scale/single branches, profile upsert, was_skipped
-- behaviour join) is preserved verbatim from the prior definition.

CREATE OR REPLACE FUNCTION public.submit_survey(p_email text, p_first_name text, p_answers jsonb, p_started_at timestamp with time zone, p_duration_ms bigint, p_utm_tracker text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid, p_marketing_opt_in boolean DEFAULT NULL::boolean)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id         BIGINT;
  v_profile_id      BIGINT;
  v_survey_id       BIGINT;
  v_submission_id   BIGINT;
  v_key             TEXT;
  v_value           JSONB;
  v_question_id     BIGINT;
  v_question_type   TEXT;
  v_answer_id       BIGINT;
  v_option_id       BIGINT;
  v_option_text     TEXT;
  v_other_text      TEXT;
  v_elem            JSONB;
  v_gender          TEXT;
  v_orientation     TEXT;
  v_rel_status      TEXT;
  v_country         TEXT;
  v_unmatched       TEXT[];
BEGIN
  INSERT INTO app_user (email, first_name, utm_tracker)
  VALUES (p_email, p_first_name, p_utm_tracker)
  ON CONFLICT (email) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        utm_tracker = COALESCE(app_user.utm_tracker, EXCLUDED.utm_tracker),
        updated_date_time = now()
  RETURNING id INTO v_user_id;

  INSERT INTO waitlist_mapping (waitlist_id, user_id)
  SELECT wu.id, v_user_id
  FROM waitlist_user wu
  WHERE lower(wu.email) = lower(p_email)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_survey_id
  FROM survey
  WHERE status = 'active'
  ORDER BY id
  LIMIT 1;

  IF v_survey_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No active survey found');
  END IF;

  INSERT INTO survey_submission (
    user_id, survey_id, status, start_date_time, duration_ms,
    utm_tracker, session_id, marketing_opt_in, marketing_opt_in_at
  )
  VALUES (
    v_user_id, v_survey_id, 'completed', p_started_at, p_duration_ms,
    p_utm_tracker, p_session_id, p_marketing_opt_in,
    CASE WHEN p_marketing_opt_in IS TRUE THEN now() ELSE NULL END
  )
  RETURNING id INTO v_submission_id;

  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_answers)
  LOOP
    IF v_key LIKE '%\_other' THEN
      CONTINUE;
    END IF;

    SELECT sq.id, sq.type
    INTO v_question_id, v_question_type
    FROM survey_question sq
    WHERE sq.frontend_qid = v_key;

    IF v_question_id IS NULL THEN
      CONTINUE;
    END IF;

    CASE v_key
      WHEN '15001' THEN v_country     := v_value #>> '{}';
      WHEN '15010' THEN v_gender      := v_value #>> '{}';
      WHEN '15011' THEN v_orientation := v_value #>> '{}';
      WHEN '15004' THEN v_rel_status  := v_value #>> '{}';
      ELSE NULL;
    END CASE;

    v_other_text := NULL;
    IF p_answers ? (v_key || '_other') THEN
      v_other_text := p_answers ->> (v_key || '_other');
    END IF;

    CASE v_question_type
      WHEN 'open' THEN
        INSERT INTO survey_submission_answer
          (survey_submission_id, survey_question_id, answer_text, answered_at)
        VALUES
          (v_submission_id, v_question_id, v_value #>> '{}', now());

      WHEN 'scale' THEN
        INSERT INTO survey_submission_answer
          (survey_submission_id, survey_question_id, normalized_value, answered_at)
        VALUES
          (v_submission_id, v_question_id, (v_value #>> '{}')::numeric, now());

      WHEN 'single' THEN
        v_option_id := NULL;
        SELECT ao.id INTO v_option_id
        FROM answer_option ao
        WHERE ao.survey_question_id = v_question_id
          AND ao.option_text = v_value #>> '{}';

        INSERT INTO survey_submission_answer
          (survey_submission_id, survey_question_id, answer_option_id, answer_text, answered_at)
        VALUES
          (v_submission_id, v_question_id, v_option_id,
           COALESCE(v_other_text, CASE WHEN v_option_id IS NULL THEN v_value #>> '{}' ELSE NULL END),
           now());

      WHEN 'multiple' THEN
        v_unmatched := '{}';

        INSERT INTO survey_submission_answer
          (survey_submission_id, survey_question_id, answer_text, answered_at)
        VALUES
          (v_submission_id, v_question_id, v_other_text, now())
        RETURNING id INTO v_answer_id;

        IF jsonb_typeof(v_value) = 'array' THEN
          FOR v_elem IN SELECT * FROM jsonb_array_elements(v_value)
          LOOP
            v_option_text := v_elem #>> '{}';
            CONTINUE WHEN v_option_text IS NULL OR v_option_text = '';
            v_option_id := NULL;

            SELECT ao.id INTO v_option_id
            FROM answer_option ao
            WHERE ao.survey_question_id = v_question_id
              AND ao.option_text = v_option_text;

            IF v_option_id IS NOT NULL THEN
              INSERT INTO survey_submission_answer_options
                (survey_submission_answer_id, answer_option_id)
              VALUES
                (v_answer_id, v_option_id)
              ON CONFLICT DO NOTHING;
            ELSE
              -- Lookup miss: keep the raw label so the pick is never lost.
              v_unmatched := array_append(v_unmatched, v_option_text);
            END IF;
          END LOOP;
        ELSIF v_value IS NOT NULL AND jsonb_typeof(v_value) <> 'null' THEN
          -- Non-array scalar (legacy client): store as raw text, don't crash.
          v_unmatched := array_append(v_unmatched, v_value #>> '{}');
        END IF;

        -- Fold any unmatched labels (+ existing other-text) into answer_text so
        -- the selection survives in the DB and shows in the admin detail.
        IF array_length(v_unmatched, 1) IS NOT NULL THEN
          UPDATE survey_submission_answer
          SET answer_text = NULLIF(
                concat_ws(' | ', NULLIF(answer_text, ''), array_to_string(v_unmatched, ' | ')),
                '')
          WHERE id = v_answer_id;
        END IF;

      ELSE
        INSERT INTO survey_submission_answer
          (survey_submission_id, survey_question_id, answer_text, answered_at)
        VALUES
          (v_submission_id, v_question_id, v_value::text, now());
    END CASE;
  END LOOP;

  IF v_gender IS NOT NULL OR v_orientation IS NOT NULL
     OR v_rel_status IS NOT NULL OR v_country IS NOT NULL THEN

    SELECT user_profile_id INTO v_profile_id
    FROM app_user WHERE id = v_user_id;

    IF v_profile_id IS NOT NULL THEN
      UPDATE user_profile
      SET gender             = COALESCE(v_gender, gender),
          sexual_orientation = COALESCE(v_orientation, sexual_orientation),
          relationship_status = COALESCE(v_rel_status, relationship_status),
          location_primary   = COALESCE(v_country, location_primary),
          updated_date_time  = now()
      WHERE id = v_profile_id;
    ELSE
      INSERT INTO user_profile (gender, sexual_orientation, relationship_status, location_primary)
      VALUES (v_gender, v_orientation, v_rel_status, v_country)
      RETURNING id INTO v_profile_id;

      UPDATE app_user
      SET user_profile_id = v_profile_id,
          updated_date_time = now()
      WHERE id = v_user_id;
    END IF;
  END IF;

  IF p_session_id IS NOT NULL THEN
    UPDATE survey_submission_answer ssa
    SET time_spent_seconds = beh.total_time_s,
        answered_at        = beh.last_answered_at,
        was_skipped        = NOT beh.was_answered,
        revision_count     = GREATEST(beh.answer_count - 1, 0)
    FROM (
      SELECT
        sbe.q_id,
        ROUND(SUM(sbe.time_spent_ms) / 1000.0)::int AS total_time_s,
        MAX(CASE WHEN sbe.answered THEN sbe.event_time END) AS last_answered_at,
        BOOL_OR(sbe.answered) AS was_answered,
        COUNT(*) FILTER (WHERE sbe.answered AND sbe.direction IN ('forward', 'complete')) AS answer_count
      FROM survey_behavior_event sbe
      WHERE sbe.session_id = p_session_id
      GROUP BY sbe.q_id
    ) beh
    JOIN survey_question sq ON sq.frontend_qid = beh.q_id
    WHERE ssa.survey_submission_id = v_submission_id
      AND ssa.survey_question_id = sq.id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'user_id', v_user_id
  );
END;
$function$;
