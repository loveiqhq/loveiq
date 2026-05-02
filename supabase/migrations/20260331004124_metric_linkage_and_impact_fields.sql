ALTER TABLE public.product_changelog
  ADD COLUMN IF NOT EXISTS owner_email text,
  ADD COLUMN IF NOT EXISTS primary_metric_key text,
  ADD COLUMN IF NOT EXISTS expected_impact text,
  ADD COLUMN IF NOT EXISTS review_date date,
  ADD COLUMN IF NOT EXISTS measured_outcome text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.product_changelog
SET
  owner_email = COALESCE(owner_email, admin_email),
  updated_at = COALESCE(updated_at, created_at, now())
WHERE owner_email IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.product_changelog
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_changelog_metric_key
  ON public.product_changelog (primary_metric_key, event_date DESC)
  WHERE primary_metric_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_changelog_review_date
  ON public.product_changelog (review_date)
  WHERE review_date IS NOT NULL;

ALTER TABLE public.admin_decision_entry
  ADD COLUMN IF NOT EXISTS primary_metric_key text;

CREATE INDEX IF NOT EXISTS idx_admin_decision_entry_metric_key
  ON public.admin_decision_entry (primary_metric_key, updated_at DESC)
  WHERE primary_metric_key IS NOT NULL;

ALTER TABLE public.admin_action_item
  ADD COLUMN IF NOT EXISTS expected_impact text,
  ADD COLUMN IF NOT EXISTS measured_outcome text;

CREATE INDEX IF NOT EXISTS idx_admin_action_item_metric_key
  ON public.admin_action_item (metric_key, updated_at DESC)
  WHERE metric_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_action_item_review_date
  ON public.admin_action_item (review_date)
  WHERE review_date IS NOT NULL;
