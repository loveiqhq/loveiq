ALTER TABLE public.admin_resource_comment
  DROP CONSTRAINT IF EXISTS admin_resource_comment_resource_type_check;

ALTER TABLE public.admin_resource_comment
  ADD CONSTRAINT admin_resource_comment_resource_type_check
  CHECK (
    resource_type = ANY (
      ARRAY[
        'metric-registry'::text,
        'release-entry'::text,
        'decision-entry'::text,
        'experiment'::text,
        'chart-annotation'::text,
        'strategy-initiative'::text,
        'strategy-bet'::text,
        'competitive-watch'::text,
        'metric-dependency'::text,
        'review-request'::text,
        'alert-policy'::text,
        'benchmark'::text,
        'research-entry'::text,
        'general'::text
      ]
    )
  );
