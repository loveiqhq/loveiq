-- Rollback of 20261116150000_reader_return.sql: the "Came back" record. Dropping it loses every
-- return kept since, and AP's "Came back within 7 days" with them. Roll the code back first:
-- without the table every claim is refused, which posts nothing and fails no request, but logs
-- "write REJECTED" to #prod-alerts for every later-day report visit and email click.

DROP TABLE IF EXISTS public.reader_return;
