CREATE TABLE IF NOT EXISTS public.report_price_quote (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  personal_report_id bigint NOT NULL REFERENCES public.personal_report(id) ON DELETE CASCADE,
  survey_submission_id bigint NOT NULL REFERENCES public.survey_submission(id) ON DELETE CASCADE,
  user_id bigint REFERENCES public.app_user(id) ON DELETE SET NULL,
  plan text NOT NULL CHECK (plan IN ('essentials', 'full_report', 'all_reports')),
  currency text NOT NULL DEFAULT 'EUR',
  experiment_group text NOT NULL CHECK (experiment_group IN ('A', 'B')),
  base_price_bucket text NOT NULL,
  base_price numeric NOT NULL,
  country_tier text NOT NULL,
  country_multiplier numeric NOT NULL,
  device_type text NOT NULL,
  device_multiplier numeric NOT NULL,
  traffic_source text NOT NULL,
  traffic_multiplier numeric NOT NULL,
  behavioral_bucket text NOT NULL,
  behavioral_multiplier numeric NOT NULL,
  engagement_score integer NOT NULL DEFAULT 0,
  engagement_multiplier numeric NOT NULL DEFAULT 1,
  report_preview_views integer NOT NULL DEFAULT 0,
  fantasy_signal_count integer NOT NULL DEFAULT 0,
  survey_duration_ms bigint,
  initial_price numeric NOT NULL,
  current_price numeric NOT NULL,
  discount_step integer NOT NULL DEFAULT 0 CHECK (discount_step BETWEEN 0 AND 4),
  discount_multiplier numeric NOT NULL DEFAULT 1,
  pricing_cluster_id text NOT NULL,
  initial_price_timestamp timestamp with time zone NOT NULL DEFAULT now(),
  last_viewed_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  view_count integer NOT NULL DEFAULT 0,
  checkout_started_at timestamp with time zone,
  purchased_at timestamp with time zone,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_date_time timestamp with time zone NOT NULL DEFAULT now(),
  updated_date_time timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS report_price_quote_personal_report_plan_uidx
  ON public.report_price_quote (personal_report_id, plan);

CREATE INDEX IF NOT EXISTS report_price_quote_submission_idx
  ON public.report_price_quote (survey_submission_id);

CREATE INDEX IF NOT EXISTS report_price_quote_cluster_idx
  ON public.report_price_quote (pricing_cluster_id);

CREATE INDEX IF NOT EXISTS report_price_quote_experiment_idx
  ON public.report_price_quote (experiment_group, plan);

ALTER TABLE public.report_price_quote ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_price_quote_service_role_only ON public.report_price_quote;
CREATE POLICY report_price_quote_service_role_only
  ON public.report_price_quote
  USING (false);

ALTER TABLE public.payment
  ADD COLUMN IF NOT EXISTS pricing_quote_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payment_pricing_quote_id_fkey'
  ) THEN
    ALTER TABLE public.payment
      ADD CONSTRAINT payment_pricing_quote_id_fkey
      FOREIGN KEY (pricing_quote_id)
      REFERENCES public.report_price_quote(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payment_pricing_quote_idx
  ON public.payment (pricing_quote_id);
