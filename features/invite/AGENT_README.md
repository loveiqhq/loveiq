# features/invite

**Purpose:** Post-submission "invite a partner" flow — modal UI, send/track API routes, transactional + reminder emails.

**Entry:**

- `ui/InviteModal.tsx` — modal opened from `SurveyConfirmation` (post-submit) and `ReportPage` (re-engagement).
- `emails/invite.ts`, `emails/invite-b.ts` — A/B variants of the primary invite email.
- `emails/invite-reminder-1.ts`, `emails/invite-reminder-2.ts` — drip reminders sent by `app/api/cron/invite-reminders/route.ts`.
- API routes (still in `app/api/`): `app/api/invite/route.ts`, `app/api/invite-tracking/route.ts`.

**Belongs:**

- Anything specific to the invite flow: modal, share-method tracking, email templates, related tests.

**Does NOT belong:**

- Survey UI (use `features/survey/ui/` — InviteModal was previously misplaced there).
- Generic email-sending infrastructure (Resend client wrapper lives elsewhere if reused).

**Related:**

- `app/api/cron/invite-reminders/route.ts` — uses reminder templates from `emails/`.
- `lib/emails/` — other unrelated transactional templates (admin, report, survey-paused). To be subgrouped per-feature in a later phase.
