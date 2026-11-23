-- Rollback of 20261117230000_survey_state_of_desire_opt_in.sql. Dropping the columns loses every
-- State of Desire tick and the words it was given under, the consent record behind the code Mark
-- sends: export them first. Roll the code back first: the #incoming-surveys message selects
-- state_of_desire_opt_in_at, and without the column every survey's message falls back to its
-- one-line text.

ALTER TABLE survey_submission
  DROP COLUMN IF EXISTS state_of_desire_opt_in_version,
  DROP COLUMN IF EXISTS state_of_desire_opt_in_at;
