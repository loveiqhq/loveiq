# features/booking

The founder call: the offer's dialog and booking page, and a row in `booking_event`.

## The founder-call offer (14.10)

Mark (#all-loveiq, 08.10) asked for a pop-up offering readers their full report free for a
20-minute call with him and Marcus, booked straight into their calendars.

- `logic/founderCall.ts` → `getFounderCallUrl()`: the booking page, from
  `NEXT_PUBLIC_FOUNDER_CALL_URL`. Only an https Google Calendar booking page passes
  (`calendar.app.google`, `calendar.google.com`); unset or anything else turns the offer off.
- `ui/FounderCallDialog.tsx`: the pop-up. It promises exactly what the post-call grant gives
  (below): a one-time code for the full report, emailed, working for 14 days. No price.
- When it shows is the report's business: `features/report/logic/leaveIntent.ts`.

**Bookings are not recorded.** Google's booking pages send nothing back, so no `call_booked` row
is written. The founders find the booker's email in /admin, where the submission's timeline shows
"Founder-call booking page opened", and press "Grant 100% coupon" after the call. Recording
bookings automatically (a poller over the founders' calendars) would need no migration: the
`booking_event` CHECK already allows `call_booked`.

To switch the offer off, unset `NEXT_PUBLIC_FOUNDER_CALL_URL` and redeploy.

## What else is here

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
