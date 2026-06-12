-- Attribute unsubscribes to the email/campaign that triggered them.
--
-- The /api/unsubscribe footer + RFC 8058 one-click paths now carry a `&src=`
-- campaign key on the link (e.g. 30h_no_unlock, survey_complete). These two
-- columns persist that attribution so we can see which emails drive the most
-- unsubscribes — both via the Slack ops ping (live) and ad-hoc SQL (durable):
--
--   SELECT source_campaign, count(*) FROM public.email_suppression
--   WHERE reason = 'unsubscribed' AND created_at > now() - interval '30 days'
--   GROUP BY 1 ORDER BY 2 DESC;
--
-- Additive + idempotent: nullable columns, ADD COLUMN IF NOT EXISTS — safe to
-- apply against prod (no-op if already present). Bounce/complaint suppressions
-- leave both null; only the unsubscribe paths populate them.

ALTER TABLE public.email_suppression
  ADD COLUMN IF NOT EXISTS source_campaign text,
  ADD COLUMN IF NOT EXISTS source_channel text;
