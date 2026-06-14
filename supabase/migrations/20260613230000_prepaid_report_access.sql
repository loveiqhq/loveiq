-- White-landing "pay-first" funnel: prepaid report entitlement.
--
-- The white A/B cohort pays for the full report BEFORE taking the survey, so at
-- payment time there is no survey_submission / personal_report yet. This table
-- holds that upfront entitlement, keyed on a server-minted bearer `prepaid_token`
-- (stored in an httpOnly cookie). Lifecycle:
--   1. Prepaid checkout starts  → row inserted, status 'pending'.
--   2. Stripe webhook succeeds   → status 'succeeded', payment_id linked.
--   3. White user submits survey → entitlement applied to the new report
--      (the survey route links the payment → personal_report + sets the tier)
--      and consumed_submission_id is stamped so it can't be reused.
--
-- The upfront payment persists & auto-applies whenever the survey is completed
-- (no refund logic). Service-role-only (RLS denies all; the service role key
-- bypasses RLS). No anon/authenticated access.

BEGIN;

CREATE TABLE IF NOT EXISTS prepaid_report_access (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prepaid_token            text NOT NULL UNIQUE,
  plan                     text NOT NULL,
  status                   text NOT NULL DEFAULT 'pending' CHECK (
                             status IN ('pending', 'succeeded', 'refunded')
                           ),
  landing_variant          text,
  stripe_session_id        text,
  stripe_payment_intent_id text,
  payment_id               bigint REFERENCES payment (id) ON DELETE SET NULL,
  consumed_submission_id   bigint REFERENCES survey_submission (id) ON DELETE SET NULL,
  amount_cents             integer,
  currency                 text NOT NULL DEFAULT 'EUR',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prepaid_report_access ENABLE ROW LEVEL SECURITY;
-- DROP-then-CREATE keeps the policy idempotent: this file may be applied once
-- via the Supabase MCP now and re-run later by `supabase db push` (which tracks
-- files, not ad-hoc execute_sql). A bare CREATE POLICY would throw on re-run.
DROP POLICY IF EXISTS service_role_only ON prepaid_report_access;
CREATE POLICY service_role_only ON prepaid_report_access USING (false);

COMMIT;

-- Indexes created CONCURRENTLY outside the transaction (Postgres requirement +
-- the pattern our migration lint enforces). The table is brand new, so the cost
-- is identical to a plain CREATE INDEX.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prepaid_report_access_status
  ON prepaid_report_access (status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_prepaid_report_access_session
  ON prepaid_report_access (stripe_session_id);
