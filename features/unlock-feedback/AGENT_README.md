# features/unlock-feedback/

"Why didn't you unlock your report?" (Marcus's epic, 18 Oct 2026; Mark's final copy, 22 Oct).
An unpaid reader who opened their report gets one email with eight one-tap answers, greeting
them by first name and naming the full report's worth at the price they were quoted. A tap
opens `/why`, which records the answer once the page has loaded in a browser, unlocks the full
report for free and asks an optional follow-up. The admin's "Unlock feedback" page
(AP-Analytics) reads it all, and its admins send the email from there.

## Pieces

| Piece                                     | Where                                                                                                                                                                                                |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The table, one row per reader             | `supabase/migrations/20261018200000_unlock_feedback.sql`                                                                                                                                             |
| One free unlock per report (unique index) | `supabase/migrations/20261019113700_unlock_feedback_grant_once.sql` (CONCURRENTLY)                                                                                                                   |
| The kill switch `unlock_feedback`         | `supabase/migrations/20261019120000_unlock_feedback_flag.sql`                                                                                                                                        |
| Eight answers, `send_batch`, the flag off | `supabase/migrations/20261022200000_unlock_feedback_eight_answers.sql`                                                                                                                               |
| The eight answers and all their copy      | `logic/reasons.ts`                                                                                                                                                                                   |
| The four subject lines (A to D)           | `logic/subjects.ts`                                                                                                                                                                                  |
| Who gets the email, and the launch date   | `logic/audience.ts`, `logic/launch.ts`                                                                                                                                                               |
| The link token (only its hash kept)       | `server/link.ts`                                                                                                                                                                                     |
| The email                                 | `server/emails/unlock-feedback.ts`                                                                                                                                                                   |
| Who may get it, and one send              | `server/send.ts` (shared by the three senders below)                                                                                                                                                 |
| The send (hourly at :41)                  | `app/api/cron/unlock-feedback/route.ts`                                                                                                                                                              |
| The admin's test and tranche              | `app/api/admin/ap/unlock-feedback/send/route.ts`, `features/admin/ui/ap/UnlockFeedbackSend.tsx`                                                                                                      |
| The email's link (token into a cookie)    | `app/api/unlock-feedback/open/route.ts`                                                                                                                                                              |
| The page                                  | `app/why/page.tsx`, `ui/WhyPage.tsx`                                                                                                                                                                 |
| Recording the answer, the follow-up       | `server/answer.ts`, `app/api/unlock-feedback/answer` and `detail`                                                                                                                                    |
| The free full report (a 0 payment)        | `server/grant.ts`                                                                                                                                                                                    |
| The admin page                            | `features/admin/ui/ap/ApUnlockFeedback.tsx`, `features/admin/server/ap/unlock-feedback.ts`, `app/api/admin/ap/unlock-feedback/route.ts`, `supabase/migrations/20261018210200_ap_unlock_feedback.sql` |

## Rules

- **An answer counts only when `/why` has loaded in a browser** (its script posts it). Mail
  scanners open every link with a plain GET: `open` sets a cookie and redirects, nothing else.
- **The token never sits in a page URL**: the email links to `open`, which moves it into the
  httpOnly `uf_t` cookie (path `/api/unlock-feedback`, one hour) and redirects to `/why?r=`.
- **First answer kept** in `first_reason`; `reason` is the answer now (the page can change it).
  A re-tap of another email button only counts in `answer_loads` (which also counts reloads).
  Every detail post replaces `chips` and `note` and sets `detail_at`, a change of answer alone
  included: "added detail" means chips or words, not `detail_at`. `device` is the first answer's.
- **Never for a buyer:** the send skips anyone with any paid plan or the EUR 1.99 initial report
  (and fails closed), and `/why` grants nothing to someone who bought after the email
  (`already_paid`).
- **Only readers who opened their report** (a `report_session` row): the email says they
  reviewed their results (Eman, 22 Oct).
- **The unlock is a succeeded 0 payment** with `metadata.plan = "full_report"`,
  `metadata.source = "unlock_feedback"` and the archetype: counted as a free unlock, never as a
  sale. No purchase email, GA4, Ads or Slack payment message fires for it.
- **Never two emails:** the row is claimed before the send. A Resend 4xx deletes the claim (the
  next run retries with a new link); a timeout or 5xx keeps it (a missed email beats a second).
  One email per person: a retake (a new submission) is not emailed again.
- **The 72h discount email skips anyone with a row** (Eman, 18 Oct), sent or claimed.
- **Three senders, one set of rules** (`server/send.ts`): the hourly cron takes new reports only
  (from `UNLOCK_FEEDBACK_FROM`) and is OFF until the team turns the `unlock_feedback` flag on;
  the admin's tranche (Mark and Eman, 22 Oct: the newest 250) walks back from reports three
  hours old, any date, after a dry run and the typed words "send N"; the admin's test goes to
  their own unpaid, opened report and replaces their earlier test row. Each row says which
  sender claimed it (`send_batch`); the AP page leaves staff out, so tests never count.
- **Personal data:** `note` is the reader's own words. Masked in the team export and in the
  admin (emails, report links and phone numbers scrubbed), erased with the submission and by
  the data-subject paths. Not in the retention purge: an answer, like report feedback.
