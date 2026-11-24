# Lawful Basis Map — LoveIQ Web

> Owner: Eman.
> Last reviewed: 2026-05-26.
> Review cadence: when a new processing activity is added, OR when an existing activity's purpose materially changes.

GDPR Art. 6(1) requires a documented lawful basis for every processing activity involving personal data. This file maps each activity in LoveIQ Web to its basis. Companion documents:

- `docs/compliance/DPIA.md` — broader risk assessment + data-subject rights
- `docs/compliance/ROPA.md` — Article 30 records of processing
- `docs/runbooks/SECURITY.md` — implementation-level safeguards
- `app/privacy-policy/page.tsx` — public-facing disclosure

## Bases in use

LoveIQ relies on three of the six Art. 6(1) bases:

| Basis                       | Used for                                                                                                                                                                                                    | Notes                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) Consent**             | Survey participation, marketing emails (Q16015), analytics + tracking cookies, Mira coaching (with Art. 9(2)(a); A16, A21 to A26)                                                                           | Each instance has explicit opt-in. Marketing consent is versioned (`marketing_opt_in_terms_version`, T-11). Analytics cookies gated on CookieYes "analytics" category (T-02). |
| **(b) Contract**            | Report delivery, payment processing, transactional emails (confirmation, share-link, password-reset adjacent flows), Mira's account, sign-in and emails (A17)                                               | Lawful basis is "necessary for the performance of a contract" because the user requested + paid for the deliverable.                                                          |
| **(f) Legitimate interest** | Operational forensics (admin_action_log), abuse detection (rate limits, CSRF storm counters), email-bounce suppression, payment-fraud monitoring (Stripe Radar), each nurture email's opens and clicks (A6) | Balancing test documented per activity below. No marketing under legitimate interest — we use consent (but see the A6 correction).                                            |

Bases NOT in use: (c) legal obligation (we don't process for tax/accounting beyond what Stripe handles), (d) vital interests, (e) public task.

## Activity-by-activity map

### A1 — Waitlist signup

- **Data**: email, optional first_name, UTM context, IP, timestamp
- **Basis**: (a) consent — user submits the form intentionally; the call-to-action is "join the waitlist"
- **Retention**: indefinite until user requests deletion (DSAR via F-01)
- **Withdraw**: `/api/unsubscribe` one-click link in every email + admin-initiated DSAR delete

### A2 — Survey submission

- **Data**: email, first_name, ~60 question answers including sensitive-by-context data, IP, session_id, duration, UTM context (campaign tags; click ids: Google's ad click ids `gclid`/`gbraid`/`wbraid` and, from 2026-10-16, Meta's `fbclid`, which Meta adds to any link click, ad or not; from 2026-10-16 the referring site's hostname, never its full address)
- **Basis**: (a) consent — survey landing page + intro screen make the purpose explicit
- **Retention**: until DSAR deletion. Partial saves >30d are auto-purged (F-02).
- **Withdraw**: DSAR delete (F-01)

### A3 — Archetype scoring

- **Data**: derived from A2 (no new personal data)
- **Basis**: (b) contract — scoring IS the product the user requested
- **Retention**: follows the survey_submission lifecycle
- **Determinism / explainability**: `config_sha` stamped on every row (F-03); historical CSV configs preserved in `.source-artifacts/scoring-v<N>/`

### A4 — Report delivery

- **Data**: personal_report row, signed access token, share-link tokens
- **Basis**: (b) contract — generating + delivering the report
- **Retention**: tokens permanent (revocable); optional expiry via `expires_at` column (F-17)
- **Token revocation**: ops sets `revoked_at` via Supabase dashboard or direct SQL (no admin UI yet; documented limitation)

### A5 — Transactional email (purchase confirmation, share-link delivery)

- **Data**: recipient email, first_name, signed unsubscribe token, content
- **Basis**: (b) contract — the email IS what the user paid for / requested
- **Retention**: Resend's processor-side log per its DPA, opens and clicks included: Resend's tracking is set per sending domain, so these emails carry the open image and wrapped links too (owner decision 2026-10-14, see A6). On our side only daily totals of opens and clicks (Upstash, 8 days); no per-message copy. Suppression rows kept (intentional retention for compliance).

### A6 — Marketing email (nurture sequence)

- **Data**: same as A5 plus a Stripe promotion code at the `72h_no_unlock` stage (the 30h/54h ladder was retired by pricing 2.0, and the `78h_no_unlock` call invite was removed with the Calendly integration on 2026-09-14 — one nurture email now goes out per unconverted reader). Since 2026-10-14, per email: whether and when it was delivered, opened, clicked or bounced, with its stage and the reader's submission id (`email_message_event`; Resend's id for the email, never the address, IP, user agent or clicked link)
- **Basis**: (a) consent where the reader said Yes to Q16015. The submit stamps `marketing_opt_in_terms_version` (T-11) so we can prove what consent text the user saw, in its follow-up update right after the `submit_survey` RPC (best effort: a failed update is logged and leaves that row without a version). A Yes given once the opt-in's "miss out" sheet has been shown (it only opens after a No; the Yes can come in the sheet or on the question after closing it) is stamped `2026-10-14+sheet-2026-11-10`: that reader saw both texts ([survey.md](../survey.md)). Correction 2026-10-14: the nurture cron does not check Q16015. A No keeps the emails about the reader's own report (decision "option a" in `app/api/survey/route.ts`), so for those readers the email itself has no documented basis yet.
- **The State of Desire tick** (the survey sheet after Q16005, while its switch is on): (a) consent, the tick itself ("I am interested in the study. Email me a 5€ off code."). The submit stamps `state_of_desire_opt_in_at` and `state_of_desire_opt_in_version` (the box's words, `DESIRE_SHEET_COPY_VERSION`) in a follow-up update of its own (best effort, logged). Mark sends the one email with the code by hand from the submission's #incoming-surveys message; nothing sends it by itself (17 Nov 2026).
- **Per-email opens and clicks**: (f) legitimate interest, for every nurture email whatever the Q16015 answer (owner decision 2026-10-14), and from 11 Nov 2026 for every email about the reader's report (report ready, receipts, invite reminders; privacy policy §7.3 already says "the emails about your report"): seeing which emails are useful and improving them. Balancing test: ids and a time only; disclosed in privacy policy §7.3 and the Q16015 guide line (T-11 version `2026-10-14`); turning images off stops the open record; objection by unsubscribing or by email (Art. 21). Not reviewed by a lawyer: whether the open image needs consent under ePrivacy (§25 TDDDG), the point T-13/T-14 raised in `docs/runbooks/SECURITY.md`.
- **Retention**: same as A5 (Resend processor) + nurture stage markers in `report_price_quote.metadata.nurtureEmailsSent[]` + `email_message_event` rows: 180 days once the retention purge runs (postponed); until then until the submission is erased, which cascades
- **Withdraw**: any unsubscribe → suppression list → the Resend contact is marked unsubscribed (R-05), so campaigns sent from Resend skip it on every list

### A7 — Payment processing

- **Data**: Stripe customer id, card brand/last4, charge id, amount, IP, user-agent, Stripe Radar risk_level (T-04 stores it)
- **Basis**: (b) contract — fulfilling the purchase
- **Retention**: indefinite for accounting; DSAR delete preserves payments (DSAR helper warns "payment data retained, accounting retention")
- **Subprocessors**: Stripe (separate DPA)

### A7a — Payment before the survey (pay to start, from 2026-10-18)

- **Data**: an opaque entitlement token (httpOnly cookie, 30 days), the email Stripe collects at checkout, the price shown and paid, the Stripe session and payment intent, the visit's attribution (`utm_tracker`), and when it was paid and claimed (`prepaid_report_access`)
- **Basis**: (b) contract: the buyer pays for a survey and a report delivered after it, and the row is how the paid survey is identified and the confirmation email (with the link back to the survey) is sent
- **Retention**: with the payment, for accounting; DSAR erasure strips `customer_email` and `utm_tracker`, export returns the rows without the token
- **Subprocessors**: Stripe, Resend (the confirmation email), Supabase

### A8 — Engagement analytics

- **Data**: analytics_event rows (event_type + metadata; from 2026-10-16 also `report_chapter_stats`, how long each report chapter was read and which of its actions were used, and `wizard_skipped`, the pre-report slides skipped; from 2026-10-17 the report's guided tour started, finished, skipped (at which stop) or replayed), survey_behavior_event rows (from 2026-10-16 with `is_tablet`), invite_event rows, scroll depth, time-on-section, click telemetry; funnel_event rows (unique visitor, survey start and, from 2026-10-16, each survey intro card seen and its Back and Skip); client-side: GA4, Microsoft Clarity, PostHog (from 2026-10-16 with the time spent on each landing section, also sent to GA4)
- **Basis**: our own tables (analytics_event, survey_behavior_event, invite_event): (f) legitimate interest since 2026-09-18 (commit `60924b5ab`, privacy policy §7.4): no cookie set or read, nothing sent to a third party, so these writes no longer check the cookie choice. funnel_event: every visitor from 2026-10-16 (owner decision: measure everyone), keyed by the visitor ID cookie (`__liq_vid`, still set only after consent to the CookieYes "analytics" category, T-02) or, without it, a random id held in the page's memory and never stored (`features/analytics/funnelVisitor.ts`): (f) legitimate interest, as our own tables. GA4: from 2026-10-16 our events go to Google's tag on every visit; without consent the banner's denied signal makes them cookieless pings (Google Consent Mode), (f) legitimate interest; GA4 cookies and identifiers only with (a) consent. Microsoft Clarity and PostHog load on every visit (owner decisions, ROPA #9 note).
- **Retention**: 180 days (F-02 purge)

### A9 — Advertising tracking (Google Ads; no Meta or TikTok pixel fires, checked on production 2026-10-15)

- **Data**: Google Ads conversions (value, currency, transaction id); cross-site identifiers only with consent
- **Basis**: from 2026-10-16 a conversion is sent for every purchase (owner decision: measure everyone). Without "advertisement" consent the banner's denied signal makes it a cookieless ping (Google Consent Mode), and the server-side GA4 copy carries `ad_user_data`/`ad_personalization` DENIED: (f) legitimate interest. Identifiers and ad cookies only with (a) consent (CookieYes "advertisement" category). The tag manager's own dataLayer push (any pixel in the container) stays behind consent.
- **Retention**: vendor-controlled

### A10 — Operational forensics (admin_action_log, cron_run)

- **Data**: admin email, action, IP, target resource, timestamp; cron name + run status + error
- **Basis**: (f) legitimate interest — operating + securing the service
- **Balancing test**: data is minimal (no full request bodies, no PII beyond admin identity), retention is bounded (`cron_run` 90d via T-17; `admin_action_log` intentionally indefinite per F-19 audit trail)
- **Data subjects**: admins themselves (not end users)

### A11 — Abuse detection

- **Data**: rate-limit counters (per IP, per (IP, submission_id)), CSRF storm counters, honeypot trips, Stripe webhook signature failures
- **Basis**: (f) legitimate interest — service integrity
- **Balancing test**: rate-limit data is short-lived (sliding window in KV); honeypot trips are operational metadata not used for any profiling
- **Retention**: rate-limit keys auto-evict via KV TTL; honeypot Slack pings are logs only

### A12 — Email-bounce suppression

- **Data**: email + reason ("hard_bounce" | "complaint" | "unsubscribed") + timestamp
- **Basis**: (f) legitimate interest — preventing future spam to bounced/complained addresses (RFC 8058 + ISP best practice)
- **Balancing test**: minimal data; processing is "do not contact" gate, which favours the subject
- **Retention**: indefinite (intentionally — deletion would risk re-mailing a complainant)

### A13 — Stripe Radar fraud screening

- **Data**: Stripe writes `risk_level` + `risk_score` on every charge; we now persist these on `payment.metadata` (T-04 / R-04)
- **Basis**: (f) legitimate interest + (b) contract — preventing fraudulent charges
- **Balancing test**: payments are inherently fraud-prone; users have reasonable expectation that payment processors run fraud checks
- **Retention**: follows payment lifecycle (indefinite for accounting)

### A14 — GDPR DSAR

- **Data**: email, action, admin email, IP, rows_affected JSON
- **Basis**: (c) legal obligation — Art. 17 / Art. 20
- **Retention**: indefinite — the audit log is the only evidence we honoured the request

### A15 — Unlock feedback email and answer (draft, 2026-10-19)

- **Data**: the reader's email, first name and archetype name, and the full report's price as they were quoted it (in the email); in `unlock_feedback`, the reason they tapped (first and current), the optional chips and their own words (`note`), the device class, when it was claimed, sent, answered and changed, the subject line arm and the answer order shown, a sha256 hash of the link token and Resend's id; per email, delivered, opened, clicked or bounced (`email_message_event`, as A6); the free unlock as a 0 payment
- **Basis (proposed; the audience is Eman's decision of 2026-10-22)**: the email goes to the 72h nurture email's audience, unpaid readers who opened their report, without checking Q16015, so it stands where A6 stands: (a) consent for readers who said Yes, (f) legitimate interest otherwise (learning why readers do not buy, to improve the offer); the A6 correction applies. The answer is given by choice, and the unlock it triggers is (b) contract. Balancing test: one email per person, never to buyers, staff, restricted or suppressed readers; the answer is used only to improve LoveIQ; the note and chips are masked in the admin and the team copy. Not reviewed by a lawyer. The first readers get it from an admin's tranche of earlier reports (the newest 250 on 2026-10-22), by the same rules; the privacy policy says "usually a few hours after your result". "Anonymous by default" was taken out of the email and /why on 2026-10-22: the answer is stored with the submission.
- **Retention**: with the submission: erased by a DSAR delete and by the cascade. Not in the retention purge (an answer, like report feedback, not telemetry)
- **Withdraw**: the one-click unsubscribe in the email, or a DSAR delete; Art. 21 objection by email

### A16 — Mira coaching (beta, from 2026-11-20)

- **Data**: what the person writes about their sex life and health, Mira's replies, the chats saved for account holders while "Remember our conversations" is on, and, from 2026-11-24, the chat kept without an account under the browser id (with the consent version it was kept under), the coaching style, for account holders their name, gender and country as context, the LoveIQ result only if they tick "Use my LoveIQ test result to tailor my coaching" (off by default), body check answers (Body Appreciation Scale-2), and labels from Mira's replies (intake question answered, a new chat's topic, a referral, the support panel shown with the country)
- **Basis**: (a) consent with Art. 9(2)(a) explicit consent. Before a first message without an account, a required tick: "I'm 18 or older, and I agree that Mira may process what I share about my sex life and health to coach me, and to count, without my words, how Mira is used and whether she helps. Mira keeps our conversation, to coach me and so her team can read it to improve her. Our analytics tools also see what I type." (version `mira-2026-11-24`, which added the sentence on keeping it: a chat without an account is kept only under it, for coaching and for the team to read to improve Mira). At sign-up a required "Mira may process what I share about my sex life and health to coach me, and to count, without my words, how Mira is used and whether she helps", beside "I accept the terms of use and I have read the privacy notice". The wording's version is stored with each consent, and with each chat kept without an account. Open: whether "to coach me" also covers counting the labels and comparing body check scores across everyone ([DPIA.md](DPIA.md) §7.9)
- **Retention**: [DPIA.md](DPIA.md) §7.6. With "Remember our conversations" off, no new chats are saved; earlier ones stay until deleted or 12 months after the person's last message. A chat kept without an account: until "Delete this chat", a sign-up (moved into the account, or deleted when it keeps no chats) or an under-18 stop, at the latest 12 months after its last message
- **Withdraw**: stop chatting; delete the chats or the account in Settings; without an account, "Delete this chat" on the chat page (a new chat or clearing the browser removes only the browser's copy); or a data request. Anyone who says they are under 18 is stopped for good (DPIA M2)

### A17 — Mira account, sign-in and service emails

- **Data**: email, profile, settings (from 2026-11-21 also the reply language, and light or dark and the text size, which a new sign-in brings to that browser), consents, sign-in code rows; the emails Resend sends for Mira: sign-in and change-of-email codes, the daily nudges (on by default for new accounts), weekly-session invites and reminders, journal reminders (A26), and the note when the address changes or a passkey is added (A17a); for each email, Resend records whether it was delivered, opened and which link was clicked, with the IP address and email app (open and click tracking is on for the whole sending domain)
- **Basis**: (b) contract: the free account and the emails that come with it ("Daily nudges from Mira come with your free account"). A nudge's words come from the last chat, so they also rest on the A16 consent. The opens and clicks Resend records, and each nudge's delivery, first open and button click on our side: (f) legitimate interest, as in A6, an owner's accepted risk; the ePrivacy question in DPIA §6 applies here too
- **Retention**: until the account is deleted; sign-in codes when used, otherwise after a day; sign-ins that never finished sign-up after 24 hours
- **Stop**: one-click stop in every nudge, or in Settings, and a pause after signing in from a nudge's link (from 2026-11-23: a link alone only stops); the account can be deleted in Settings
- **Weekly sessions (from 2026-11-21)**: when the person books one, the slot (weekday, local time, time zone) and the emails that come with it: the calendar invite (an .ics with their address as attendee), its updates and cancellation, and a reminder 30 to 60 minutes before each session. Basis: (b) contract, a service the person asked for by booking. The emails carry no chat content and neutral subjects; reminders pause for 14 days after a crisis, as nudges do, and stop with the one-click link in every session email, in Settings, or by cancelling. A session never opens with a chat that held a crisis in the last 14 days. Kept until cancelled, the account is deleted, or an under-18 stop (which deletes it without any email)

### A17a — Mira sign-in security: passkeys, devices, change of email (from 2026-11-22)

- **Data**: passkeys (credential id, public key, counter, transports, synced or not, a label, made and last used; no biometric data); signed-in devices (session id, how the person signed in, a device label from the user agent, the approximate city at sign-in from the host's geo lookup, made and last seen; never the IP); a change of email waiting for its code (the new address, a keyed hash of the code, when, guesses); passkey challenges (5 minutes); when Google last confirmed the address
- **Basis**: (b) contract for signing in and the account's security (passkeys and the note to the account when one is added, signing devices out, changing the address and telling the old one); (f) legitimate interest for each device's approximate city: letting the person spot a sign-in that isn't theirs. Balancing: city only (no IP, no precise location), taken once at sign-in, shown to the person in Settings, deleted with the device ([DPIA.md](DPIA.md) §7.5, M10)
- **Retention**: passkeys until removed, the account is deleted or Mira stops the person as under 18; devices until signed out or 90 days after last seen; a pending change of email when used, otherwise after a day; challenges when checked, otherwise by the next daily run
- **Stop**: remove passkeys, sign devices out and change the email in Settings; an Art. 21 objection by email; deleting the account deletes all of it

### A18 — Mira ratings, feedback and the log of steps

- **Data**: thumbs on replies, feedback (own words; the email only with permission), the recommend score, the reason and an optional note in the person's own words when they stop nudges, the log of steps (`mira_event`: names, times, small properties, a random browser id or the account id); never a reply's text (the optional box that kept it went on 2026-11-21)
- **Basis**: (f) legitimate interest for steps, thumbs, feedback and scores: improving Mira. Balancing: no words in the log except the person's own feedback and the note they may add when stopping nudges, team browsers left out, kept 12 months, objection by email
- **Weekly sessions (from 2026-11-21)**: the log also holds a session booked or cancelled, each reminder sent, and a reminded session opened within 30 minutes of its start (`mira_session_reminder.joined_at`, the minutes from the start as a number). Same basis and balancing: times only
- **Retention**: 12 months; deleting the account deletes the words and unlinks the rest
- **Withdraw**: delete the account, or ask; an Art. 21 objection by email

### A19 — Analytics on Mira's pages

- **Data**: as A8 and A9. PostHog, Microsoft Clarity, Google Analytics, Google Ads and Tag Manager, and CookieYes load on `/mira` as on every page; PostHog and Clarity record everything on Mira's pages as it appears on screen, unmasked: the chat, goals, the journal, voice sessions and their key points, the finder and picks, a rating's words, and the self-checks' answers and results
- **Basis, as the privacy policy states it**: (f) legitimate interest for measurement that does not depend on the cookie choice (privacy policy §7.4); Google cookies and identifiers on (a) consent; PostHog and Clarity are "loaded on all visits" (owner decisions, A8; Clarity without consent since 2026-08-10, kept for Mira on 2026-11-20). The chat's consent tick tells people: "Our analytics tools also see what I type."
- **Gap, an owner's accepted risk**: (f) is not an Art. 9(2) condition for the Art. 9 content these tools see ([DPIA.md](DPIA.md) §7.5, M5)

### A20 — The team's Slack posts about sign-ups and returns

- **Data**: per finished survey (`#incoming-surveys`) the masked email, the funnel, where the visit came from, the first page, the landing page design, the device type, the self-reported country, the progress so far and the time each step took; when a reader comes back to their report, what brought them back and how long they read. Never the answers
- **Basis**: (f) legitimate interest: the team follows sign-ups and returns to improve the service (privacy policy §7.7). Balancing: the email is masked, no answers, read by the team only; readers who asked us to restrict processing (T-09) are left out
- **Retention**: as long as the Slack workspace keeps messages (its retention setting: to confirm)
- **Objection**: Art. 21 by email; a restriction request (T-09) also takes the reader out of these posts

### A21 — Mira coaches, suggestions and search (from 2026-11-22)

- **Data**: which coming-soon coach a person asked to be told about (`notify_me`, with the account),
  which coach "Find my challenge" suggested (never the answers), the topic labels of their own
  chats (A16) used for "Picked for you" and "Your coaches" on Home, and the steps: the coaches page
  and finder opened, picks shown and tapped, which guide practice a chat was opened from, searches
  that found nothing (never the words). All ids and numbers, in `mira_event`
- **Basis**: (a) consent with Art. 9(2)(a): the A16 consent ("to coach me, and to count, without
  my words, how Mira is used and whether she helps"). Suggestions read only rows written under the
  account, nothing while "Remember our conversations" is off, nothing from before the last "Delete
  all chats" ([DPIA.md](DPIA.md) §7.12)
- **Retention**: 12 months, as `mira_event`, the finder's outcome too (it shows the challenge the
  person picked); deleting the account deletes or unlinks them
- **Withdraw**: as A16; turning "Remember our conversations" off stops the suggestions from chats;
  anyone stopped as under 18 has their "Notify me" requests and the finder's outcome deleted

### A22 — Mira goals (Challenges & goals, added 2026-11-22, before release)

- **Data**: an account holder's goals in their own words (Art. 9: often about sex), the days a week they aim for, whether a goal came from Mira's suggestion, put away or done, and the days they ticked it (`mira_goal`, `mira_goal_log`); the goals on the go with this week's ticks go to the model as the person's context
- **Basis**: (a) consent with Art. 9(2)(a): the A16 coaching consent every account holder gives at sign-up, as a goal is something the person shares with Mira to be coached. The counts (`goal_*` events, AP's Goals card) as A18, with no words
- **Retention**: until the person deletes the goal, or all goals, on the goals page, or the account ([DPIA.md](DPIA.md) §7.13, open point on a 12-month limit)
- **Withdraw**: delete goals on the goals page; delete the account; a data request. The under-18 stop deletes them (DPIA M2)

### A23 — Mira ratings and quotes (from 2026-11-22, to be checked by Eman)

- **Data**: one rating (1 to 5) from a signed-in person who has talked with Mira, given in Settings at any time or after the chat's ask, and where it was given; only with a separate tick, one sentence for others with the first name or initials and the optional age range they choose, the consent's version and time, and its review status, with the team's reason (one of four) for a quote not shown; to admit a rating, a count of up to 3 of the account's own messages, read without their words and not kept (`mira_review`); events with ids and counts only ([DPIA.md](DPIA.md) §7.14)
- **Basis**: the stars, shown only inside an average without names, and the message count that admits them: (f) legitimate interest in telling visitors honestly what people think of Mira, every rating counted, high or low. The words, name and age range, which may reveal sex life or health: (a) explicit consent with Art. 9(2)(a), a separate box the person ticks themselves, version `mira-review-2026-11-22` stored with the words. Published only after staff approval; the only edit is a visible […] where an identifying detail was taken out, as the box says; held back or taken down only for one of four stated reasons, never for being critical
- **Retention**: until taken back or the account is deleted; words not approved are deleted when rejected, the reason kept with the rating
- **Withdraw**: "Stop showing my words" or "Remove my rating" in Settings, effective at once; deleting the account; a data request. An under-18 stop deletes both

### A24 — Talking to Mira by voice (from 2026-11-22)

- **Data**: the text the person's browser makes of their speech (handled as A16's messages; the browser's own speech service, when used, hears the voice under the browser's terms); with an account and "Remember our conversations" on, the voice session (`mira_voice_session`: times, words per side, recognition mode, up to three key points written by Anthropic's model); the KPI events `voice_session_ended` and `voice_points_opened` (ids and numbers)
- **Basis**: as A16, (a) consent with Art. 9(2)(a) for the words and the key points. Before the first Talk, an explicit tick: "I agree that my browser's speech service (for example Apple's or Google's) hears what I say to Mira, under that company's terms, possibly outside the EU.", logged as `voice_notice_agreed` with its wording version `mira-voice-2026-11-22`. The events: as A18, (f) legitimate interest
- **Retention**: with the chat and the account (A16, [DPIA.md](DPIA.md) §7.15); the events 12 months (A18)
- **Withdraw**: End or Mute at any time; delete a session on its page, or the chats or the account in Settings; a data request

### A25 — Mira self-checks (from 2026-11-22)

- **Data**: a signed-in person's answers to the anxiety check (GAD-7), the mood check (PHQ-9) and the loneliness check (Three-Item Loneliness Scale) with the date (`mira_check`), scored by the app, with a result's support flag (the PHQ-9's question 9 above "Not at all", worked out from the stored answers: the result keeps the support lines at its top, and for 14 days no nudge or journal reminder is sent); "Mira may use my check results" (`mira_user.use_checks`, off by default), with which each check's latest band from the last 90 days goes into Mira's context and, with the flag, that the person reported thoughts of being better off dead or of hurting themselves in that check (she checks in gently once a chat, offers the support lines and follows the crisis rail if there is risk now), never answers or scores, each change of it logged as `use_checks_set` with its wording version `mira-checks-2026-11-22`; events naming the check and whether it was a retake; a count of the support panels the PHQ-9's question 9 opened, never linked to an account or browser; an unfinished check in the browser tab for up to a day
- **Basis**: (a) consent with Art. 9(2)(a) explicit consent: the sign-up tick for "what I share about my sex life and health to coach me", confirmed by starting the first check after a note on what is kept, who sees it, that analytics see the screen and how to delete it. Intended purpose: self-reflection and coaching, not diagnosis or treatment ([DPIA.md](DPIA.md) §7.16). Open: whether a tick of its own is wanted (§7.16, open point 1)
- **Retention**: until deleted in Settings, with the account, or at an under-18 stop, which also delete the account's earlier rows of the support-panel count; the events 12 months (A18)
- **Withdraw**: "Delete my check results" (which also ends a support flag's 14-day pause of emails early) or turn "Mira may use my check results" off in Settings; delete the account; or a data request

### A26 — Mira daily journal (from 2026-11-22)

- **Data**: per day, mood, body, closeness and energy rated 1 to 5 or skipped, and an optional one-line note (`mira_journal_entry`); the settings below with the time Mira's reading was chosen; the reminder's time and last day; events without ratings or words
- **Basis**: (a) consent with Art. 9(2)(a) explicit consent. Keeping the entries to show them back rests on the account's consent ("Mira may process what I share about my sex life and health to coach me, and to count, without my words, how Mira is used and whether she helps"); open whether that covers a journal or a first-use consent is wanted ([DPIA.md](DPIA.md) §7.17). Mira reading the last 7 days is a separate explicit opt-in, "Let Mira read my journal", off by default, and the notes a second one, "Include my notes"; `mira_user.journal_share_at` records the latest choice, and each change is logged as `journal_share_set`. The daily reminder email is an opt-in ("Remind me daily") with a one-click stop in every email; Resend records its delivery, opens and clicks as for A17
- **Retention**: until the person deletes an entry, the journal or the account; deleted at once when Mira stops someone as under 18
- **Withdraw**: turn either reading choice off (it applies from the next message); delete entries or the whole journal on the journal page or in Settings; stop the reminder there or from any reminder email; delete the account

## Withdrawal of consent flows

For activities under basis (a):

| Activity       | Withdraw mechanism                                                                                   | Effect                                                                                                                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 waitlist    | DSAR delete (`/api/admin/data-subject` action=delete)                                                | All waitlist + suppression + invite rows removed                                                                                                                                       |
| A2 survey      | DSAR delete                                                                                          | Full cascade across 12 PII tables, plus the Resend marketing contact                                                                                                                   |
| A6 marketing   | One-click unsubscribe in every email                                                                 | Adds to suppression_list + marks the Resend contact unsubscribed (R-05)                                                                                                                |
| A8 analytics   | Art. 21 objection (privacy policy §1, §7.4); CookieYes preference centre for cookies and identifiers | Declining: `__liq_vid` and GA4 cookies are not set; funnel_event rows use a page-only id, GA4 receives cookieless events (consent mode), our own tables continue (legitimate interest) |
| A9 advertising | Art. 21 objection; CookieYes preference centre for ad cookies and identifiers                        | Declining: Google Ads conversions are cookieless pings marked denied; the tag manager's pixels get no events                                                                           |
| A15 feedback   | One-click unsubscribe in the email; DSAR delete                                                      | Unsubscribe: suppression list, no further email. Delete: the answer and the reader's own words are erased                                                                              |
| A16 Mira       | Stop chatting; delete the chats or the account in Settings; a data request                           | Saved chats and the account's labels are deleted; Anthropic deletes its copy within 30 days                                                                                            |
| A21 coaches    | As A16; turn "Remember our conversations" off; delete the account; a data request                    | Picks stop using chat topics; deleting the account unlinks the labels; an under-18 stop deletes the "Notify me" requests and the finder's outcome                                      |
| A22 Mira goals | Delete a goal or all goals on the goals page; delete the account; a data request                     | The goals and their ticks are deleted; Anthropic deletes its copy of the context within 30 days                                                                                        |
| A23 Mira quote | "Stop showing my words" or "Remove my rating" in Settings; delete the account; a data request        | The words, name and age range are deleted and leave Mira's pages from the next page view; "Remove my rating" also takes the stars out of the average                                   |
| A24 voice      | End or Mute, and type instead; delete a session, the chats or the account; a data request            | Nothing more reaches the browser's speech service; a deleted session's key points and words are gone, in the chat too; Anthropic deletes its copy within 30 days                       |
| A25 self-check | "Delete my check results" or the "Mira may use" switch in Settings; delete the account               | The answers are deleted; with the switch off, Mira gets no bands or support flag from the next message on                                                                              |
| A26 journal    | Turn off Mira's reading or the reminder; delete entries, the journal or the account                  | Mira stops reading it from the next message; deleted entries are gone, with the account's                                                                                              |

## Outstanding work

- **Mira (A16 to A19, A21 to A26)**: the open points in [DPIA.md](DPIA.md) §7.9, the consent scope among them, and Eman's decision on Jarvis's live-data tool, which can read the `mira_*` tables (§7.9, point 7).
- **Mira goals (A22)**: the open points in [DPIA.md](DPIA.md) §7.13 (a 12-month limit; Jarvis's live data tool).
- **Mira voice (A24)**: the open points in [DPIA.md](DPIA.md) §7.15 (naming each browser's speech service; Android's voices).
- **Mira self-checks (A25)**: the open points in [DPIA.md](DPIA.md) §7.16: the consent's scope for health questionnaires, permission for the loneliness scale, and the medical device question. The analytics on the check screens are settled: nothing on Mira's pages is masked, by Eman's decision (DPIA M5).
- **Mira journal (A26)**: the open points in [DPIA.md](DPIA.md) §7.17 (the consent's scope, retention).
- **Admin UI for `processing_restricted_at` (T-09 follow-up)**: a tiny admin button "Freeze processing for this user" needs to land. Out of this round per the no-UI-changes constraint.
- **Cookies banner first-load timing**: CookieYes script loads `lazyOnload`. The banner appears AFTER hydration. A first-visit user has ~200ms of HTML rendering before the banner mounts. Strictly speaking the visitor ID cookie (T-02) waits for consent, but session recording (Microsoft Clarity), GA4 and Google Ads all load before the banner is dismissed — Clarity by explicit owner decision on 2026-08-10, the Google tags by the pre-existing `next/script` gap (measured on production the same day). Clarity additionally records unmasked Art. 9 survey answers, which is not reconcilable with the Art. 9(2)(a) explicit-consent basis claimed above. See DPIA §6 and ROPA §"Consent".
