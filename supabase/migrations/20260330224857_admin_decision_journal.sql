CREATE TABLE IF NOT EXISTS public.admin_decision_entry (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email text NOT NULL,
  owner_email text,
  title text NOT NULL,
  entry_type text NOT NULL DEFAULT 'decision'
    CHECK (entry_type = ANY (ARRAY['decision'::text, 'scoring-change'::text, 'memo'::text])),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'monitoring'::text, 'validated'::text, 'rolled-back'::text])),
  rationale text,
  expected_impact text,
  observed_effect text,
  change_summary text,
  review_window_days integer DEFAULT 14
    CHECK (
      review_window_days IS NULL
      OR (review_window_days >= 1 AND review_window_days <= 365)
    ),
  linked_release_id bigint REFERENCES public.product_changelog(id) ON DELETE SET NULL,
  linked_experiment_id bigint REFERENCES public.admin_experiment(id) ON DELETE SET NULL,
  evidence_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_decision_entry_type_status
  ON public.admin_decision_entry (entry_type, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_decision_entry_owner
  ON public.admin_decision_entry (owner_email, updated_at DESC);

ALTER TABLE public.admin_decision_entry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_only ON public.admin_decision_entry;
CREATE POLICY service_role_only
ON public.admin_decision_entry
USING (false);

REVOKE ALL ON TABLE public.admin_decision_entry FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.admin_decision_entry TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relname = 'admin_decision_entry_id_seq'
  ) THEN
    REVOKE ALL ON SEQUENCE public.admin_decision_entry_id_seq FROM PUBLIC, anon, authenticated;
    GRANT USAGE, SELECT ON SEQUENCE public.admin_decision_entry_id_seq TO service_role;
  END IF;
END $$;;
