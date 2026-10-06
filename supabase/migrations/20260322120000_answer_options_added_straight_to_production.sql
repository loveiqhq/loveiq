-- Six answer options that exist in production and in no migration.
--
-- Added directly to the live database on 2026-03-22 (ids 187-192) and only ever
-- REFERENCED afterwards, never created. Three later migrations update them by
-- position:
--
--   20260403210839_v2_survey_text_update.sql
--   20260506200000_v2b_full_text_sync.sql
--   20260614170000_resync_survey_content_v3.sql
--
-- each shaped like
--   UPDATE answer_option SET option_text = '…'
--    WHERE survey_question_id = (… frontend_qid = '01003') AND display_order = 5;
--
-- On a replay, display_order 5 does not exist for Q01003 — only 1-4 were seeded
-- — so the UPDATE matches nothing, silently, and the option is never created.
-- The survey then renders three fewer choices on Q01003, one fewer on Q16011 and
-- two fewer on Q16012 than production shows. Found 2026-09-20 by diffing the
-- rebuilt staging database against production.
--
-- Dated before the first migration that references them, so the UPDATEs above
-- have something to update. Production skips it via a ledger row.
--
-- Keyed on frontend_qid + display_order rather than the production ids, so it is
-- correct on any database; the ids are recorded here only as provenance.
-- Idempotent: re-running inserts nothing.

-- Q16011 order 6: 'None' -> 'Other', a second hand-edit in production.
--
-- prod id 172 still carries option_value = 'None', which is what gives it away:
-- it IS the seed's order-6 'None' row, renamed by hand some time between
-- 2026-03-07 and 2026-04-03. 20260403210839 confirms it already existed then —
-- "Note: \"Other\" option (id=172) kept in DB — existing submissions reference
-- it via FK."  No migration performs that rename, so a replay leaves it as
-- 'None' and it is then caught by that file's rename-by-text, producing TWO
-- rows reading 'None of these' and none reading 'Other'.
--
-- Runs before the INSERT below, and before 20260403210839: at
-- this point exactly one row reads 'None', so the rename is unambiguous. After
-- the insert there would be two, and that file would rename both.
UPDATE answer_option ao
   SET option_text = 'Other'
  FROM survey_question sq
 WHERE ao.survey_question_id = sq.id
   AND sq.frontend_qid = '16011'
   AND ao.display_order = 6
   AND ao.option_text = 'None';

INSERT INTO answer_option (survey_question_id, option_text, option_value, display_order)
SELECT sq.id, v.option_text, v.option_value, v.display_order
  FROM (VALUES
    -- prod id 187
    ('01003', 5, 'Present, but not a priority right now', 'Present but often deprioritized'),
    -- prod id 188
    ('01003', 6, 'Currently not a focus for me',          'Currently not a focus for me'),
    -- prod id 189
    ('01003', 7, 'Unsure / still figuring it out',        'Unsure / still figuring it out'),
    -- prod id 190. Inserted as 'None', NOT 'None of these': 20260403210839 does
    -- `UPDATE … SET option_text='None of these' WHERE option_text='None'`, and
    -- that rename is what produces the final label. Inserting the final text
    -- here would leave the rename with nothing to match and diverge again.
    ('16011', 7, 'None',                                  'None'),
    -- prod id 191
    ('16012', 5, '€700–1,499',                            '€700–1,499'),
    -- prod id 192
    ('16012', 6, '€1,500+',                               '€1,500+')
  ) AS v(frontend_qid, display_order, option_text, option_value)
  JOIN survey_question sq ON sq.frontend_qid = v.frontend_qid
 WHERE NOT EXISTS (
   SELECT 1 FROM answer_option existing
    WHERE existing.survey_question_id = sq.id
      AND existing.display_order = v.display_order
 );
