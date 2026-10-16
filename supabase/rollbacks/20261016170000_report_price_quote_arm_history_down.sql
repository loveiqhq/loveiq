-- Rollback for 20261016170000_report_price_quote_arm_history.
--
-- FIRST revert the code that reads the table (features/admin/server/experiment-readouts.ts
-- embeds it in every quote read), or the brain's `experiments` readout reports an outage on
-- every call. Nothing on the paygate reads it: quotes are written as before either way.
--
-- Puts get_arm_cohorts and get_axis_funnel_daily back on the quote's current stamp, by the
-- same substitution in reverse, then drops get_price_list_changes, the trigger, its function
-- and the table. Deletes every arm and list-price change recorded since; the backfilled ones
-- can be recovered from metadata.pricing2 and metadata.pricing3b, which the migration left in
-- place.
--
-- Dropping the trigger takes an exclusive lock on report_price_quote, which every paygate
-- visit writes, so it waits at most 3 seconds and then fails rather than queue those writes
-- behind it. Re-run it if it does.
--
-- Apply: psql "$DATABASE_URL" -f supabase/rollbacks/20261016170000_report_price_quote_arm_history_down.sql

BEGIN;
SET LOCAL lock_timeout = '3s';

DO $rollback$
DECLARE
  fn text;
  body text;
  old_expr CONSTANT text := 'COALESCE(q.experiment_group, q.base_price_bucket)';
  new_expr CONSTANT text :=
    'COALESCE((SELECT h.old_experiment_group FROM report_price_quote_arm_history h'
    ' WHERE h.quote_id = q.id ORDER BY h.changed_at, h.id LIMIT 1),'
    ' q.experiment_group, q.base_price_bucket)';
BEGIN
  FOREACH fn IN ARRAY ARRAY['get_arm_cohorts', 'get_axis_funnel_daily'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO body
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = fn;
    IF body IS NULL THEN
      RAISE EXCEPTION '%: not found, nothing was changed', fn;
    END IF;
    IF (length(body) - length(replace(body, new_expr, ''))) / length(new_expr) <> 2 THEN
      RAISE EXCEPTION '%: expected exactly 2 copies of the dealt-arm expression, nothing was changed', fn;
    END IF;
    EXECUTE replace(body, new_expr, old_expr);
  END LOOP;
END
$rollback$;

DROP FUNCTION IF EXISTS public.get_price_list_changes();
DROP TRIGGER IF EXISTS report_price_quote_keeps_arm_history ON public.report_price_quote;
DROP FUNCTION IF EXISTS public.report_price_quote_keep_arm_history();
DROP TABLE IF EXISTS public.report_price_quote_arm_history;

COMMIT;
