# features/booking

One function: a row in `booking_event`.

## What this is now

Calendly was removed on 2026-09-14 — the company does not use it. Gone with it: the
webhook receiver at `/api/calendly/webhook`, the svix signature check, the
`calendly_webhook_event` idempotency table, and the `78h_no_unlock` nurture stage whose
only job was to send readers to a booking page.

What remains is `server/events.ts` → `insertBookingEvent`, the writer for the
`booking_event` table.

## Why the table stayed

`booking_event` holds **234 real rows** — `call_invite_sent` records for invitations
emailed to real people between 2 and 15 June 2026. Two reasons not to drop it:

- **`features/admin/server/data-subject.ts` reads and deletes from it** on both the
  Art. 15 export path and the erasure path. Dropping the table breaks a GDPR request.
- It is the audit trail for emails we actually sent. The `raw` and `email` columns hold
  personal data, which is why the MCP masks them and why a retention window is still an
  open item in CLAUDE.md.

Its `calendly_event_uri` / `calendly_invitee_uri` columns are kept because the historical
rows may carry them. Nothing writes them any more.

## The one writer

`/api/admin/submissions/[id]/grant-call-coupon` — an admin mints a one-time 100%-off code
and logs a `call_coupon_sent` row here. Best-effort by design: the coupon is already
minted and emailed by the time this runs, so a failed log row must never fail the grant.

## Why the webhook never worked

Worth recording, because the same trap caught a second integration. It was registered
against `https://loveiq.org/api/calendly/webhook` — the **apex**, which 308-redirects to
`www` and drops the signature headers on the way. `calendly_webhook_event` therefore held
zero rows for its entire life, while the endpoint answered 401 like a healthy one. The
Resend webhook was registered the same way and was dark for 129 days. See the warning in
`docs/runbooks/COMPANY_BRAIN.md`.
