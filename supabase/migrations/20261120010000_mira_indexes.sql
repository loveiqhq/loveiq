-- Two indexes Mira's per-person reads and deletes need (audit before launch, 20 Nov 2026).
-- Additive only. Rollback: supabase/rollbacks/20261120010000_mira_indexes_down.sql
--
-- mira_event (user_id, name, created_at): the nudge job asks per candidate whether they saw a
--   crisis lately (user_id + name + created_at); deleting chats or an account clears the
--   person's rated replies and feedback (user_id + name); and deleting an account sets user_id
--   null on its events (the foreign key's ON DELETE SET NULL). Each of those scanned the whole
--   table, which grows with every message.
-- mira_nudge (chat_id): deleting a chat sets chat_id null on its nudges (ON DELETE SET NULL),
--   which scanned every nudge sent.
--
-- CONCURRENTLY, so writes to either table are never blocked while they build (the migration
-- lint asks for it on a table that already has rows). Postgres runs CREATE INDEX CONCURRENTLY
-- only outside a transaction, so unlike the other Mira migrations there is no BEGIN and no
-- lock_timeout: it takes no lock that queues writes. Apply each as a single statement; if one is
-- interrupted it leaves an INVALID index, which the rollback drops before a re-run.

CREATE INDEX CONCURRENTLY IF NOT EXISTS mira_event_user_idx
  ON public.mira_event (user_id, name, created_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS mira_nudge_chat_idx
  ON public.mira_nudge (chat_id);
