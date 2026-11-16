-- Rollback of 20261116150000_reader_return.sql: the "Came back" record. Dropping it loses every
-- return kept since, and AP's "Came back within 7 days" with them. The code can stay: without the
-- table its claim fails, so it posts nothing and touches nothing else.

DROP TABLE IF EXISTS public.reader_return;
