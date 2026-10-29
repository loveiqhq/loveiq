-- Rollback of 20261030010000_short_link.sql: the click function, then the table.
-- Deletes every short link and its clicks; the links stop redirecting (they 404).

DROP FUNCTION IF EXISTS public.short_link_click(text);
DROP TABLE IF EXISTS public.short_link;
