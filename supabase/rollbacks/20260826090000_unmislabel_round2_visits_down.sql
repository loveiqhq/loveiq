-- Rollback for 20260826090000_unmislabel_round2_visits.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20260826090000_unmislabel_round2_visits_down.sql
--
-- IMPRECISE BY ONE ROW, on purpose. 2026-08-24 already contained a single
-- genuinely-unknown visit before the forward migration ran, and nothing
-- distinguishes it from the 63 that were relabelled that day, so this restores 64
-- rows to 'control' where 63 is strictly correct. Accepted: both labels are
-- excluded from every per-arm comparison, so no reported number depends on it.
UPDATE funnel_event
   SET landing_variant = 'control'
 WHERE event_type = 'unique_visitor'
   AND landing_variant = 'unknown'
   AND day >= DATE '2026-08-21'
   AND day <= DATE '2026-08-24';
