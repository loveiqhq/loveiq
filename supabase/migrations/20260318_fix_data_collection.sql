-- Migration: Fix data collection pipeline
--
-- 1. Sync answer_option labels to match frontend survey-data.ts
-- 2. Add session_id column to survey_submission
-- 3. Update RPC: store utm on app_user, accept session_id, populate user_profile
--
-- Root cause: frontend survey-data.ts uses short clean labels while
-- the DB seed used longer descriptive versions from the source CSV.
-- The RPC does exact-match on option_text, so mismatches cause
-- silent data loss on multi-select and missing FK links on single-choice.

-- ============================================================
-- PART 1: Sync answer_option.option_text to frontend labels
-- ============================================================

-- 01003 — single (relationship with sexuality)
UPDATE answer_option SET option_text = 'Not a priority'             WHERE id = 1;
UPDATE answer_option SET option_text = 'Temporarily deprioritized'  WHERE id = 2;
UPDATE answer_option SET option_text = 'Feels complicated'          WHERE id = 3;
-- id 4 "I''m not sure" matches frontend

-- 02001 — single (desire pattern)
UPDATE answer_option SET option_text = 'Spontaneous'                WHERE id = 5;
UPDATE answer_option SET option_text = 'Responsive'                 WHERE id = 6;
UPDATE answer_option SET option_text = 'Planned window'             WHERE id = 7;
UPDATE answer_option SET option_text = 'Varies by partner/context'  WHERE id = 8;
-- id 9 "Desire has been low lately" matches frontend

-- 02004 — single (initiation preference)
-- id 10 "I start it" matches frontend
UPDATE answer_option SET option_text = 'My partner starts'          WHERE id = 11;
UPDATE answer_option SET option_text = 'Planned window'             WHERE id = 12;
UPDATE answer_option SET option_text = 'Playful either-way'         WHERE id = 13;

-- 03003 — single (preferred setting) — mostly match
-- ids 14-18 match. Fix "Other (please specify)" → "Other"
UPDATE answer_option SET option_text = 'Other'                      WHERE id = 19;

-- 03005 — single (arousal pathway)
UPDATE answer_option SET option_text = 'Sensation-led'              WHERE id = 20;
UPDATE answer_option SET option_text = 'Safety/context-led'         WHERE id = 21;
UPDATE answer_option SET option_text = 'Connection-led'             WHERE id = 22;
UPDATE answer_option SET option_text = 'Novelty/adventure-led'      WHERE id = 23;
UPDATE answer_option SET option_text = 'Mastery/competence-led'     WHERE id = 24;
UPDATE answer_option SET option_text = 'Fantasy/imagination-led'    WHERE id = 25;
UPDATE answer_option SET option_text = 'Not sure / varies'          WHERE id = 26;

-- 03006 — single (learning mode)
UPDATE answer_option SET option_text = 'Taught / guided'            WHERE id = 27;
UPDATE answer_option SET option_text = 'Optimizing / understanding' WHERE id = 28;
UPDATE answer_option SET option_text = 'No learning mode'           WHERE id = 29;

-- 03010 — single (erotic risk preference)
-- ids 30-32 match frontend
UPDATE answer_option SET option_text = 'Adventurous but controlled'     WHERE id = 33;
UPDATE answer_option SET option_text = 'High-risk / edgy / taboo-leaning' WHERE id = 34;

-- 03013 — single (arousing scenario)
UPDATE answer_option SET option_text = 'Being watched / admired'                WHERE id = 35;
UPDATE answer_option SET option_text = 'Watching my partner'                    WHERE id = 36;
UPDATE answer_option SET option_text = 'Absorbed in sensation / connection'     WHERE id = 37;
-- id 38 "Not sure" matches frontend

-- 10002 — single (intimacy communication)
-- id 47 "Mostly nonverbal / quiet" matches frontend
UPDATE answer_option SET option_text = 'Touch / movement'           WHERE id = 48;
UPDATE answer_option SET option_text = 'Short clear phrases'        WHERE id = 49;
UPDATE answer_option SET option_text = 'Ongoing verbal feedback'    WHERE id = 50;
UPDATE answer_option SET option_text = 'Relational check-ins'       WHERE id = 51;

-- 11001 — single (power dynamic)
UPDATE answer_option SET option_text = 'Lead / direct'              WHERE id = 52;
UPDATE answer_option SET option_text = 'Surrender / be led'         WHERE id = 53;
UPDATE answer_option SET option_text = 'Switch'                     WHERE id = 54;
UPDATE answer_option SET option_text = 'Egalitarian / no roles'     WHERE id = 55;
UPDATE answer_option SET option_text = 'Not sure / depends'         WHERE id = 56;

-- 11003 — single (pleasure orientation)
UPDATE answer_option SET option_text = 'Put partner''s pleasure first'  WHERE id = 57;
UPDATE answer_option SET option_text = 'Strive for mutual balance'      WHERE id = 58;
UPDATE answer_option SET option_text = 'Prefer receiving / being guided' WHERE id = 59;
UPDATE answer_option SET option_text = 'Varies'                         WHERE id = 60;

-- 15005 — single (children)
-- id 86 "No" matches frontend
UPDATE answer_option SET option_text = 'Yes, youngest is 0–3'      WHERE id = 87;
UPDATE answer_option SET option_text = 'Yes, youngest is 4–10'     WHERE id = 88;
UPDATE answer_option SET option_text = 'Yes, youngest is 11–17'    WHERE id = 89;
-- ids 90-92 match frontend

-- 15009 — single (medication impact)
-- id 109 "No" matches frontend
UPDATE answer_option SET option_text = 'Yes, lowers my drive'              WHERE id = 110;
UPDATE answer_option SET option_text = 'Yes, increases my drive'           WHERE id = 111;
UPDATE answer_option SET option_text = 'Yes, not sure how it affects me'   WHERE id = 112;
-- id 113 "Prefer not to answer" matches frontend

-- 16001 — single (primary focus)
UPDATE answer_option SET option_text = 'Desire & arousal'           WHERE id = 127;
UPDATE answer_option SET option_text = 'Pleasure & orgasm'          WHERE id = 128;
UPDATE answer_option SET option_text = 'Pain / physical barriers'   WHERE id = 129;
-- id 130 "Emotional safety & connection" matches frontend
UPDATE answer_option SET option_text = 'Communication'              WHERE id = 131;
-- id 132 "Novelty & excitement" matches frontend
-- id 133 "Confidence & body comfort" matches frontend
UPDATE answer_option SET option_text = 'Healing / repair'           WHERE id = 134;
UPDATE answer_option SET option_text = 'Partner alignment'          WHERE id = 135;
UPDATE answer_option SET option_text = 'Other'                      WHERE id = 136;

-- 16005 — single (current phase) — long descriptions → short labels
UPDATE answer_option SET option_text = 'Recharging / Pausing'       WHERE id = 144;
UPDATE answer_option SET option_text = 'Repairing / Reconnecting'   WHERE id = 145;
UPDATE answer_option SET option_text = 'Awakening / Exploring'      WHERE id = 146;
UPDATE answer_option SET option_text = 'Expanding / Experimenting'  WHERE id = 147;
UPDATE answer_option SET option_text = 'Grounded / Integrated'      WHERE id = 148;
UPDATE answer_option SET option_text = 'Evolving / Transcending'    WHERE id = 149;

-- 16006 — single (target phase) — same labels as 16005
UPDATE answer_option SET option_text = 'Recharging / Pausing'       WHERE id = 150;
UPDATE answer_option SET option_text = 'Repairing / Reconnecting'   WHERE id = 151;
UPDATE answer_option SET option_text = 'Awakening / Exploring'      WHERE id = 152;
UPDATE answer_option SET option_text = 'Expanding / Experimenting'  WHERE id = 153;
UPDATE answer_option SET option_text = 'Grounded / Integrated'      WHERE id = 154;
UPDATE answer_option SET option_text = 'Evolving / Transcending'    WHERE id = 155;

-- 16007 — single (help-seeking style)
UPDATE answer_option SET option_text = 'Research on my own'         WHERE id = 156;
UPDATE answer_option SET option_text = 'Structured tool/app/journal' WHERE id = 157;
UPDATE answer_option SET option_text = 'Program/course'             WHERE id = 158;
UPDATE answer_option SET option_text = 'Professional support'       WHERE id = 159;
UPDATE answer_option SET option_text = 'Act only when urgent'       WHERE id = 160;

-- 16008 — MULTIPLE (support preferences) — DATA LOSS FIX
UPDATE answer_option SET option_text = 'Self-guided tools'          WHERE id = 161;
UPDATE answer_option SET option_text = 'Short structured program'   WHERE id = 162;
-- ids 163-166 match frontend

-- 16011 — MULTIPLE (regular tools) — DATA LOSS FIX
-- ids 167-169 match frontend
UPDATE answer_option SET option_text = 'Other paid subscriptions'   WHERE id = 170;
UPDATE answer_option SET option_text = 'Other'                      WHERE id = 171;
-- id 172 "None" matches frontend

-- 16012 — single (annual investment)
-- id 173 "€0" matches frontend
UPDATE answer_option SET option_text = '€50'                        WHERE id = 174;
UPDATE answer_option SET option_text = '€200'                       WHERE id = 175;
UPDATE answer_option SET option_text = '€1000+'                     WHERE id = 176;

-- 16014 — MULTIPLE (barriers) — DATA LOSS FIX
UPDATE answer_option SET option_text = 'Not sure what would help'           WHERE id = 177;
UPDATE answer_option SET option_text = 'Time / energy is limited'           WHERE id = 178;
UPDATE answer_option SET option_text = 'Partner isn''t aligned / engaged'   WHERE id = 179;
-- id 180 "Emotional safety isn''t there yet" matches frontend
-- id 181 "Shame / pressure / self-judgment" matches frontend
UPDATE answer_option SET option_text = 'Physical pain / body issues'        WHERE id = 182;
UPDATE answer_option SET option_text = 'Cost / access'                      WHERE id = 183;
-- ids 184-186 match frontend


-- ============================================================
-- PART 2: Add session_id column to survey_submission
-- ============================================================

ALTER TABLE survey_submission
  ADD COLUMN IF NOT EXISTS session_id UUID;

-- Index for behavior event correlation
CREATE INDEX IF NOT EXISTS idx_submission_session_id
  ON survey_submission (session_id)
  WHERE session_id IS NOT NULL;


-- ============================================================
-- PART 3: Updated RPC — session_id, utm on app_user, user_profile
-- ============================================================

-- Drop old signature (TEXT, TEXT, JSONB, TIMESTAMPTZ, BIGINT, TEXT)
DROP FUNCTION IF EXISTS submit_survey(TEXT, TEXT, JSONB, TIMESTAMPTZ, BIGINT, TEXT);

CREATE OR REPLACE FUNCTION submit_survey(
  p_email         TEXT,
  p_first_name    TEXT,
  p_answers       JSONB,
  p_started_at    TIMESTAMPTZ,
  p_duration_ms   BIGINT,
  p_utm_tracker   TEXT    DEFAULT NULL,
  p_session_id    UUID    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Demographics extracted from answers
  v_gender          TEXT;
  v_orientation     TEXT;
  v_rel_status      TEXT;
  v_country         TEXT;
BEGIN
  -- 1a. Upsert app_user by email (now includes utm_tracker on first insert)
  INSERT INTO app_user (email, first_name, utm_tracker)
  VALUES (p_email, p_first_name, p_utm_tracker)
  ON CONFLICT (email) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        utm_tracker = COALESCE(app_user.utm_tracker, EXCLUDED.utm_tracker),
        updated_date_time = now()
  RETURNING id INTO v_user_id;

  -- 1b. Auto-link waitlist signup if email matches
  INSERT INTO waitlist_mapping (waitlist_id, user_id)
  SELECT wu.id, v_user_id
  FROM waitlist_user wu
  WHERE lower(wu.email) = lower(p_email)
  ON CONFLICT DO NOTHING;

  -- 2. Get the active survey
  SELECT id INTO v_survey_id
  FROM survey
  WHERE status = 'active'
  ORDER BY id
  LIMIT 1;

  IF v_survey_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'No active survey found');
  END IF;

  -- 3. Create survey_submission (includes utm_tracker + session_id)
  INSERT INTO survey_submission (user_id, survey_id, status, start_date_time, duration_ms, utm_tracker, session_id)
  VALUES (v_user_id, v_survey_id, 'completed', p_started_at, p_duration_ms, p_utm_tracker, p_session_id)
  RETURNING id INTO v_submission_id;

  -- 4. Loop through answer keys
  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_answers)
  LOOP
    -- Skip _other companion keys (handled inline with their parent)
    IF v_key LIKE '%\_other' THEN
      CONTINUE;
    END IF;

    -- Look up question by frontend_qid
    SELECT sq.id, sq.type
    INTO v_question_id, v_question_type
    FROM survey_question sq
    WHERE sq.frontend_qid = v_key;

    IF v_question_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Extract demographics from answers for user_profile
    CASE v_key
      WHEN '15001' THEN v_country     := v_value #>> '{}';
      WHEN '15010' THEN v_gender      := v_value #>> '{}';
      WHEN '15011' THEN v_orientation  := v_value #>> '{}';
      WHEN '15004' THEN v_rel_status   := v_value #>> '{}';
      ELSE NULL;
    END CASE;

    -- Check for companion _other text
    v_other_text := NULL;
    IF p_answers ? (v_key || '_other') THEN
      v_other_text := p_answers ->> (v_key || '_other');
    END IF;

    -- Handle by question type
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
        INSERT INTO survey_submission_answer
          (survey_submission_id, survey_question_id, answer_text, answered_at)
        VALUES
          (v_submission_id, v_question_id, v_other_text, now())
        RETURNING id INTO v_answer_id;

        FOR v_elem IN SELECT * FROM jsonb_array_elements(v_value)
        LOOP
          v_option_text := v_elem #>> '{}';
          v_option_id := NULL;

          SELECT ao.id INTO v_option_id
          FROM answer_option ao
          WHERE ao.survey_question_id = v_question_id
            AND ao.option_text = v_option_text;

          IF v_option_id IS NOT NULL THEN
            INSERT INTO survey_submission_answer_options
              (survey_submission_answer_id, answer_option_id)
            VALUES
              (v_answer_id, v_option_id);
          END IF;
        END LOOP;

      ELSE
        INSERT INTO survey_submission_answer
          (survey_submission_id, survey_question_id, answer_text, answered_at)
        VALUES
          (v_submission_id, v_question_id, v_value::text, now());
    END CASE;
  END LOOP;

  -- 5. Create / update user_profile from demographics
  IF v_gender IS NOT NULL OR v_orientation IS NOT NULL
     OR v_rel_status IS NOT NULL OR v_country IS NOT NULL THEN

    -- Check if user already has a profile
    SELECT user_profile_id INTO v_profile_id
    FROM app_user WHERE id = v_user_id;

    IF v_profile_id IS NOT NULL THEN
      -- Update existing profile
      UPDATE user_profile
      SET gender             = COALESCE(v_gender, gender),
          sexual_orientation = COALESCE(v_orientation, sexual_orientation),
          relationship_status = COALESCE(v_rel_status, relationship_status),
          location_primary   = COALESCE(v_country, location_primary),
          updated_date_time  = now()
      WHERE id = v_profile_id;
    ELSE
      -- Create new profile and link to app_user
      INSERT INTO user_profile (gender, sexual_orientation, relationship_status, location_primary)
      VALUES (v_gender, v_orientation, v_rel_status, v_country)
      RETURNING id INTO v_profile_id;

      UPDATE app_user
      SET user_profile_id = v_profile_id,
          updated_date_time = now()
      WHERE id = v_user_id;
    END IF;
  END IF;

  -- 6. Backfill per-answer metadata from behavior events (if session provided)
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

  -- 7. Return success
  RETURN json_build_object(
    'success', true,
    'submission_id', v_submission_id,
    'user_id', v_user_id
  );
END;
$$;

-- Grant execute to service_role (new signature)
GRANT EXECUTE ON FUNCTION submit_survey(TEXT, TEXT, JSONB, TIMESTAMPTZ, BIGINT, TEXT, UUID)
  TO service_role;
