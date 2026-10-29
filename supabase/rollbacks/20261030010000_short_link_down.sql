-- Rollback of 20261030010000_short_link.sql: the click function, then the table.
-- Deletes every short link and its clicks. Take the redirect out of proxy.ts first: while that
-- code is deployed, a failed lookup sends every seven-character path with a digit to the
-- landing page, untagged, instead of the 404 page.

DROP FUNCTION IF EXISTS public.short_link_click(text);
DROP TABLE IF EXISTS public.short_link;
