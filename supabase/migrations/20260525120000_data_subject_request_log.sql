-- F-01: GDPR DSAR audit trail.
--
-- Records every export / delete request fulfilled via
-- /api/admin/data-subject so the company can prove (a) the request was
-- received, (b) who fulfilled it, (c) when, (d) what was affected.
--
-- The log entry itself is exempt from later DSAR delete operations on the
-- same email (Art. 17(3)(b) — retention for compliance). We store
-- `email_normalized` so the trail remains queryable, and `email_sha256`
-- as a stable identifier in case the email later needs redaction.

BEGIN;

CREATE TABLE IF NOT EXISTS data_subject_request_log (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_normalized    text NOT NULL,
  email_sha256        text NOT NULL,
  action              text NOT NULL CHECK (action IN ('export', 'delete')),
  admin_email         text NOT NULL,
  ip                  text,
  rows_affected       jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE data_subject_request_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_only ON data_subject_request_log USING (false);

COMMIT;

-- Indexes created CONCURRENTLY outside the transaction (Postgres requirement).
-- Table is brand new, so the cost is identical to a regular CREATE INDEX, but
-- the pattern is the one our migration lint enforces going forward.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dsr_log_email_sha256
  ON data_subject_request_log (email_sha256);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_dsr_log_created_at
  ON data_subject_request_log (created_at DESC);
