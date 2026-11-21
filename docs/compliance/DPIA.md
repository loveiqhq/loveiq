# Data Protection Impact Assessment — LoveIQ Web

> Owner: Eman (data controller + engineering lead).
> Last reviewed: 2026-05-26.
> Review cadence: annually, OR when adding a new processing activity / new vendor / a new category of personal data.
> Mira, the AI coach: §7, assessed 2026-11-20, next review 2027-02-20.

<!-- cspell:ignore Hasenheide BDSG adsservices -->

GDPR Art. 35 requires a DPIA when processing involves "systematic monitoring of a publicly accessible area on a large scale" or processing of "special categories of personal data" at scale. The LoveIQ survey collects sensitive-by-context personal data (sexual orientation, relationship status, attachment patterns, intimacy preferences) tied to identifiable email addresses. A DPIA is therefore mandatory.

## 1. Scope of processing

| Activity                          | Personal data collected                                                                                                                                                                                                                                                                                                                                         | Lawful basis                                                                                                                                                                                                                                                                                                                                                   | Storage location                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Waitlist signup                   | email, optional first_name, UTM context, IP, timestamp                                                                                                                                                                                                                                                                                                          | consent (explicit opt-in)                                                                                                                                                                                                                                                                                                                                      | Supabase (`waitlist_user`)                                                                                |
| Survey submission                 | email, first_name, ~60 question answers including sensitive-by-context data, IP, session_id, duration, UTM context (campaign tags; click ids: Google's ad click ids `gclid`/`gbraid`/`wbraid` and, from 2026-10-16, Meta's `fbclid`, which Meta adds to any link click, ad or not; from 2026-10-16 the referring site's hostname, never its full address)       | consent (explicit opt-in via survey start)                                                                                                                                                                                                                                                                                                                     | Supabase (`survey_submission`, `survey_submission_answer`, `app_user`)                                    |
| Scoring                           | derived archetype + percentages from answers                                                                                                                                                                                                                                                                                                                    | contract (necessary to deliver the report the user requested)                                                                                                                                                                                                                                                                                                  | Supabase (`scoring_result`)                                                                               |
| Report delivery                   | personal_report row, signed access token, share-link tokens                                                                                                                                                                                                                                                                                                     | contract                                                                                                                                                                                                                                                                                                                                                       | Supabase (`personal_report`, `report_access_token`, `report_share`)                                       |
| Email sending (transactional)     | recipient email, first_name, signed unsubscribe token                                                                                                                                                                                                                                                                                                           | contract / legitimate interest (delivering the report the user paid for)                                                                                                                                                                                                                                                                                       | Resend (email service processor)                                                                          |
| Email sending (marketing nurture) | recipient email, first_name; per email: delivered, opened, clicked and when, with the submission id                                                                                                                                                                                                                                                             | consent (Q16015, T-11); per-email opens and clicks: legitimate interest (2026-10-14)                                                                                                                                                                                                                                                                           | Resend; Supabase (`email_message_event`)                                                                  |
| Unlock feedback email + answer    | email, archetype name; the reason tapped, optional chips and own words, device class, subject arm; a hash of the link token                                                                                                                                                                                                                                     | proposed: as the nurture email (consent or legitimate interest); the unlock: contract                                                                                                                                                                                                                                                                          | Resend; Supabase (`unlock_feedback`, `email_message_event`)                                               |
| Payment processing                | Stripe customer id, card brand/last4, charge id, amount, IP, user agent, **Stripe Radar risk_level**                                                                                                                                                                                                                                                            | contract                                                                                                                                                                                                                                                                                                                                                       | Supabase (`payment`, `payment_webhook_event`) + Stripe                                                    |
| Engagement analytics              | analytics_event rows (from 2026-10-16 incl. report chapter reading time and actions, pre-report slides skipped), survey_behavior_event rows (from 2026-10-16 incl. `is_tablet`), scroll depth, time-on-section, click telemetry; funnel_event rows (from 2026-10-16 incl. each survey intro card and its Back and Skip); landing section time (PostHog and GA4) | our own tables: legitimate interest since 2026-09-18 (privacy policy §7.4); funnel_event: every visitor from 2026-10-16 (visitor ID cookie with consent, a page-only id held in memory otherwise), legitimate interest; GA4: cookies and identifiers with consent, cookieless events on every visit from 2026-10-16 (Google Consent Mode), legitimate interest | Supabase (`analytics_event`, `survey_behavior_event`, `funnel_event`) + GA4 + Microsoft Clarity + PostHog |
| Admin operations                  | admin email, action, IP, target resource                                                                                                                                                                                                                                                                                                                        | legitimate interest (operational forensics)                                                                                                                                                                                                                                                                                                                    | Supabase (`admin_action_log`)                                                                             |
| GDPR DSAR                         | email, action (export/delete), admin email, IP, rows_affected JSON                                                                                                                                                                                                                                                                                              | legal obligation (Art. 17 / Art. 20)                                                                                                                                                                                                                                                                                                                           | Supabase (`data_subject_request_log`)                                                                     |
| Mira, the AI coach (beta, §7)     | what people write about their sex life and health, Mira's replies, account data, labels, ratings, feedback, body check answers, nudge records, a random browser id; IP and email in rate-limit counters                                                                                                                                                         | explicit consent (Art. 6(1)(a), 9(2)(a)) for coaching and rated-reply text; contract for the account and its emails; legitimate interest for steps, ratings, nudge opens and abuse prevention                                                                                                                                                                  | Supabase (Zurich), the browser (chats without an account), Anthropic (30 days)                            |

## 2. Categories of data subjects

- Waitlist signups (pre-launch interest, low engagement)
- Survey takers (high engagement, sensitive-by-context data)
- Paying customers (additional payment data)
- Admins (LoveIQ team members; small, identified group)
- Shared-report recipients (third parties invited by the buyer)
- Mira users: adults using the AI coach without an account or with a free one, and the people they mention (§7)

Children (under 18) are explicitly excluded by the Terms of Use. The site does not actively age-verify (a no-UI-changes constraint applies); the policy declaration is the current control. Mira also stops coaching anyone who says they are under 18 (§7.5, M2).

## 3. Risk register

### R3.1 — Re-identification of sensitive answers (HIGH)

A leaked database export would directly link an email to detailed sexual/relational preferences.

- **Likelihood**: low (RLS service-role-only; F-18 RLS boundary integration test verifies)
- **Impact**: high (sensitive-by-context disclosure causing reputational/personal harm)
- **Mitigations**: RLS, no client-side DB access, encrypted Supabase storage at rest, encrypted in transit (TLS), no DB credentials in client bundles, audit-trail on every admin read via `admin_action_log`.

### R3.2 — Function creep (MEDIUM)

Survey answers were collected for archetype scoring. A future product decision could use them for unrelated profiling (e.g., ad targeting).

- **Mitigations**: documented lawful basis per activity (`docs/compliance/LAWFUL_BASIS.md` — T-12). New activities require updated consent + privacy policy + DPIA review.

### R3.3 — Vendor processor risk (MEDIUM)

Stripe, Resend, Supabase and Vercel each process some personal data. Microsoft (Clarity) receives personal data as an INDEPENDENT CONTROLLER, not a processor — see ROPA §"Microsoft Clarity is an independent controller".

- **Mitigations**: DPAs on file with each processor (out-of-repo legal docs). No DPA exists or is obtainable for Clarity — Microsoft runs it as its own controller and does not sign processor addenda. **As of 2026-08-10 there is no technical safeguard either**: consent-gating and the survey mask were both removed by owner decision, so Art. 9 answers reach an independent controller with neither a contract nor consent behind them. Needs legal sign-off. Resend open and click tracking: on for the whole sending domain by owner decision 2026-10-14 (clicks had stayed on; opens follow the disclosure in privacy policy §7.3), see `docs/runbooks/SECURITY.md` T-13/T-14 and §6 below. Our own per-email record keeps ids and a time only.

### R3.4 — Breach via leaked tokens (MEDIUM)

Forwarded email screenshots can leak signed access tokens.

- **Mitigations**: report tokens are revocable via `revoked_at` (manual ops action — F-11 runbook). Per-token expiry infrastructure exists (`expires_at` per F-17) for time-bounded shares. Unsubscribe tokens are short-lived and email-bound.

### R3.5 — Cross-environment fulfillment (CRITICAL — mitigated by T-01)

Test-mode Stripe events accidentally fulfilling against prod data.

- **Mitigation**: T-01 `STRIPE_LIVE_MODE` env gate. Mismatch produces Slack ops alert + 200 ack (no retry storm).

### R3.6 — Storage growth + DSAR scope drift (LOW)

Append-only tables grow without bound; a future DSAR delete must still complete in <30s.

- **Mitigations**: F-02 retention purge on the 4 highest-churn tables; T-17 extends to `cron_run` (90d) + `invite_event` (180d). DSAR helper (F-01) walks all 12 high-PII tables in dependency order.

### R3.7 — Consent versioning drift (MEDIUM — mitigated by T-11)

If Q16015 copy changes, we lose proof of what each user consented to.

- **Mitigation**: T-11 `marketing_opt_in_terms_version` column + `MARKETING_OPT_IN_TERMS_VERSION` code constant. A Yes given once the "miss out" sheet has been shown after a No, in it or on the question after closing it (since 2026-11-10's design, [survey.md](../survey.md)), is stored as `MARKETING_OPT_IN_SHEET_TERMS_VERSION`, which names both the question's version and the sheet copy's (`OPT_IN_SHEET_COPY_VERSION`), so a change to either text keeps the proof.

### R3.8 — Team data export (MEDIUM — pseudonymised by decision, 2026-10-11)

Every customer and product table is exported as CSV to a Google Drive folder shared with six
named team members (Eman, Marcus, Mark, Fatih, Sanjin, Ajna), so the team can explore the data.
What identifies a person is masked: emails become a per-copy keyed code (the same address, the
same code within one copy), and names, birthdays, IP addresses, report links and tokens, card
details, receipt links, promo codes, the email, name and postcode answers and the raw payment
and booking payloads read `[masked]`. Answers about people's sex lives remain, so the copy is
pseudonymised special-category data, not anonymous data.

- **Decision**: Eman, 2026-10-11: "mask the emails and names and those sensitive info",
  replacing the unmasked copy decided on 2026-10-10. Every refresh replaces each file and
  deletes its older versions, so the first masked refresh removes the unmasked copy from Drive;
  copies downloaded before it are outside our reach.
- **Mitigations**:
  - The folder is shared with those six only. Editors cannot share the folder or its files on,
    and there is no link sharing. Every upload first checks the folder and every file it will
    replace are still like that (owned by `ec@`, individual loveiq.org accounts only, no link,
    domain or group sharing) and writes nothing if not.
  - Refreshes run on the server (Vercel, already a processor of this data) when someone asks
    Jarvis, or from a laptop with the script. The data never passes through a chat or an AI
    model. Anyone who can use Jarvis can start one; that changes how fresh the copy is, not who
    can open it.
  - The data-request log is never exported.
  - While anyone has restricted processing (Art. 18), the export does not run at all.
  - The script refuses to write inside a git repository.
  - After an erasure (Art. 17) the export is refreshed the same day
    ([`TEAM_DATA_EXPORT.md`](../runbooks/TEAM_DATA_EXPORT.md)).
- **Residual**: copies a team member downloads are outside these controls. A person can still
  be singled out by a rare mix of answers (age, country, orientation), or by a name typed into
  one of the two open questions, and the internal ids link back to the database, which Jarvis
  can read.

## 4. Data subject rights: how we handle a deletion request, a data export, a DSAR, unsubscribe and the right to be forgotten

| Right (GDPR article)              | Status                                                                     | Mechanism                                                                           |
| --------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Access (Art. 15)                  | ✅ DSAR export endpoint                                                    | `/api/admin/data-subject` action=export (F-01)                                      |
| Rectification (Art. 16)           | ✅ Admin PATCH supports first_name + email (T-08)                          | `/api/admin/submissions/[id]` PATCH                                                 |
| Erasure (Art. 17)                 | ✅ DSAR delete endpoint                                                    | `/api/admin/data-subject` action=delete (F-01), then refresh the team export (R3.8) |
| Restriction (Art. 18)             | ✅ `app_user.processing_restricted_at` column + nurture-cron filter (T-09) | Admin UI for setting it is a follow-up                                              |
| Portability (Art. 20)             | ✅ DSAR export JSON                                                        | F-01                                                                                |
| Objection (Art. 21)               | ✅ Unsubscribe one-click + suppression list                                | `/api/unsubscribe` + Resend Audience cleanup (R-05)                                 |
| Automated decisions (Art. 22)     | ✅ Not solely automated decision-making with legal/significant effect      | Self-knowledge product; no Art. 22 mechanism required                               |
| Withdrawal of consent (Art. 7(3)) | ✅ Unsubscribe + DSAR delete                                               | `/api/unsubscribe` + `/api/admin/data-subject` action=delete                        |

## 5. Security controls

Cross-reference to the security runbook (`docs/runbooks/SECURITY.md`) and the residual-risk audit plan (`C:\claude-home\plans\read-the-file-read-txt-mutable-quilt.md`).

- TLS in transit; Supabase encryption at rest
- CSP (R-11 report-uri), HSTS preload (R-12), CORP (T-16), COOP, X-Frame-Options DENY
- CSRF double-submit cookie + rotation on admin login (R-03)
- Rate-limiting per-IP + per-IP+submission (R-08 IPv6 /64 collapse, R-18 per-submission cap)
- Admin idle timeout 30 min (R-13); concurrent-session cap (T-15)
- RLS service_role-only on all PII tables (F-18 integration test)
- Webhook signature verification + livemode guard (Stripe T-01) + idempotency (Stripe payment_webhook_event UNIQUE; Resend resend_webhook_event UNIQUE; per-email events keyed per email and kind, so a retry adds no row)
- Optimistic locking on admin PATCH (F-05)
- Kill switches for survey/nurture (F-12)
- Backups: Supabase's daily backups (7 days, no PITR) and a weekly encrypted copy outside Supabase (30 days); DR runbook (F-11)

## 6. Outstanding gaps (re-review when these change)

- **Off-Supabase backup — CLOSED 2026-10-29**: a weekly encrypted copy in Vercel Blob (Frankfurt), kept 30 days ([DISASTER_RECOVERY.md](../runbooks/DISASTER_RECOVERY.md) §1).
- **F-09 pre-consent third-party loads — PARTIALLY CLOSED (2026-08-10).** Session
  recording no longer loads before consent: Hotjar and Contentsquare were removed
  and replaced by Microsoft Clarity. **REOPENED 2026-08-10 (owner decision):**
  Clarity was subsequently un-gated — it carries neither `type="text/plain"` nor
  `data-cookieyes`, so it now records every visitor regardless of consent, and
  the `data-clarity-mask` on the survey root was removed, so Art. 9 answers are
  captured. One exception since 2026-09-29: the two free-text boxes for `16019` and
  `16020` carry `data-clarity-mask="true"`, so typed text about the respondent's own
  sexuality is not recorded. See ROPA §"Consent — Clarity is NOT consent-gated". **Also open:**
  GA4 and Google Ads load via
  `next/script` carrying only a `data-cookieyes` attribute, which does NOT
  withhold them. Measured on production 2026-08-10 with the banner untouched,
  these hosts were still contacted pre-consent: `www.googletagmanager.com`,
  `www.google-analytics.com`, `pagead2.googlesyndication.com`. Closing this means
  moving those tags to the same `type="text/plain"` treatment.
- **PostHog autocapture keeps each tapped element's text and attributes, survey answers
  included — owner decision 2026-10-13.** On `/survey` that is the option picked (`$el_text`,
  e.g. "Woman") and the scale's "6 of 7" (`aria-label`) beside the question, tied to the
  person (`distinct_id` = email once they submit): 207,633 such taps from 2,102 people between
  2026-08-24 and 2026-10-13. Masking them at the source (#578) shipped and was reverted the
  same evening at the owner's request; the data stays in PostHog (EU, processor under the DPA),
  as with the replays above. The landing card's own `landing_card_answer` event carries the
  value picked on question 1 (1-7) as well, to PostHog only, never to GA4 (also 2026-10-13).
- **Email opens and clicks are tracked without consent — owner decision 2026-10-14.** Resend's
  open image and wrapped links are on for every email from the sending domain, transactional ones
  included, and every email about the reader's report is kept per reader (`email_message_event`:
  sent, delivered, opened, clicked, bounced, complained and when, and the A/B version, by
  submission id; from 11 Nov 2026 the report-ready email, the receipts and the invite reminders
  too, as privacy policy §7.3 says) whatever the Q16015 answer, on legitimate interest
  and the disclosure in privacy policy §7.3 and the Q16015 guide line. Resend itself records the
  IP, user agent and clicked link; our record does not. Whether the open image needs consent under
  ePrivacy (§25 TDDDG) has not been reviewed by a lawyer.
- **The unlock-feedback email (2026-10-22) asks unpaid readers who opened their report why
  they did not buy, and keeps the reason they tap and any words they add with their
  submission.** Its lawful basis is proposed (LAWFUL_BASIS A15); its audience, like the 72h
  nurture email's, does not check Q16015 (Eman, 2026-10-22). The free-text `note` can hold
  anything a reader types, sexual detail included; it is masked in the admin and the team copy,
  exported and erased with the submission. "Anonymous by default" was taken out of the email
  and /why: the stored record is not anonymous.
- **No two-admin rule on destructive ops** (R-17 deferred). Acceptable for a 1–2 admin team.
- **No DSAR E2E test against branch DB** (R-29 deferred).

## 7. Mira, the AI coach for body confidence (beta)

Assessed 2026-11-20, before Mira's first real users. Mira's own notice is
[`app/mira/privacy/page.tsx`](../../app/mira/privacy/page.tsx); how the feature works is in
[`features/mira/AGENT_README.md`](../../features/mira/AGENT_README.md). Where a point below could
not be confirmed, it says "to confirm".

### 7.1 Why a DPIA is required

Mira processes what people write about their sex life and health (Art. 9 GDPR), with a new
technology (a large language model), for people who may be vulnerable (body image distress,
sexual pain, crises), and sends it to the USA. That is likely to result in a high risk (Art.
35(1)). The German supervisory authorities' list of processing that always needs a DPIA also
names the use of AI to steer the interaction with the people concerned.

### 7.2 Description of the processing

**Controller**: Applied Psychometrics UG (haftungsbeschränkt), Hasenheide 62, 10967 Berlin, HRB
282986 B (Amtsgericht Charlottenburg). **Data protection officer**: Eman Čičkušić,
<ec@loveiq.org>.

**Purposes**

1. Coaching: answering what a person writes, with their coaching style and, for account holders,
   their name, gender and country as context, and their LoveIQ Sexual Personality result only if
   they opt in (off by default).
2. The free account: sign-in by emailed code or with Google, profile and settings, and saved chats
   while "Remember our conversations" is on.
3. Daily nudge emails, on by default for account holders, written by the model from the last chat.
4. Seeing whether Mira helps, and improving her: labels from Mira's replies (intake question
   answered, a new chat's topic, a referral, the support panel shown), the body check (Body
   Appreciation Scale-2) at the start and after 28 days, thumbs (never the reply's text, since
   2026-11-21), feedback, the recommend score and a log of steps.
5. Safety and abuse prevention: the crisis rails, the stop for minors, rate limits and daily caps.
6. Site analytics, as on every page of loveiq.org (PostHog, Microsoft Clarity, Google Analytics,
   Google Ads and Tag Manager, CookieYes).

**Data subjects**: adults (18+) using Mira without an account (the chat lives in their browser) or
with a free account; the people they write about (partners, former partners, family); people
under 18 who use Mira despite the 18+ tick, until they say their age. Team members' own browsers
are left out of Mira's statistics.

**Personal data**

- Art. 9 (sex life, health): the messages and Mira's replies; for account holders the saved chats
  (`mira_chat`, `mira_message`); the labels, among them `crisis_shown` with the country
  (`mira_event`); body check answers and score (`mira_body_check`); the LoveIQ result on opt-in.
- Art. 9, Challenges & goals (from 2026-11-22, §7.12): an account holder's goals in their own
  words, with an optional number of days a week, and the days they ticked them (`mira_goal`,
  `mira_goal_log`); exported and erased with the account by the data-request tool (§4).
- Account (`mira_user`): email, name, gender, country, coaching style, settings (memory, test
  result, nudge time, time zone, frequency, kinds, pause or stop with an optional reason; from
  2026-11-21 the language Mira replies in, and light or dark and the text size), and each consent
  with its time and wording version.
- Usage: the log of steps (`mira_event`: event names, times and small properties, never words
  except the person's own feedback), nudge records
  (`mira_nudge`: kind, fixed subject, day, sent, delivered, first opened, clicked) and sign-in code
  rows (`mira_sign_in_code`: address, time, guesses).
- Ratings and quotes (`mira_review`, from 2026-11-22; §7.12): an account's one rating (1 to 5)
  and, only with its own consent, one sentence with the first name or initials and age range the
  person chose, its consent version and time, and its review status. Covered by data requests
  (export by the account; erased with the account) and purged by an under-18 stop.
- Technical: a random browser id (`mira_anon` cookie, one year), the sign-in cookie (`mira-auth`),
  the display choice (`mira_look` cookie, one year, Mira's pages only: light, dark or system and the
  text size, with or without an account), IP and email addresses as rate-limit keys (Upstash),
  request logs (Vercel).
  IP and email addresses as rate-limit keys (Upstash), request logs (Vercel).
- Sign-in and security (from 2026-11-22): passkeys (`mira_passkey`: credential id, public key,
  signature counter, transports, synced or not, a label, made and last used; no biometric data,
  which never leaves the device); signed-in devices (`mira_session`: the Supabase session id, how
  the person signed in, a device label from the user agent such as "iPhone · Safari", the
  approximate city at sign-in from Vercel's geo header, made and last seen; never the IP); a change
  of email waiting for its code (`mira_email_change`: the new address, a keyed hash of the code,
  when, guesses used); passkey challenges (`mira_webauthn_challenge`, random, 5 minutes); when
  Google last confirmed the address (`mira_user.google_connected_at`); a short-lived cookie with a
  challenge's id (`mira-passkey`, 5 minutes).
- Analytics: what the site-wide tools record on Mira's pages, which includes the chat as it
  appears on screen.

**Flow**: the browser sends each message with the chat so far (the latest 24 turns) to
`/api/mira/chat` on Vercel in Frankfurt. A message plainly about suicide or self-harm gets a fixed
reply and support lines without a model call (`features/mira/server/safety.ts`). Otherwise the
route sends the fixed instructions (no personal data), the person's context and the turns to
Anthropic's Messages API. It sets no `inference_geo`, so Anthropic routes the request globally. For
account holders with memory on, the turns are stored in Supabase in Zurich. Anonymous chats stay in
the browser's local storage until a sign-up carries them into the account. Nothing logs the prompt
or the conversation.

### 7.3 Recipients and transfers

| Recipient                                             | Role                              | What it receives                                                                  | Where, and transfer basis                                                                          |
| ----------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Anthropic Ireland, Limited, with Anthropic, PBC (USA) | Processor (Commercial Terms, DPA) | the messages, the chat so far, the person's context; the nudge prompts            | stored in the USA; requests routed to the USA, Europe, Asia or Australia; SCCs (Modules 2 and 3)   |
| Supabase Inc.                                         | Processor                         | everything Mira stores, and the sign-in users                                     | Zurich (`eu-central-2`): Swiss adequacy decision; Supabase Inc.'s own access: its DPA (to confirm) |
| Vercel Inc.                                           | Processor                         | every request (IP, user agent, URL), messages in transit                          | functions in Frankfurt (`fra1`); company in the USA: DPF and SCCs                                  |
| Resend Inc.                                           | Processor                         | email address, sign-in codes, nudge text; opens and clicks with IP and user agent | USA: SCCs                                                                                          |
| Upstash Inc.                                          | Processor                         | rate-limit keys: IP address, email address, browser id                            | region to confirm; SCCs in its DPA (to confirm)                                                    |
| Google Ireland Ltd. (Sign in with Google)             | Independent controller            | the email address it confirms, and that the person signed in to the "Mira" client | USA: DPF                                                                                           |
| PostHog Inc.                                          | Processor                         | events, autocapture and session recordings of Mira's pages, chat text included    | EU (Frankfurt); PostHog Inc. is in the DPF                                                         |
| Microsoft Ireland Operations Ltd. (Clarity)           | Independent controller            | recordings and heatmaps of Mira's pages, chat text included, without consent      | USA: DPF                                                                                           |
| Google Ireland Ltd. (Analytics, Tag Manager)          | Processor                         | page views and events; identifiers only with cookie consent                       | USA: DPF                                                                                           |
| Google Ireland Ltd. (Ads)                             | Independent controller            | its tag runs on Mira's pages and may set `_gcl_au` before the banner is answered  | USA: DPF                                                                                           |
| CookieYes Ltd.                                        | Processor                         | the consent record                                                                | UK: adequacy decision                                                                              |

Google's roles are Google's own list: Analytics and Tag Manager are processor services, Google Ads a
controller service ([business.safety.google/adsservices](https://business.safety.google/adsservices/)).

**Anthropic, as its own pages state it (read 2026-11-20):**

- **Contract partner**: "'Anthropic' means Anthropic Ireland, Limited if Customer resides in the
  European Economic Area ('EEA'), Switzerland or UK, and Anthropic, PBC if Customer resides
  anywhere else" ([Commercial Terms](https://www.anthropic.com/legal/commercial-terms), effective
  2025-06-17). Our company is in Germany, so the partner should be Anthropic Ireland, Limited (to
  confirm: the billing country of the organization that holds `MIRA_LLM_KEY`).
- **No training**: "Anthropic may not train models on Customer Content from Services" (same terms).
- **Role and transfers**: "Customer is the controller and Anthropic is Customer's processor"; the
  EU SCCs, Module Two (controller to processor) and Module Three (processor to processor), are
  incorporated and deemed executed, with a UK and a Swiss addendum
  ([DPA](https://www.anthropic.com/legal/data-processing-addendum), effective 2025-02-24). The
  DPA's description of processing lists special categories of personal data as "None", while Mira
  sends Art. 9 data (to raise with Anthropic). Anthropic's pages name no EU–US Data Privacy
  Framework certification (to confirm on the DPF list). Its list of subprocessors
  (trust.anthropic.com/subprocessors) only renders with scripts and was not read (to confirm).
- **Retention**: "we automatically delete inputs and outputs on our backend within 30 days of
  receipt or generation", except under a zero data retention agreement (none is recorded for Mira's
  workspace: to confirm), where the law requires it, or to enforce the Usage Policy: for a chat its
  automated trust and safety systems flag, inputs and outputs are kept for up to 2 years and the
  classification scores for up to 7 years
  ([privacy center](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data),
  dated 2026-07-01). The 30-day retention required for "covered models" (Mythos-class) does not
  apply to Sonnet or Haiku
  ([covered models](https://privacy.claude.com/en/articles/15425996-data-retention-practices-for-covered-models)).
- **Location**: "By default, we may route customer traffic to select countries in the US, Europe,
  Asia and Australia ... Note that data is stored in the US"
  ([privacy center](https://privacy.claude.com/en/articles/7996890-where-are-your-servers-located-do-you-host-your-models-on-eu-servers),
  dated 2026-06-15). The API's `inference_geo` offers `global` (the default) or `us` only, and a
  workspace's data stays in the US ([data residency](https://platform.claude.com/docs/en/manage-claude/data-residency)).
  Anthropic's own API has no EU option; Eman decided on 19 Nov 2026 to use it anyway (Mira's
  AGENT_README).

### 7.4 Necessity and proportionality

- **Lawful basis** per purpose: [LAWFUL_BASIS.md](LAWFUL_BASIS.md) A16 to A19. Coaching rests on
  explicit consent (Art. 6(1)(a), 9(2)(a)): a required tick before a first message without an
  account ("I'm 18 or older, and I agree that Mira may process what I share about my sex life and
  health to coach me, and to count, without my words, how Mira is used and whether she helps. Our
  analytics tools also see what I type."), or at sign-up a required "Mira may process what I share
  about my sex life and health to coach me, and to count, without my words, how Mira is used and
  whether she helps". The wording's version is stored with each consent.
- **Purpose limitation**: chats are used for coaching, never for advertising. We do not train
  models on them, and Anthropic may not.
- **Data minimisation**: Mira works without an account (one message, then a free account; a crisis
  message is always answered). The profile asks for little. Chats are stored only while memory is
  on. The test result is used only on opt-in, off by default. A rating keeps the thumbs only. The
  labels and the log of steps hold ids, never words. The model gets the latest 24 turns. Prompts
  and chats are never logged. Nudge subjects are neutral, the inbox preview line is hidden, and a
  nudge's words live only in the chat. Ops alerts carry counts only. Team browsers are left out of
  the statistics.
- **Storage limitation**: §7.6.
- **Accuracy**: people change their profile and settings themselves.
- **Transparency**: the consent ticks link to Mira's notice, which has a recipients table; the
  privacy policy covers Mira in §3.5, §5, §6, §7 and §9.
- **Rights**: chats and the account can be deleted in Settings; data requests (access, copy,
  deletion) cover all Mira data, from 2026-11-22 also passkeys (ids, labels, public keys), devices
  and a pending change of email (never a code's hash or a challenge); the DPO is named in both
  notices.
- **Alternatives**: EU-only processing (Claude on Google Cloud or Amazon Bedrock in the EU) was
  asked for on Sanjin's coach board; Anthropic's own API was chosen on 19 Nov 2026. Revisit before
  Mira leaves the beta.

### 7.5 Risks and measures

#### M1 — Disclosure of what people tell Mira (HIGH before, LOW–MEDIUM after)

A breach, a wrong sign-in or an inbox read by someone else would reveal intimate and health
details.

- **Measures**: tables readable by the service role only (RLS), no database access from the
  browser, TLS, encryption at rest; sign-in by a code that works once for an hour, with 25 guesses
  reserved before each check and limits per address and network, or by Google (trusted only for
  Gmail and Workspace addresses, never for `admin_users`); Mira's own sign-in cookie; neutral
  sender and subject on every email and a hidden neutral preview line; backups encrypted and kept
  30 days; nothing logs the conversation.
- **Residual**: low to medium.

#### M2 — Minors (HIGH before, MEDIUM after)

- **Measures**: an 18+ tick before the first message and at sign-up; the terms of use require 18+.
  Anyone who says they are under 18 is stopped for good on that account or browser: nudges off,
  the account's saved chats deleted, a browser chat cleared, and (from 2026-11-21) the account's
  reply language and display choices cleared; Settings then refuses changes (403).
- **Residual**: medium. Age is self-declared; there is no age verification.

#### M3 — Crises: suicide, self-harm, abuse (HIGH before, MEDIUM after)

- **Measures**: a plain crisis message gets a fixed reply and support lines without a model call,
  and is never stopped by any limit; the model ends a reply with `[[CRISIS]]` when a stop rail
  fires, which opens the support panel; support lines for nine countries, checked on 2026-11-20
  (re-check by 2027-02-20); no nudge for 14 days after a crisis. Mira replies in the language the
  person writes in, or one they choose in Settings (from 2026-11-21); the languages offered are
  only those whose crisis words the fixed check reads, and the fixed crisis reply, the under-18
  message and the support lines stay in English.
- **Residual**: medium. Keyword and model detection can miss a crisis. A message in a language the
  fixed check doesn't read relies on the model's marker alone, as before.

#### M4 — Wrong or harmful model output (HIGH before, MEDIUM after)

- **Measures**: Sanjin's rules and safety rails in the instructions, research only from the
  evidence cards, replies of at most 250 words, a referral marker, "not therapy" on every page and
  in the terms, the beta label, a fallback model, and ratings and feedback read by the team.
- **Residual**: medium.

#### M5 — Analytics see the chat (HIGH, owner's accepted risk)

PostHog and Microsoft Clarity record Mira's pages, including the chat text shown on screen;
Google's tags and CookieYes load too. Clarity runs without consent site-wide (owner decision
2026-08-10), and Microsoft is an independent controller in the USA with no per-person deletion.

- **Measures**: disclosure only: the chat consent says "Our analytics tools also see what I type",
  and both notices say so. PostHog is a processor in the EU.
- **Why it stays high**: Art. 9 content reaches an independent controller in the USA. The basis the
  privacy policy states for this measurement, legitimate interest (§7.4), is not an Art. 9(2)
  condition, and the explicit consent's purpose is coaching, so whether the sentence inside it
  covers analytics is doubtful.
- **What would lower it** (not taken, by owner decision): mask the chat in both tools
  (`data-clarity-mask`, PostHog's `ph-no-capture`), or not load them on `/mira`.

#### M6 — Transfers to the USA (MEDIUM)

- **Measures**: Anthropic as a processor under SCCs, deleting within 30 days and not training on
  the data; the context sent is minimal. Resend under SCCs; Vercel, Google, Microsoft and PostHog
  under the DPF.
- **Residual**: medium. US authorities' access remains possible. Sex and health topics may trip
  Anthropic's trust and safety classifiers more often than other chats, and a flagged chat is kept
  for up to 2 years.

#### M7 — Email open tracking on nudges (owner's accepted risk)

- **Measures**: the open image is on for the whole sending domain (owner decision 2026-10-14, §6);
  our record keeps the nudge id and times only; disclosed in the privacy policy §7.3 and Mira's
  notice; images off stop it.
- **Residual**: low to medium. Whether the open image needs consent under §25 TDDDG has not been
  reviewed by a lawyer.

#### M8 — Nudges on by default (owner's accepted risk)

- **Measures**: said on the sign-up's "About you" step, in Mira's notice and the terms, and in every
  nudge ("Daily nudges from Mira come with your free account"); at most one a day; pause and
  one-click stop in every email and in Settings; none while chatting, for 14 days after a crisis,
  to suppressed addresses or without remembered chats.
- **Residual**: medium. Whether a nudge counts as advertising that needs prior consent (§7 UWG) has
  not been reviewed by a lawyer.

#### M9 — Other, LOW

- **The LoveIQ result**: opt-in, off by default, matched only on the confirmed email.
- **One login with staff and Jarvis**: admin routes check `admin_users`, Jarvis checks its members,
  and no table grants the `authenticated` role anything; deleting a Mira account keeps only a staff
  or Jarvis login.
- **People named in chats**: no profile is built about them; their mention goes with the chat.
- **Sign in with Google**: Google learns that the person signed in to Mira; it is optional.

#### M10 — Account takeover through sign-in (MEDIUM before, LOW after; from 2026-11-22)

Passkeys, signed-in devices and a change of email add ways in and out of an account whose chats
are Art. 9 data.

- **Passkeys** are Mira's own WebAuthn relying party (not Supabase's project-wide passkeys, which
  any session in the shared project could use to add a way into the admin panel or Jarvis). The
  relying party and origin are each site's own; a challenge is single use, lives 5 minutes and is
  bound to the browser (httpOnly cookie) and, for a new passkey, to the account; user verification
  is required; the signature counter may only move forward. A passkey sign-in makes the same
  session an emailed code makes, never for `admin_users`.
- **A device left signed in** (a shared computer, a stolen cookie) can't add a passkey or change
  the address: both need a sign-in from the last 15 minutes. The person sees every signed-in device
  with its approximate city and can sign out one or all; Mira honours only sessions its own sign-in
  recorded, on every request, so signing out takes effect at once and a session minted elsewhere in
  the shared project is refused.
- **A change of email** needs an 8-digit code sent to the new address (an hour, 5 guesses, rate
  limited like sign-in codes, suppression-aware), never reveals whether an address has an account
  before the code proves it is the person's, and tells the old address. Staff and Jarvis logins
  can't be changed or moved onto.
- **Under 18**: the stop also deletes the account's passkeys, and none can be added again.
- **Residual**: Supabase keeps a signed-out device's refresh token until that device next calls
  Mira (then Mira ends it); it opens nothing in Mira, and no table grants the `authenticated` role
  anything. The device city is approximate, from Vercel's geo lookup at sign-in.

### 7.6 Retention

- Without an account: the chat stays in the browser; a new chat or clearing site data removes it.
- Saved chats: until deleted in Settings, with the account, or 12 months after the person's last
  message (`mira_forget_old_memory`, daily). With "Remember our conversations" off, no new chats
  are saved; earlier ones stay until deleted or the 12-month limit.
- Account, profile, body checks, nudge records: until the account is deleted.
- `mira_event`: 12 months; deleting the account removes any words and unlinks the rest.
- Sign-in codes: deleted when used, otherwise after a day. Sign-ins that never finished sign-up:
  24 hours.
- Passkeys: until removed in Settings, the account is deleted, or Mira stops the person as under 18. Signed-in devices: until signed out, or 90 days after last seen (then that device signs in
  again). A change of email waiting for its code: deleted when used, otherwise after a day. Passkey
  challenges: deleted when checked, otherwise by the next daily run (they expire after 5 minutes).
- Backups: Supabase's daily backups for 7 days and the weekly copy for 30 days
  ([DISASTER_RECOVERY.md](../runbooks/DISASTER_RECOVERY.md)).
- Rate-limit counters: expire by themselves, within 30 days at most.
- Anthropic: 30 days; flagged chats up to 2 years, classification scores up to 7 years.
- Analytics: per tool (PostHog session recordings 30 days; Clarity recordings 30 days, heatmaps and
  marked or sampled recordings up to 9 months).

### 7.7 The owner's accepted risks

Recorded as owner decisions, not as risks this assessment found acceptable on its own:

1. **Analytics on Mira's pages stay as they are** (M5), including Microsoft Clarity without consent
   (owner decision of 2026-08-10, kept for Mira on 2026-11-20). The chat is not masked in Clarity
   or PostHog either (owner decision of 2026-11-21), so the Berlin Commissioner is consulted before
   Mira is promoted (7.10, condition 1).
2. **Nudges on by default** for new accounts (M8).
3. **Nudge open tracking** (M7).
4. **Mira stays on Eman's own Anthropic organization** ("Eman's Individual Org") and its keys, not
   a company account (owner decision of 2026-11-21). Who the contract is with is still to confirm
   (7.9 point 1).
5. **Anthropic's DPA as it is** (owner decision of 2026-11-21): Mira keeps calling Anthropic's API
   under its standard DPA, although Schedule 1 (B.3) lists no special categories and Mira sends
   Art. 9 data. Not chosen: asking Anthropic for a signed change, and moving the model calls to
   Google Cloud (Vertex AI) or AWS Bedrock in the EU, whose contracts cover such data but where the
   Team plan's monthly API credits do not apply. This does not follow the DPO's condition 2 (7.10).

### 7.8 Residual risk

Overall medium, with M5 high. Where a DPIA shows a high risk that the controller does not reduce,
Art. 36(1) GDPR requires consulting the supervisory authority (for us, the Berlin Commissioner for
Data Protection and Freedom of Information) before that processing continues. The DPO's opinion
below should say whether M5 is high after the measures. If it is, the choice is to consult or to
take one of the M5 measures.

### 7.9 Open points

1. **Anthropic**: confirm the contract partner (Anthropic Ireland, Limited for an organization in
   Germany) and that no zero data retention agreement exists; check the DPF list and the list of
   subprocessors. The DPA's "special categories: None" (Schedule 1, B.3) stays as it is (7.7,
   item 5).
2. **Supabase and Upstash**: confirm the SCCs for Supabase Inc.'s own access and Upstash's region.
3. **Consent scope**: resolved 20 Nov 2026: the consent now names counting "without my words, how
   Mira is used and whether she helps" (labels, body check comparisons), within version
   `mira-2026-11-21`, which had not shipped yet.
4. **The DPO**: registered with the Berlin authority (Art. 37(7)), confirmed by Marcus on
   2026-11-21. Still to check, Art. 38(6): Eman also leads engineering and decides how Mira
   processes data, a role the Article 29 Working Party's DPO guidelines (WP243 rev.01) name as a
   typical conflict of interest.
5. **§25 TDDDG**: the browser id cookie is needed for the free limit but also links anonymous
   statistics; the nudge open image (M7).
6. **§7 UWG**: nudges on by default (M8).

### 7.10 DPO's opinion (Art. 35(2))

Eman Čičkušić, data protection officer:

- [ ] I agree with this assessment.
- [x] I agree on these conditions:
  1. M5 is still high after the measures, so Art. 36(1) applies: mask the chat in Clarity and
     PostHog (or don't load them on `/mira`), or consult the Berlin Commissioner. Until one of
     these is done, Mira is not promoted.
  2. Anthropic's DPA lists no special categories (Schedule 1, B.3), while Mira sends Art. 9 data.
     Before Mira is promoted, get that covered in writing, or move the model calls to a provider
     whose contract covers it.
  3. The other open points in 7.9 are settled by the review in 7.11.
- [ ] I disagree, because: …

Date: 2026-11-21

The controller's answer to the conditions, 2026-11-21 (advice that is not followed is written down
with its reasons, WP243 rev.01, 4.2):

1. Condition 1: the chat stays visible to Clarity and PostHog (7.7, item 1). M5 therefore stays
   high, and the Berlin Commissioner is consulted under Art. 36(1) before Mira is promoted.
2. Condition 2: not followed (7.7, item 5). Anthropic's DPA does not exclude special categories and
   leaves the categories of data subjects and personal data to the customer (Schedule 1, B.1 and
   B.2). A signed change is unlikely for an organization of our size, and the providers whose
   contracts name such data are cloud platforms where the Team plan's monthly API credits do not
   apply. The residual risk is accepted and looked at again in the review (7.11).
3. Condition 3: as the DPO set it.

### 7.11 Review

By 2027-02-20 (with the crisis-line re-check), and earlier when Mira's data, recipients, model or
consent wording change, or before Mira leaves the beta.

### 7.12 Coaches, suggestions and search (from 2026-11-22)

What changed (`features/mira/content/coaches.ts`, `features/mira/ui/coaches`,
`app/api/mira/coaches`): a coaches page listing Mira and five coaches who are not live yet, "Notify
me" for each of them, a two-question "Find my challenge", "Picked for you" and "Your coaches" on
Home, a search on Home, and "Ask Mira about this" after each of the guide's practices.

- **New processing**: a chat's topic label (`chat_topic`, already kept to count topics) is now also
  used to coach the person: Home suggests guide practices, and sometimes a coach, from it. Only
  rows written under the account (`user_id`) are read, never a browser id's, because a browser can
  be shared and another person's topics must not shape the account's picks. Nothing is used while
  "Remember our conversations" is off, and nothing from before the person's last "Delete all
  chats". Only the person sees the suggestions.
- **New labels in `mira_event`**, ids and numbers only: which coach a "Notify me" was for
  (`notify_me`), which coach the finder suggested (`finder_done`, never the answers), the coaches
  page and finder opened, picks shown and tapped, which practice a chat was opened from
  (`guide_ask`), and searches that found nothing (`search_empty`, never the words; the search runs
  in the browser). A "Notify me" or a finder outcome says which sex-related challenge the person
  is interested in, so it is Art. 9 data, like the topic labels.
- **Basis**: the A16 consent, as for Mira's other labels (LAWFUL_BASIS A21).
- **Measures**: "Notify me" needs an account (there is no one to tell otherwise); the route lets in
  only the listed ids and numbers, so no words can reach the log; someone stopped as under 18 is
  refused (403) and their "Notify me" requests are deleted (`stopForMinor`), so no one under 18 is
  told a coach for sex is ready; no new table, so data requests and account deletion cover these
  rows as all of `mira_event`.
- **Retention**: 12 months, as `mira_event` (7.6). A "Notify me" request older than that is gone,
  so nobody is told about a coach a year after asking.
- **Risk**: LOW after the measures. Who is told when a coach is ready, how and by whom, is to be
  decided before the first such email (7.9).
- **Open**: the system prompt lets Mira name only Jonas and Ana as coming soon; the coaches page
  names five. Whether Mira may name the other three is Sanjin's call.
### 7.12 Challenges & goals (added 2026-11-22, before release)

A signed-in person can keep a few small goals (at most five on the go) in their own words, with an
optional number of days a week, tick the days they do one, and see the last 8 weeks. Mira can offer
a goal in a reply (`[[GOAL:…]]`, shown as "Add as a goal"), and while the person chats she is given
their goals on the go with this week's ticks, so she can check in at most once a chat. How it works:
[`features/mira/AGENT_README.md`](../../features/mira/AGENT_README.md), "Challenges & goals".

- **Data (Art. 9)**: each goal's words (often about sex), the days a week, whether it came from
  Mira's suggestion, put away or done, and one row per day ticked, the day in the person's time
  zone (`mira_goal`, `mira_goal_log`). Account holders only: an anonymous visitor's "Add as a goal"
  leads to sign-up and sends nothing.
- **Purpose and basis**: coaching (purpose 1), under the same explicit consent as the chat (A16;
  [LAWFUL_BASIS.md](LAWFUL_BASIS.md) A21). Counting goals is purpose 4, by ids and numbers only
  (`goal_suggested`, `goal_set`, `goal_logged`, `goal_completed`, `goal_archived`, `goal_deleted`,
  `goals_deleted`); AP's Goals card reads the tables by ids and times, never a goal's words.
- **Recipients**: Anthropic gets the goals on the go with each message of a signed-in person, as
  part of the person's context (7.3). PostHog and Clarity see goals as they show on the goals page
  and on Home (M5, the owner's accepted risk, 7.7 item 1). `mira_*` tables stay out of the team's
  data export (R3.8).
- **Minors (M2)**: the under-18 stop deletes the account's goals with its chats, and such an account
  or browser can no longer see, add, change or tick goals; deleting them always works.
- **Rights**: one goal or all of them can be deleted on the goals page, with their ticks; deleting
  the account deletes them (cascade); the data-request tool exports and erases both tables (§4).
- **Retention**: until deleted on the goals page or with the account.
- **Risks and measures**: a goal can be as sensitive as a chat message, so it has the chats'
  protections (service role only, RLS on, every query scoped to the account, a tick tied to its own
  goal by the database, no words in the log). A coach that nags or shames would do harm: Mira's
  instructions allow one check-in a chat, celebrate what was done and never call a week missed, and
  the screens show a quiet week only as an empty bar while the total keeps growing.
- **Open points**: (1) unlike saved chats, goals have no 12-month limit: forget goals with no
  activity for 12 months in `mira_forget_old_memory`, or decide that they stay with the account;
  (2) Jarvis's live data tool (`query_product_data`, `app/api/mcp/route.ts`) masks columns by name
  but does not leave out `mira_*` tables, so `mira_message.content` (already) and `mira_goal.text`
  can be read through it: leave `mira_*` out, as the team export does.
### 7.12 Ratings and quotes (from 2026-11-22, to be checked by Eman)

**What**: at a good moment in the chat (a 9 or 10 on the recommend question, or the third
thumbs-up in one chat; never in a chat with a crisis, after an under-18 stop, a referral or the
body check, at most once in 30 days per browser), a signed-in person may rate Mira from 1 to 5 and,
only with a separate tick, give one sentence for others, shown with the first name or initials and
the optional age range they choose (no photos). Mira's pages show the average, how many people
rated and one approved quote a day, only once 20 different people who are not the team's and not
under 18 have rated and a quote is approved (`features/mira/reviews.ts`). Code, table and checks:
`features/mira/AGENT_README.md`, "Ratings and quotes".

**Data**: `mira_review`, one row per account: the stars; with the tick, the words, the name and age
range, the consent's wording version and time, the review status and which staff address decided;
whether it came from a team browser. Events `review_prompt_shown`, `review_prompt_not_now`,
`review_given` (whether words came with it) and `review_withdrawn`, never stars or words.

**Basis**: the stars, counted into an average shown without names: (f) legitimate interest
(honest ratings for visitors). The words, name and age range, which may reveal the person's sex
life or health: (a) explicit consent with Art. 9(2)(a), a separate box the person ticks themselves ("I agree that
Mira's pages may show these words publicly, with the name and age range above. Our team reads them
first and may take out a detail that could identify someone, marked […]; nothing else is changed. I
can take this back in Settings at any time."), version `mira-review-2026-11-22` stored with the
words ([LAWFUL_BASIS.md](LAWFUL_BASIS.md) A21).

**Recipients**: anyone who opens Mira's pages, for approved words (publication); staff with AP
access read the words waiting for approval.

**Risks and measures**

- **M10, someone identified from published words (MEDIUM before, LOW after)**: one sentence, a
  first name or initials and an age range only; every quote read by staff before it shows; the only
  edit allowed is replacing an identifying detail (at most three words, never a negation) with a
  visible […] (`redacted()` refuses anything else, in AP and on the server), and the writer sees
  both versions in Settings; rejecting deletes the words; the person can stop showing them or
  remove the rating in Settings, effective from the next page view (the cached figures are
  revalidated at once), and deleting the account or a data request does the same.
- **M11, fake or unverified reviews (UWG Annex Nos. 23b, 23c; §5b(3))**: only signed-in accounts
  rate, once each (unique per account); the team's accounts and browsers and under-18s never count;
  nothing shows below 20 people or without an approved quote; "How we check reviews" beside every
  rating says how they are checked. No sample figures anywhere.
- **M12, minors**: an under-18 stop deletes the rating and words, even approved ones; Mira's rating
  routes refuse such an account (403), except taking back, which is never refused; the public
  figures leave such accounts out, from the next request even if the delete failed.
- **M13, pressure to rate**: one ask at a good moment, "Not now" respected for 30 days, never near a
  crisis, a referral or the body check, nothing withheld for not rating.

**Retention**: until the person takes it back or deletes the account; words not approved are
deleted when rejected; events as `mira_event` (12 months). **Residual risk**: low.
### 7.12 Talking to Mira by voice (2026-11-22)

Built on 2026-11-22 from Eman's brief for Mira's post-MVP features and Mark's boards "Main" (Talk)
and "Home" (session recordings). How it works: [`features/mira/AGENT_README.md`](../../features/mira/AGENT_README.md),
"Talking to Mira by voice". Mira's notice says it in its own section.

**What changes**

- Speech becomes text in the person's browser, never on our side: on the device where the browser
  can (Chrome's on-device recognition), else in the browser maker's own speech service (Apple's
  for Safari; Google's for Chrome without on-device support). The text goes to `/api/mira/chat`
  like a typed message, through the same consent, crisis rails, minor stop, limits and sign-up
  card. No audio reaches us or Anthropic, and none is stored.
- Mira's replies are read aloud only by a voice on the device (`localService`): an online voice
  would send her words, which reflect what the person said, to another company.
- With an account and memory on, a voice session is kept as words (`mira_voice_session`, migration
  20261122030000): its turns stay `mira_message` rows tagged with the session; the row adds the
  start, end, length, the words per side, the recognition mode and up to three key points that
  Anthropic's model writes under Mira's rules. Art. 9 data: the key points sum up what the person
  said about their sex life and body.
- KPI events `voice_session_ended` (seconds, mode, turns, kept, the session's id, the number of
  key points) and `voice_points_opened` (the session's id): ids and numbers, never words.
- The site's Permissions-Policy lets Mira's pages, and only them, use the microphone
  (`microphone=(self)` on `/mira` and `/mira/*`; `microphone=()` everywhere else).

**Recipients**: a browser maker's speech service, when used, works under the browser's own terms,
not on our instructions, so it can't be our processor. Anthropic (processor, 7.3) gets the
session's words a second time, to write the key points.

**Risks and measures**

- **V1, the browser maker hears the voice (MEDIUM)**: on-device first; a one-time notice with a
  tick names the service before its first use; Talk is not offered where no recognition exists.
  Residual: what Apple or Google keep of the audio is set by their terms, which we can't change,
  and Safari offers no way to ask for on-device recognition.
- **V2, key points are new sensitive data (MEDIUM before, LOW after)**: the same rules as her
  replies; none when a stop rail fired (the crisis or refusal message, crisis words) or when the
  model answers NONE; kept only with memory on; deleted with the session, the chat, the account,
  the 12-month forgetting and the under-18 stop (`deleteRecordings` in `stopForMinor`); staff data
  requests export `mira_voice_session` with the account (`features/admin/server/data-subject.ts`).
- **V3, captions on screen (as M5)**: the words appear on the page as they are spoken, where
  PostHog and Clarity see them like typed text: no new exposure, the same owner's accepted risk.
- **V4, someone nearby, or a misheard word (LOW)**: the caption shows what was heard before it is
  sent; Mute and End stay on screen; a pause or a tap sends; leaving the tab or opening a panel
  pauses the microphone; someone stopped as under 18 is refused on every voice route.

**Retention**: as the chat (7.6): the session and its words go with the chat or the account, at the
latest 12 months after the person's last message. Without an account nothing is kept beyond the KPI
event (12 months, as `mira_event`).

**Open**: (1) whether a browser maker's speech service must be named per browser in the notice
(it names Apple's and Google's as examples); (2) Android: whether Chrome reports its own voices as
on the device; where it does not, Mira answers in writing there.

## 8. Sign-off

By committing this file, the data controller (Eman) confirms the DPIA has been reviewed and the residual risks are accepted given the documented mitigations.

Next mandatory review: 2027-05-26.
