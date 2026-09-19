-- Drop calendly_webhook_event: the Calendly integration is gone.
--
-- LoveIQ does not use Calendly. The webhook receiver, its signature check and the
-- 78h call-invite nurture stage were removed on 2026-09-14, so nothing writes this
-- table and nothing reads it. It held ZERO rows across its whole life — it was
-- registered against the apex host (loveiq.org), which 308-redirects to www and
-- drops the svix signature headers, so no event ever verified.
--
-- `booking_event` is deliberately KEPT. It holds 234 real `call_invite_sent` rows
-- for invitations emailed to real people in June 2026, and both the data-subject
-- export (Art. 15) and erasure paths read and delete from it — dropping it would
-- break a GDPR request. Its one remaining writer is the admin "grant post-call
-- coupon" action.

DROP TABLE IF EXISTS calendly_webhook_event;
