-- Down for 20260905220546_brain_query_any_surface.
--
-- Dropping these columns loses every MCP row's tool, args and top_score, but the
-- rows themselves survive as `question` + `latency_ms` + `error` -- the Slack
-- shape. Nothing that reads the table today requires the new columns.

DROP INDEX IF EXISTS public.brain_query_surface_created_idx;

ALTER TABLE public.brain_query
  DROP COLUMN IF EXISTS top_score,
  DROP COLUMN IF EXISTS args,
  DROP COLUMN IF EXISTS tool,
  DROP COLUMN IF EXISTS surface;
