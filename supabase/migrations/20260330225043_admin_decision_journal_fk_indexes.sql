CREATE INDEX IF NOT EXISTS idx_admin_decision_entry_linked_release_id
  ON public.admin_decision_entry (linked_release_id)
  WHERE linked_release_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_admin_decision_entry_linked_experiment_id
  ON public.admin_decision_entry (linked_experiment_id)
  WHERE linked_experiment_id IS NOT NULL;;
