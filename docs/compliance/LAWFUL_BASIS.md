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
| **(a) Consent**             | Survey participation, marketing emails (Q16015), analytics + tracking cookies, Mira coaching (with Art. 9(2)(a); A16)                                                                                       | Each instance has explicit opt-in. Marketing consent is versioned (`marketing_opt_in_terms_version`, T-11). Analytics cookies gated on CookieYes "analytics" category (T-02). |
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
- **Basis**: (a) consent where the reader said Yes to Q16015. RPC stamps `marketing_opt_in_terms_version` (T-11) so we can prove what consent text the user saw. A Yes given in the opt-in's "miss out" sheet, which only opens after a No, is stamped `2026-10-14+sheet-2026-11-10`: that reader saw both texts ([survey.md](../survey.md)). Correction 2026-10-14: the nurture cron does not check Q16015. A No keeps the emails about the reader's own report (decision "option a" in `app/api/survey/route.ts`), so for those readers the email itself has no documented basis yet.
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

- **Data**: what the person writes about their sex life and health, Mira's replies, the chats saved for account holders while "Remember our conversations" is on, the coaching style, for account holders their name, gender and country as context, the LoveIQ result only if they tick "Use my LoveIQ test result to tailor my coaching" (off by default), body check answers (Body Appreciation Scale-2), and labels from Mira's replies (intake question answered, a new chat's topic, a referral, the support panel shown with the country)
- **Basis**: (a) consent with Art. 9(2)(a) explicit consent. Before a first message without an account, a required tick: "I'm 18 or older, and I agree that Mira may process what I share about my sex life and health to coach me, and to count, without my words, how Mira is used and whether she helps. Our analytics tools also see what I type." At sign-up a required "Mira may process what I share about my sex life and health to coach me, and to count, without my words, how Mira is used and whether she helps", beside "I accept the terms of use and I have read the privacy notice". The wording's version is stored with each consent. Open: whether "to coach me" also covers counting the labels and comparing body check scores across everyone ([DPIA.md](DPIA.md) §7.9)
- **Retention**: [DPIA.md](DPIA.md) §7.6. With "Remember our conversations" off, no new chats are saved; earlier ones stay until deleted or 12 months after the person's last message
- **Withdraw**: stop chatting; delete the chats or the account in Settings; without an account, a new chat or clearing the browser; or a data request. Anyone who says they are under 18 is stopped for good (DPIA M2)

### A17 — Mira account, sign-in and service emails

- **Data**: email, profile, settings, consents, sign-in code rows; the sign-in code email; the daily nudge emails (on by default for new accounts)
- **Basis**: (b) contract: the free account and the emails that come with it ("Daily nudges from Mira come with your free account"). A nudge's words come from the last chat, so they also rest on the A16 consent. Each nudge's delivery and first open: (f) legitimate interest, as in A6, an owner's accepted risk; the ePrivacy question in DPIA §6 applies here too
- **Retention**: until the account is deleted; sign-in codes when used, otherwise after a day; sign-ins that never finished sign-up after 24 hours
- **Stop**: pause or one-click stop in every nudge, or in Settings; the account can be deleted in Settings

### A18 — Mira ratings, feedback and the log of steps

- **Data**: thumbs on replies, feedback (own words; the email only with permission), the recommend score, the log of steps (`mira_event`: names, times, small properties, a random browser id or the account id); never a reply's text (the optional box that kept it went on 2026-11-21)
- **Basis**: (f) legitimate interest for steps, thumbs, feedback and scores: improving Mira. Balancing: no words in the log except the person's own feedback, team browsers left out, kept 12 months, objection by email
- **Retention**: 12 months; deleting the account deletes the words and unlinks the rest
- **Withdraw**: delete the account, or ask; an Art. 21 objection by email

### A19 — Analytics on Mira's pages

- **Data**: as A8 and A9. PostHog, Microsoft Clarity, Google Analytics, Google Ads and Tag Manager, and CookieYes load on `/mira` as on every page; PostHog and Clarity record the chat as it appears on screen
- **Basis, as the privacy policy states it**: (f) legitimate interest for measurement that does not depend on the cookie choice (privacy policy §7.4); Google cookies and identifiers on (a) consent; PostHog and Clarity are "loaded on all visits" (owner decisions, A8; Clarity without consent since 2026-08-10, kept for Mira on 2026-11-20). The chat's consent tick tells people: "Our analytics tools also see what I type."
- **Gap, an owner's accepted risk**: (f) is not an Art. 9(2) condition for the chat text these tools see ([DPIA.md](DPIA.md) §7.5, M5)

### A20 — The team's Slack posts about sign-ups and returns

- **Data**: per finished survey (`#incoming-surveys`) the masked email, the funnel, where the visit came from, the first page, the landing page design, the device type, the self-reported country, the progress so far and the time each step took; when a reader comes back to their report, what brought them back and how long they read. Never the answers
- **Basis**: (f) legitimate interest: the team follows sign-ups and returns to improve the service (privacy policy §7.7). Balancing: the email is masked, no answers, read by the team only; readers who asked us to restrict processing (T-09) are left out
- **Retention**: as long as the Slack workspace keeps messages (its retention setting: to confirm)
- **Objection**: Art. 21 by email; a restriction request (T-09) also takes the reader out of these posts

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

## Outstanding work

- **Mira (A16 to A19)**: the open points in [DPIA.md](DPIA.md) §7.9, the consent scope among them.
- **Admin UI for `processing_restricted_at` (T-09 follow-up)**: a tiny admin button "Freeze processing for this user" needs to land. Out of this round per the no-UI-changes constraint.
- **Cookies banner first-load timing**: CookieYes script loads `lazyOnload`. The banner appears AFTER hydration. A first-visit user has ~200ms of HTML rendering before the banner mounts. Strictly speaking the visitor ID cookie (T-02) waits for consent, but session recording (Microsoft Clarity), GA4 and Google Ads all load before the banner is dismissed — Clarity by explicit owner decision on 2026-08-10, the Google tags by the pre-existing `next/script` gap (measured on production the same day). Clarity additionally records unmasked Art. 9 survey answers, which is not reconcilable with the Art. 9(2)(a) explicit-consent basis claimed above. See DPIA §6 and ROPA §"Consent".
