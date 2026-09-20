-- Seven answer-option labels that were changed in production and in no migration.
--
-- Found 2026-09-20 by replaying every migration into an empty database and
-- diffing the result against production. The row counts matched exactly — 265
-- options, 66 questions — so nothing was missing; these seven simply read
-- differently, because someone edited the text live and no migration records it.
--
-- Dated LAST on purpose. These are final-state labels: placed earlier, the
-- rename-by-position passes in 20260506200000_v2b_full_text_sync and
-- 20260614170000_resync_survey_content_v3 would overwrite them again.
--
-- Keyed on frontend_qid + display_order. Guarded by IS DISTINCT FROM so it
-- touches nothing where the text already matches — a no-op against production,
-- verified before committing.

UPDATE answer_option ao
   SET option_text = v.option_text,
       updated_date_time = now()
  FROM (VALUES
    ('11003',  1, 'Primarily focused on my partner'),
    ('11003',  2, 'A balance of giving and receiving'),
    ('11003',  3, 'Primarily focused on my own experience'),
    ('11003',  4, 'It changes depending on mood or partner'),
    ('14020', 10, 'Healing and soothing'),
    ('14020', 11, 'Escape and relief')
  ) AS v(frontend_qid, display_order, option_text),
       survey_question sq
 WHERE sq.frontend_qid = v.frontend_qid
   AND ao.survey_question_id = sq.id
   AND ao.display_order = v.display_order
   AND ao.option_text IS DISTINCT FROM v.option_text;

-- Q03003: the 'Other (please specify)' row was MOVED to position 7 and renamed.
--
-- Keyed on option_value, not display_order: in a replay this row is still at
-- position 6, where 20260322120000 also puts a new row, so two rows share
-- position 6 and nothing sits at 7. A position-keyed update matches nothing —
-- which is exactly how the first attempt at this file silently did nothing.
-- option_value survived both edits and is what identifies the row.
UPDATE answer_option ao
   SET display_order = 7,
       option_text = 'Something else',
       updated_date_time = now()
  FROM survey_question sq
 WHERE ao.survey_question_id = sq.id
   AND sq.frontend_qid = '03003'
   AND ao.option_value = 'Other (please specify)'
   AND (ao.display_order, ao.option_text) IS DISTINCT FROM (7, 'Something else');

-- Q16001 is a MULTIPLE choice question in production; every migration leaves it
-- 'single'. This is not cosmetic — it decides whether the survey renders
-- checkboxes or radio buttons, so a rebuilt environment collects a different
-- shape of answer from the live site. No migration records the change.
UPDATE survey_question
   SET type = 'multiple', updated_date_time = now()
 WHERE frontend_qid = '16001'
   AND type IS DISTINCT FROM 'multiple';
