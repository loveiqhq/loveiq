CREATE TABLE IF NOT EXISTS public.report_section_feedback (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL,
  section_id text NOT NULL,
  feedback text NOT NULL CHECK (feedback = ANY (ARRAY['up'::text, 'down'::text])),
  comment text,
  issue text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, section_id)
);

ALTER TABLE public.report_section_feedback ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_report_feedback_session
  ON public.report_section_feedback (session_id);

CREATE INDEX IF NOT EXISTS idx_report_feedback_section_type
  ON public.report_section_feedback (section_id, feedback);

CREATE OR REPLACE FUNCTION public.update_report_feedback_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_report_feedback_updated'
      AND tgrelid = 'public.report_section_feedback'::regclass
  ) THEN
    CREATE TRIGGER trg_report_feedback_updated
      BEFORE UPDATE ON public.report_section_feedback
      FOR EACH ROW
      EXECUTE FUNCTION public.update_report_feedback_timestamp();
  END IF;
END
$$;
