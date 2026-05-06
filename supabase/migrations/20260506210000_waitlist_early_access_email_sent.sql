-- Idempotency timestamp for the one-shot early-access broadcast email.
-- Set by scripts/send-waitlist-early-access.ts after a successful Resend send;
-- the script skips any row where this column is non-null, making re-runs safe.
ALTER TABLE waitlist_user
  ADD COLUMN IF NOT EXISTS early_access_email_sent_at timestamptz;

-- Partial index over the only rows the broadcast script ever scans:
-- not yet sent AND not unsubscribed. Tiny, stays fast as the table grows.
CREATE INDEX IF NOT EXISTS waitlist_user_early_access_pending_idx
  ON waitlist_user (id)
  WHERE early_access_email_sent_at IS NULL AND unsub_status = false;
