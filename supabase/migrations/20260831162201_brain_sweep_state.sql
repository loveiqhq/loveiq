-- Sweep bookkeeping, so the corpus is not rewritten every hour to prove it exists.
--
-- The liveness "touch" is the single most expensive write in the brain. `updated_at`
-- is an indexed column (`idx_brain_chunk_source` is `btree (source, updated_at
-- DESC)`), so a touch can never be a HOT update: each one rewrites the heap row AND
-- its entries in a 42 MB GIN full-text index, a 30 MB HNSW vector index and a 13 MB
-- trigram index -- 227 MB of indexes over a 51 MB heap.
--
-- Measured on 2026-08-31, after Supabase warned this project was exhausting its Disk
-- IO budget: brain_chunk held 30,213 live rows and had absorbed 991,115 updates,
-- 0.3% of them HOT. Every row rewritten roughly 33 times. This is the same database
-- that serves the survey, the reports and checkout.
--
-- The touch exists only to feed the sweep, and the sweep only deletes rows whose
-- source document is genuinely gone -- a rare event. Confirming all 30,000 rows every
-- hour to catch it is wildly disproportionate. This table records when each source
-- last swept, so it can happen about once a day instead of up to 96 times.
--
-- Deliberately NOT derived from the clock: every brain cron fires on a different
-- minute, so any fixed hour/minute window either misses some sources entirely or
-- fires four times for brain-fast.
create table if not exists public.brain_sweep_state (
  source   text primary key,
  swept_at timestamptz not null default now()
);

-- Service-role only, matching brain_chunk. No policies: RLS on with none defined
-- denies anon and authenticated outright, while the service role bypasses it.
alter table public.brain_sweep_state enable row level security;
