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
| **(a) Consent**             | Survey participation, marketing emails (Q16015), analytics + tracking cookies                                                                                                                               | Each instance has explicit opt-in. Marketing consent is versioned (`marketing_opt_in_terms_version`, T-11). Analytics cookies gated on CookieYes "analytics" category (T-02). |
| **(b) Contract**            | Report delivery, payment processing, transactional emails (confirmation, share-link, password-reset adjacent flows)                                                                                         | Lawful basis is "necessary for the performance of a contract" because the user requested + paid for the deliverable.                                                          |
| **(f) Legitimate interest** | Operational forensics (admin_action_log), abuse detection (rate limits, CSRF storm counters), email-bounce suppression, payment-fraud monitoring (Stripe Radar), each nurture email's opens and clicks (A6) | Balancing test documented per activity below. No marketing under legitimate interest — we use consent (but see the A6 correction).                                            |

Bases NOT in use: (c) legal obligation (we don't process for tax/accounting beyond what Stripe handles), (d) vital interests, (e) public task.

## Activity-by-activity map

### A1 — Waitlist signup

- **Data**: email, optional first_name, UTM context, IP, timestamp
- **Basis**: (a) consent — user submits the form intentionally; the call-to-action is "join the waitlist"
- **Retention**: indefinite until user requests deletion (DSAR via F-01)
- **Withdraw**: `/api/unsubscribe` one-click link in every email + admin-initiated DSAR delete

### A2 — Survey submission

- **Data**: email, first_name, ~60 question answers including sensitive-by-context data, IP, session_id, duration, UTM context (campaign tags; ad click ids: Google `gclid`/`gbraid`/`wbraid`, and from 2026-10-14 Meta `fbclid`; from 2026-10-14 the referring site's hostname, never its full address)
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
- **Basis**: (a) consent where the reader said Yes to Q16015. RPC stamps `marketing_opt_in_terms_version` (T-11) so we can prove what consent text the user saw. Correction 2026-10-14: the nurture cron does not check Q16015. A No keeps the emails about the reader's own report (decision "option a" in `app/api/survey/route.ts`), so for those readers the email itself has no documented basis yet.
- **Per-email opens and clicks**: (f) legitimate interest, for every nurture email whatever the Q16015 answer (owner decision 2026-10-14): seeing which emails are useful and improving them. Balancing test: ids and a time only; disclosed in privacy policy §7.3 and the Q16015 guide line (T-11 version `2026-10-14`); turning images off stops the open record; objection by unsubscribing or by email (Art. 21). Not reviewed by a lawyer: whether the open image needs consent under ePrivacy (§25 TDDDG), the point T-13/T-14 raised in `docs/runbooks/SECURITY.md`.
- **Retention**: same as A5 (Resend processor) + nurture stage markers in `report_price_quote.metadata.nurtureEmailsSent[]` + `email_message_event` rows: 180 days once the retention purge runs (postponed); until then until the submission is erased, which cascades
- **Withdraw**: any unsubscribe → suppression list → the Resend contact is marked unsubscribed (R-05), so campaigns sent from Resend skip it on every list

### A7 — Payment processing

- **Data**: Stripe customer id, card brand/last4, charge id, amount, IP, user-agent, Stripe Radar risk_level (T-04 stores it)
- **Basis**: (b) contract — fulfilling the purchase
- **Retention**: indefinite for accounting; DSAR delete preserves payments (DSAR helper warns "payment data retained, accounting retention")
- **Subprocessors**: Stripe (separate DPA)

### A8 — Engagement analytics

- **Data**: analytics_event rows (event_type + metadata; from 2026-10-14 also `report_chapter_stats`, how long each report chapter was read and which of its actions were used, and `wizard_skipped`, the pre-report slides skipped), survey_behavior_event rows (from 2026-10-14 with `is_tablet`), invite_event rows, scroll depth, time-on-section, click telemetry; funnel_event rows (unique visitor, survey start and, from 2026-10-14, each survey intro card seen and its Back and Skip); client-side: GA4, Microsoft Clarity, PostHog (from 2026-10-14 with the time spent on each landing section, also sent to GA4 with consent)
- **Basis**: our own tables (analytics_event, survey_behavior_event, invite_event): (f) legitimate interest since 2026-09-18 (commit `60924b5ab`, privacy policy §7.4): no cookie set or read, nothing sent to a third party, so these writes no longer check the cookie choice. funnel_event: keyed by the visitor ID cookie (`__liq_vid`), which is set only after consent to the CookieYes "analytics" category (T-02), so it covers consenting visitors only. GA4: (a) consent, `hasCookieYesConsent("analytics")` in client.ts. Microsoft Clarity and PostHog load on every visit (owner decisions, ROPA #9 note).
- **Retention**: 180 days (F-02 purge)

### A9 — Advertising tracking (Facebook Pixel, TikTok Analytics, Google Ads)

- **Data**: cross-site identifiers via vendor pixels
- **Basis**: (a) consent — CookieYes "advertisement" category. Tags marked `data-cookieyes="cookieyes-advertisement"` in `app/layout.tsx`.
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

## Withdrawal of consent flows

For activities under basis (a):

| Activity       | Withdraw mechanism                                                                                      | Effect                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 waitlist    | DSAR delete (`/api/admin/data-subject` action=delete)                                                   | All waitlist + suppression + invite rows removed                                                                                                                                         |
| A2 survey      | DSAR delete                                                                                             | Full cascade across 12 PII tables, plus the Resend marketing contact                                                                                                                     |
| A6 marketing   | One-click unsubscribe in every email                                                                    | Adds to suppression_list + marks the Resend contact unsubscribed (R-05)                                                                                                                  |
| A8 analytics   | Art. 21 objection (privacy policy §1, §7.4); CookieYes preference centre for GA4 and the visitor cookie | Declining: `__liq_vid` is not set, so no funnel_event rows, and nothing goes to GA4. Our own analytics_event, survey_behavior_event and invite_event rows continue (legitimate interest) |
| A9 advertising | CookieYes preference centre                                                                             | Vendor tags blocked by category attribute                                                                                                                                                |

## Outstanding work

- **Admin UI for `processing_restricted_at` (T-09 follow-up)**: a tiny admin button "Freeze processing for this user" needs to land. Out of this round per the no-UI-changes constraint.
- **Cookies banner first-load timing**: CookieYes script loads `lazyOnload`. The banner appears AFTER hydration. A first-visit user has ~200ms of HTML rendering before the banner mounts. Strictly speaking the visitor ID cookie (T-02) waits for consent, but session recording (Microsoft Clarity), GA4 and Google Ads all load before the banner is dismissed — Clarity by explicit owner decision on 2026-08-10, the Google tags by the pre-existing `next/script` gap (measured on production the same day). Clarity additionally records unmasked Art. 9 survey answers, which is not reconcilable with the Art. 9(2)(a) explicit-consent basis claimed above. See DPIA §6 and ROPA §"Consent".
