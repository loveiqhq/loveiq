# features/email-journeys/

The reworked emails, phase 1 (Mark's "Email overview" canvas; the plan agreed in #all-loveiq on
6 Nov 2026). Every email has its own switch in `system_flags`, all off until its trial send is
approved: off, today's email goes out (or none, for a new one).

| Code | Email                                    | Sent by                                       | Switch                |
| ---- | ---------------------------------------- | --------------------------------------------- | --------------------- |
| I1   | Your report is ready (gated readers)     | `app/api/survey/route.ts`                     | `email_i1_v2`         |
| I2   | What €1.99 opens (3 h)                   | `app/api/cron/email-journeys` (hourly at :56) | `email_i2`            |
| I3   | The day-1 gift (E07)                     | `app/api/cron/initial-unlock-gift`            | `email_i3_v2`         |
| I4   | Gift still unopened (day 2)              | `app/api/cron/email-journeys`                 | `email_i4`            |
| R1   | Survey paused (1 h)                      | `app/api/cron/survey-paused`                  | `email_r1_v2`         |
| R2   | Answers still saved (day 2)              | `app/api/cron/email-journeys`                 | `email_r2`            |
| U1   | Core Archetype unlocked (€1.99)          | fulfillment, survey route (pay to start)      | `email_u1_v2`         |
| C1   | Full report unlocked (share link)        | fulfillment, survey route (pay to start)      | `email_c1_v2`         |
| C2   | Back into your report (day 1)            | `app/api/cron/email-journeys`                 | `email_c2`            |
| C3/4 | Invite reminders (days 3 and 5)          | `app/api/cron/invite-reminders`               | `email_c3_c4_v2`      |
| S2   | Pay to start: payment received           | `features/pay-to-start/server/emails`         | `email_s2_v2`         |
| S3-5 | Pay to start: survey not started (1/2/4) | `app/api/cron/email-journeys`                 | `email_s3_s5`         |
| R1/2 | Pay to start: survey paused, paid email  | `app/api/cron/email-journeys`                 | `email_pts_reminders` |

## Pieces

- `emails/kit.ts`: the design (shell, gradient button with its Outlook VML twin, the paste-this-link
  line, steps, progress, archetype card, tiles, panels, sign-off) and the plain-text helpers.
- `emails/chapters.ts`: the chapter map, from the report's own (`wizardDrawer`), never the canvas's.
- `emails/facts.ts`: every price and count an email states, from the code that makes it true.
- `emails/*.ts`: the emails, one function each, returning `{ subject, html, text }`.
- `logic/catalog.ts`: the switches and each email's Resend `stage` tag.
- `server/send.ts`: claim in `email_journey_send` before the send, the Resend call, the record after.
- `server/journeys.ts`: the new emails' windows and stop rules, run by the hourly job.
- `scripts/email-trials.ts`: trial sends of every email to team addresses (`--send`, else a dry run).

## Rules

- **Claim before the send.** A row per email and target (`sub:`, `session:`, `prepaid:`), unique.
  Only a Resend rate limit (429) frees it for the next run; any other refusal, a timeout or a 5xx
  marks it `failed`, never retried (a lost email beats a double one, or a bad address every hour).
- **Every email stops when the reader converts**: a payment (any, a staff test one too), a started or
  finished survey, an opened report. Windows close: nobody gets an email days late.
- **No archetype name in any email**: the €1.99 step sells it; the card is one blurred image.
- **The I3 gift test (80/20) is untouched**: the holdout never gets I4, and I2 goes to both arms.
- Each email's links carry `utm_campaign` = its stage (or its existing tag for a redesign), so
  #incoming-surveys names it under "Came back by email"; `stage` + `sub` tags keep its delivery,
  opens and clicks in `email_message_event`. Pay to start's five (S3-S5, its R1/R2) have no
  submission yet, so no `sub`: their sends are in `email_journey_send` (`prepaid:` target,
  `resend_id`), their effect in `prepaid_report_access` (`survey_started_at`,
  `consumed_submission_id`); their opens and clicks only in Resend.

## Before a switch goes on

1. The trial send was approved (Mark, Eman).
2. I2 and I4 sell to readers who never bought: the short legal check on marketing consent (the
   6 Nov review) comes first.
3. The 14-day "every cent back" line (I1, I2, U1, I3) agrees with section 5 of the terms (Fatih
   flagged the clash on 5 Nov).
4. Its KPI shows on AP-Analytics (the Emails page from Marcus's design).

Tests: `tests/emails.test.ts` (every email), `tests/journeys.test.ts` (eight days, hour by hour).
