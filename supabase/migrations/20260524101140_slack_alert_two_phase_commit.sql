-- 2-phase commit pattern for slack_alert_sent — fixes the failure mode where
-- a cron claims a Slack slot, then crashes BEFORE sending the notify (e.g.
-- 2026-05-24 09:00 UTC Supabase timeout). With this, a stuck claim row from
-- a crashed run can be re-claimed by the next invocation after 10 minutes.

ALTER TABLE public.slack_alert_sent
  ADD COLUMN IF NOT EXISTS delivered BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Default = TRUE so existing rows (which DID fire successfully) are not
-- re-claimable. New rows from tryClaimSlackAlert will explicitly insert false.
COMMENT ON COLUMN public.slack_alert_sent.delivered IS
  'Set TRUE after notifySlack succeeds. FALSE rows older than 10 min are eligible for re-claim by a fresh cron run (recovers from crashed runs).';
COMMENT ON COLUMN public.slack_alert_sent.claimed_at IS
  'When claim_slack_alert() last touched this row. Stale window: 10 min.';

-- Conditional claim: insert fresh, OR re-claim a stale undelivered row.
-- Returns TRUE iff the caller has the claim; FALSE if a live invocation
-- already has it (or it was already delivered).
CREATE OR REPLACE FUNCTION public.claim_slack_alert(
  p_kind TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_stale_after_minutes INT DEFAULT 10
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
BEGIN
  INSERT INTO public.slack_alert_sent (kind, entity_type, entity_id, sent_at, delivered, claimed_at)
  VALUES (p_kind, p_entity_type, p_entity_id, v_now, FALSE, v_now)
  ON CONFLICT (kind, entity_type, entity_id) DO UPDATE
    SET claimed_at = v_now
    WHERE public.slack_alert_sent.delivered = FALSE
      AND public.slack_alert_sent.claimed_at < v_now - (p_stale_after_minutes || ' minutes')::interval;
  -- FOUND is TRUE if the INSERT succeeded OR the UPDATE matched its WHERE.
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_slack_alert(TEXT, TEXT, TEXT, INT) TO service_role;

-- Companion: flip delivered=TRUE after notifySlack succeeds. No-op if row
-- doesn't exist (e.g. claim function was never called) — safe to call
-- unconditionally in finally blocks.
CREATE OR REPLACE FUNCTION public.mark_slack_alert_delivered(
  p_kind TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.slack_alert_sent
    SET delivered = TRUE
    WHERE kind = p_kind AND entity_type = p_entity_type AND entity_id = p_entity_id;
$$;

GRANT EXECUTE ON FUNCTION public.mark_slack_alert_delivered(TEXT, TEXT, TEXT) TO service_role;
