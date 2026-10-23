-- Single-choice answers finished 22 May to 14 Jun 2026 hold the option's own words in answer_text
-- and no link to it (answer_option_id NULL): 1,463 rows on 21 Oct 2026, every one equal to exactly
-- one option of its question, none free text. 20260614200000 was written to relink these, but its
-- ledger row holds no statements (recorded in the ledger repair of 19 Sep 2026), so whether it ran
-- cannot be told, and 11 of these rows were written after its version time anyway. Every reader
-- that counts an option by its link missed them: user_totals,
-- the AP question view (ap_question_answers), get_answer_conversion_lift and the answer
-- distributions. Found while building get_answer_crosstab, which maps them at read time.
--
-- Linked to that option. answer_text is kept, unlike 20260614200000, which cleared it: it holds
-- only the option's words, and keeping it lets the rollback find exactly these rows (a linked
-- single answer whose text is its option's wording, of which there were 0 before this ran).
-- IDEMPOTENT: only rows still unlinked match.

UPDATE survey_submission_answer a
   SET answer_option_id = o.id
  FROM survey_question q, answer_option o
 WHERE a.survey_question_id = q.id
   AND q.type = 'single'
   AND q.frontend_qid <> '15001'
   AND a.answer_option_id IS NULL
   AND a.answer_text IS NOT NULL
   AND o.survey_question_id = q.id
   AND o.option_text = a.answer_text;
