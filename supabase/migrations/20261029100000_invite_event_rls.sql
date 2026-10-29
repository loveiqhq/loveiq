-- invite_event: row level security and its service-role policy, as production has them.
--
-- 20260321194717_create_invite_event_table created the table without RLS. Production got RLS
-- and the "Service role only" policy later, by hand, so no migration recorded them. This is
-- production's state exactly (checked 29 Oct 2026: RLS on, not forced; one PERMISSIVE policy
-- FOR ALL TO service_role USING (true) WITH CHECK (true)). The app writes the table only with
-- the service-role key (app/api/invite, app/api/invite-tracking), which bypasses RLS.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.invite_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON public.invite_event;

CREATE POLICY "Service role only"
ON public.invite_event
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

COMMIT;
