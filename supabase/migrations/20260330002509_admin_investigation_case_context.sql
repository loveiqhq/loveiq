ALTER TABLE public.admin_investigation_case
  ADD COLUMN IF NOT EXISTS root_cause TEXT,
  ADD COLUMN IF NOT EXISTS linked_chart_key TEXT,
  ADD COLUMN IF NOT EXISTS action_taken TEXT,
  ADD COLUMN IF NOT EXISTS outcome_summary TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'admin_investigation_case_root_cause_check'
  ) THEN
    ALTER TABLE public.admin_investigation_case
      ADD CONSTRAINT admin_investigation_case_root_cause_check
      CHECK (
        root_cause IS NULL
        OR root_cause = ANY (
          ARRAY[
            'question-friction',
            'traffic-quality',
            'scoring-mismatch',
            'release-regression',
            'report-engagement',
            'data-quality',
            'unknown'
          ]
        )
      );
  END IF;
END $$;;
