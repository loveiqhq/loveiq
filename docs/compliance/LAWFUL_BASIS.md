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

| Basis                       | Used for                                                                                                                                                        | Notes                                                                                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) Consent**             | Survey participation, marketing emails (Q16015), analytics + tracking cookies                                                                                   | Each instance has explicit opt-in. Marketing consent is versioned (`marketing_opt_in_terms_version`, T-11). Analytics cookies gated on CookieYes "analytics" category (T-02). |
| **(b) Contract**            | Report delivery, payment processing, transactional emails (confirmation, share-link, password-reset adjacent flows)                                             | Lawful basis is "necessary for the performance of a contract" because the user requested + paid for the deliverable.                                                          |
| **(f) Legitimate interest** | Operational forensics (admin_action_log), abuse detection (rate limits, CSRF storm counters), email-bounce suppression, payment-fraud monitoring (Stripe Radar) | Balancing test documented per activity below. No marketing under legitimate interest — we use consent.                                                                        |

Bases NOT in use: (c) legal obligation (we don't process for tax/accounting beyond what Stripe handles), (d) vital interests, (e) public task.

## Activity-by-activity map

### A1 — Waitlist signup

- **Data**: email, optional first_name, UTM context, IP, timestamp
- **Basis**: (a) consent — user submits the form intentionally; the call-to-action is "join the waitlist"
- **Retention**: indefinite until user requests deletion (DSAR via F-01)
- **Withdraw**: `/api/unsubscribe` one-click link in every email + admin-initiated DSAR delete

### A2 — Survey submission

- **Data**: email, first_name, ~60 question answers including sensitive-by-context data, IP, session_id, duration, UTM
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
- **Retention**: Resend's processor-side log per its DPA; no per-message copy stored on our side. Suppression rows kept (intentional retention for compliance).

### A6 — Marketing email (nurture sequence)

- **Data**: same as A5 plus Stripe promotion code at the 30h/54h stages
- **Basis**: (a) consent — Q16015 marketing opt-in is required for nurture to fire. RPC stamps `marketing_opt_in_terms_version` (T-11) so we can prove what consent text the user saw.
- **Retention**: same as A5 (Resend processor) + nurture stage markers in `report_price_quote.metadata.nurtureEmailsSent[]`
- **Withdraw**: any unsubscribe → suppression list → Resend Audience cleanup (R-05)

### A7 — Payment processing

- **Data**: Stripe customer id, card brand/last4, charge id, amount, IP, user-agent, Stripe Radar risk_level (T-04 stores it)
- **Basis**: (b) contract — fulfilling the purchase
- **Retention**: indefinite for accounting; DSAR delete preserves payments (DSAR helper warns "payment data retained, accounting retention")
- **Subprocessors**: Stripe (separate DPA)

### A8 — Engagement analytics

- **Data**: analytics_event rows (event_type + metadata), scroll depth, time-on-section, click telemetry; client-side: GA4 + Hotjar + Contentsquare
- **Basis**: (a) consent — CookieYes "analytics" category. Visitor ID cookie (`__liq_vid`) only set after consent (T-02). Persisted analytics_event writes gated on `hasCookieYesConsent("analytics")` in client.ts.
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

| Activity       | Withdraw mechanism                                    | Effect                                                                                                              |
| -------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| A1 waitlist    | DSAR delete (`/api/admin/data-subject` action=delete) | All waitlist + suppression + invite rows removed                                                                    |
| A2 survey      | DSAR delete                                           | Full cascade across 12 PII tables                                                                                   |
| A6 marketing   | One-click unsubscribe in every email                  | Adds to suppression_list + removes from Resend Audience (R-05)                                                      |
| A8 analytics   | CookieYes preference centre                           | `__liq_vid` cookie not set; `hasCookieYesConsent("analytics")` returns false; persisted analytics_event writes skip |
| A9 advertising | CookieYes preference centre                           | Vendor tags blocked by category attribute                                                                           |

## Outstanding work

- **Admin UI for `processing_restricted_at` (T-09 follow-up)**: a tiny admin button "Freeze processing for this user" needs to land. Out of this round per the no-UI-changes constraint.
- **Cookies banner first-load timing**: CookieYes script loads `lazyOnload`. The banner appears AFTER hydration. A first-visit user has ~200ms of HTML rendering before the banner mounts. Strictly speaking the visitor ID cookie (T-02) now waits for consent, but other third-party scripts (Hotjar, Contentsquare) load before the banner is dismissed. F-09 deferred per user instruction.
