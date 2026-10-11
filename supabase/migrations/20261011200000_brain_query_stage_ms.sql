-- How long each stage of a search took: embedding the question, the ranked search, and the
-- smaller keyword-only search when the full one did not answer. Written by recordToolCall
-- for search_company_context only, and read by brain_health.
--
-- Between 1 and 11 Oct 2026 about one search in thirteen answered "the knowledge base is
-- unreachable", every one at ~8.2 s, and the log could not say which stage was slow. Nullable
-- with no default, so adding it rewrites nothing.

ALTER TABLE public.brain_query ADD COLUMN IF NOT EXISTS stage_ms jsonb;
