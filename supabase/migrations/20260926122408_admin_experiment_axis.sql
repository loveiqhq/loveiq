-- Link a registered experiment to the axis whose stamped arms it compares, so the brain's
-- `experiments` tool reads its live numbers through features/admin/server/experiment-readouts.ts,
-- the same code as /admin's A/B overview. Nullable: a test on something no axis stamps is still
-- worth registering, and the admin panel's own upsert does not set it.
ALTER TABLE public.admin_experiment
  ADD COLUMN IF NOT EXISTS axis text;

ALTER TABLE public.admin_experiment
  DROP CONSTRAINT IF EXISTS admin_experiment_axis_check;
ALTER TABLE public.admin_experiment
  ADD CONSTRAINT admin_experiment_axis_check
  CHECK (axis IS NULL OR axis IN ('landing', 'survey', 'pricing', 'paywall'));

COMMENT ON COLUMN public.admin_experiment.axis IS
  'The experiment axis (features/attribution/server/labels.ts) whose stamped arms this test compares; null when none does.';
