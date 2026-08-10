# Data Protection Impact Assessment — LoveIQ Web

> Owner: Eman (data controller + engineering lead).
> Last reviewed: 2026-05-26.
> Review cadence: annually, OR when adding a new processing activity / new vendor / a new category of personal data.

GDPR Art. 35 requires a DPIA when processing involves "systematic monitoring of a publicly accessible area on a large scale" or processing of "special categories of personal data" at scale. The LoveIQ survey collects sensitive-by-context personal data (sexual orientation, relationship status, attachment patterns, intimacy preferences) tied to identifiable email addresses. A DPIA is therefore mandatory.

## 1. Scope of processing

| Activity                          | Personal data collected                                                                                    | Lawful basis                                                                                 | Storage location                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Waitlist signup                   | email, optional first_name, UTM context, IP, timestamp                                                     | consent (explicit opt-in)                                                                    | Supabase (`waitlist_user`)                                             |
| Survey submission                 | email, first_name, ~60 question answers including sensitive-by-context data, IP, session_id, duration, UTM | consent (explicit opt-in via survey start)                                                   | Supabase (`survey_submission`, `survey_submission_answer`, `app_user`) |
| Scoring                           | derived archetype + percentages from answers                                                               | contract (necessary to deliver the report the user requested)                                | Supabase (`scoring_result`)                                            |
| Report delivery                   | personal_report row, signed access token, share-link tokens                                                | contract                                                                                     | Supabase (`personal_report`, `report_access_token`, `report_share`)    |
| Email sending (transactional)     | recipient email, first_name, signed unsubscribe token                                                      | contract / legitimate interest (delivering the report the user paid for)                     | Resend (email service processor)                                       |
| Email sending (marketing nurture) | recipient email, first_name                                                                                | consent (Q16015 marketing opt-in; versioned via `marketing_opt_in_terms_version` per T-11)   | Resend                                                                 |
| Payment processing                | Stripe customer id, card brand/last4, charge id, amount, IP, user agent, **Stripe Radar risk_level**       | contract                                                                                     | Supabase (`payment`, `payment_webhook_event`) + Stripe                 |
| Engagement analytics              | analytics_event rows, scroll depth, time-on-section, click telemetry                                       | consent (CookieYes "analytics" category — visitor ID cookie only set after consent per T-02) | Supabase (`analytics_event`) + GA4 + Microsoft Clarity                 |
| Admin operations                  | admin email, action, IP, target resource                                                                   | legitimate interest (operational forensics)                                                  | Supabase (`admin_action_log`)                                          |
| GDPR DSAR                         | email, action (export/delete), admin email, IP, rows_affected JSON                                         | legal obligation (Art. 17 / Art. 20)                                                         | Supabase (`data_subject_request_log`)                                  |

## 2. Categories of data subjects

- Waitlist signups (pre-launch interest, low engagement)
- Survey takers (high engagement, sensitive-by-context data)
- Paying customers (additional payment data)
- Admins (LoveIQ team members; small, identified group)
- Shared-report recipients (third parties invited by the buyer)

Children (under 18) are explicitly excluded by the Terms of Use. The site does not actively age-verify (a no-UI-changes constraint applies); the policy declaration is the current control.

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

- **Mitigations**: DPAs on file with each processor (out-of-repo legal docs). No DPA exists or is obtainable for Clarity — Microsoft runs it as its own controller and does not sign processor addenda. **As of 2026-08-10 there is no technical safeguard either**: consent-gating and the survey mask were both removed by owner decision, so Art. 9 answers reach an independent controller with neither a contract nor consent behind them. Needs legal sign-off. Resend open/click tracking disabled at the domain level per T-13/T-14 (see `docs/runbooks/SECURITY.md`).

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

- **Mitigation**: T-11 `marketing_opt_in_terms_version` column + `MARKETING_OPT_IN_TERMS_VERSION` code constant.

## 4. Data subject rights — implementation status

| Right (GDPR article)              | Status                                                                     | Mechanism                                                    |
| --------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Access (Art. 15)                  | ✅ DSAR export endpoint                                                    | `/api/admin/data-subject` action=export (F-01)               |
| Rectification (Art. 16)           | ✅ Admin PATCH supports first_name + email (T-08)                          | `/api/admin/submissions/[id]` PATCH                          |
| Erasure (Art. 17)                 | ✅ DSAR delete endpoint                                                    | `/api/admin/data-subject` action=delete (F-01)               |
| Restriction (Art. 18)             | ✅ `app_user.processing_restricted_at` column + nurture-cron filter (T-09) | Admin UI for setting it is a follow-up                       |
| Portability (Art. 20)             | ✅ DSAR export JSON                                                        | F-01                                                         |
| Objection (Art. 21)               | ✅ Unsubscribe one-click + suppression list                                | `/api/unsubscribe` + Resend Audience cleanup (R-05)          |
| Automated decisions (Art. 22)     | ✅ Not solely automated decision-making with legal/significant effect      | Self-knowledge product; no Art. 22 mechanism required        |
| Withdrawal of consent (Art. 7(3)) | ✅ Unsubscribe + DSAR delete                                               | `/api/unsubscribe` + `/api/admin/data-subject` action=delete |

## 5. Security controls

Cross-reference to the security runbook (`docs/runbooks/SECURITY.md`) and the residual-risk audit plan (`C:\claude-home\plans\read-the-file-read-txt-mutable-quilt.md`).

- TLS in transit; Supabase encryption at rest
- CSP (R-11 report-uri), HSTS preload (R-12), CORP (T-16), COOP, X-Frame-Options DENY
- CSRF double-submit cookie + rotation on admin login (R-03)
- Rate-limiting per-IP + per-IP+submission (R-08 IPv6 /64 collapse, R-18 per-submission cap)
- Admin idle timeout 30 min (R-13); concurrent-session cap (T-15)
- RLS service_role-only on all PII tables (F-18 integration test)
- Webhook signature verification + livemode guard (Stripe T-01) + idempotency (Stripe payment_webhook_event UNIQUE; Resend resend_webhook_event UNIQUE)
- Optimistic locking on admin PATCH (F-05)
- Kill switches for survey/nurture (F-12)
- Backup via Supabase PITR (7 days); DR runbook (F-11)

## 6. Outstanding gaps (re-review when these change)

- **No off-Supabase backup** (documented in DR runbook §9). Acceptable for current scale; revisit at 100k+ submissions.
- **F-09 pre-consent third-party loads — PARTIALLY CLOSED (2026-08-10).** Session
  recording no longer loads before consent: Hotjar and Contentsquare were removed
  and replaced by Microsoft Clarity. **REOPENED 2026-08-10 (owner decision):**
  Clarity was subsequently un-gated — it carries neither `type="text/plain"` nor
  `data-cookieyes`, so it now records every visitor regardless of consent, and
  the `data-clarity-mask` on the survey root was removed, so Art. 9 answers are
  captured. See ROPA §"Consent — Clarity is NOT consent-gated". **Also open:**
  GA4 and Google Ads load via
  `next/script` carrying only a `data-cookieyes` attribute, which does NOT
  withhold them. Measured on production 2026-08-10 with the banner untouched,
  these hosts were still contacted pre-consent: `www.googletagmanager.com`,
  `www.google-analytics.com`, `pagead2.googlesyndication.com`. Closing this means
  moving those tags to the same `type="text/plain"` treatment.
- **No two-admin rule on destructive ops** (R-17 deferred). Acceptable for a 1–2 admin team.
- **No DSAR E2E test against branch DB** (R-29 deferred).

## 7. Sign-off

By committing this file, the data controller (Eman) confirms the DPIA has been reviewed and the residual risks are accepted given the documented mitigations.

Next mandatory review: 2027-05-26.
