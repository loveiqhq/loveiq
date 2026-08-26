-- DOWN migration for 20260825215317_brain_chunk.sql.
--
-- Drops the company-brain corpus, the query log and the retrieval function.
-- Consequence: the Slack brain answers nothing (retrieval 500s) until the
-- migration is re-applied and the ingesters re-run.
--
-- NO IRREPLACEABLE DATA IS LOST. Every brain_chunk row is derived -- rebuilt in
-- full by re-running the repo ingester (GitHub Action on push) and the nightly
-- Jira/Supabase cron. The only genuine loss is brain_query, i.e. the history of
-- what the team asked, which is signal for what to ingest next but is not
-- referenced by anything. Nothing here is a source of truth.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260825215317_brain_chunk_down.sql

BEGIN;

DROP FUNCTION IF EXISTS public.brain_search(TEXT, INT);
DROP TABLE IF EXISTS public.brain_query;
DROP TABLE IF EXISTS public.brain_chunk;

COMMIT;
