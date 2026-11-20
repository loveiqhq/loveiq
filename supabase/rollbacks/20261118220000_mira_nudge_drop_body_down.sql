-- Rollback of 20261118220000_mira_nudge_drop_body.sql: the column comes back empty (the words
-- were never kept after the drop).

ALTER TABLE public.mira_nudge ADD COLUMN IF NOT EXISTS body text CHECK (char_length(body) <= 2000);
