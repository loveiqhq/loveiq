-- Rollback for 20261011200000_brain_query_stage_ms. Deploy code that no longer writes
-- stage_ms FIRST: PostgREST rejects a whole insert that names a column it does not have.

ALTER TABLE public.brain_query DROP COLUMN IF EXISTS stage_ms;
