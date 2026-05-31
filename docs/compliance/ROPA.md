# Records of Processing Activity — LoveIQ Web

> Owner: Eman (data controller).
> Last reviewed: 2026-05-26.
> Review cadence: when a new processing activity is added OR a new vendor processor is engaged.

GDPR Art. 30 requires the controller to maintain a written record of processing activities. This is the operational source-of-truth; companion documents:

- `docs/compliance/DPIA.md` — risk assessment + data-subject rights
- `docs/compliance/LAWFUL_BASIS.md` — Art. 6(1) basis per activity
- `app/privacy-policy/page.tsx` — public-facing disclosure

## 1. Controller

- **Name**: LoveIQ (Eman + Ferhad)
- **Contact**: hello@loveiq.org
- **Data Protection Officer**: not formally appointed (under the Art. 37 threshold for mandatory DPO designation)

## 2. Processing activities

| #   | Activity                           | Purposes                                                  | Data subjects                         | Categories of personal data                                                      | Categories of recipients (processors) | Lawful basis (Art. 6)   | Retention                                             | Cross-border transfer          | Technical + organisational measures                                                                                                                                                                   |
| --- | ---------------------------------- | --------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------- | ----------------------- | ----------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Waitlist signup                    | Track pre-launch interest                                 | Waitlist signups                      | email, optional first_name, UTM, IP                                              | Supabase, Vercel                      | (a) consent             | Indefinite until DSAR                                 | EU (Supabase EU region)        | RLS, TLS, RBAC, no client DB access                                                                                                                                                                   |
| 2   | Survey submission                  | Generate personality archetype report                     | Survey takers                         | email, first_name, ~60 answers (incl. sensitive-by-context), IP, session_id      | Supabase, Vercel                      | (a) consent             | Until DSAR delete                                     | EU                             | RLS, TLS, F-18 RLS integration test, retention purge of partial saves >30d                                                                                                                            |
| 3   | Archetype scoring                  | Produce the report content                                | Survey takers                         | Derived from #2 (no new PII)                                                     | Supabase, Vercel                      | (b) contract            | Follows #2                                            | EU                             | `config_sha` audit (F-03); deterministic engine                                                                                                                                                       |
| 4   | Report delivery                    | Render purchased report                                   | Survey takers + share-link recipients | personal_report row, signed token                                                | Supabase, Vercel                      | (b) contract            | Indefinite (tokens revocable)                         | EU                             | Token signing + `revoked_at` + `expires_at` (F-17) + share-recipient cookie HMAC                                                                                                                      |
| 5   | Transactional email                | Deliver purchase confirmation, share link                 | Survey takers, share recipients       | recipient email, first_name, signed unsubscribe token                            | Resend, Vercel                        | (b) contract            | Resend processor-side log (DPA)                       | US (Resend)                    | TLS, DKIM/SPF on send domain, idempotent webhook (R-02)                                                                                                                                               |
| 6   | Marketing nurture email            | Re-engage non-converted users                             | Survey takers who opted in (Q16015)   | recipient email, first_name, promo code                                          | Resend, Stripe, Vercel                | (a) consent             | Resend processor-side log                             | US (Resend, Stripe)            | Suppression list, RFC 8058 unsubscribe header, marketing_opt_in_terms_version (T-11), kill switch (F-12), mid-loop kill-switch re-check (T-20)                                                        |
| 7   | Payment processing                 | Take card payments                                        | Paying customers                      | Stripe customer id, card brand/last4, charge id, amount, IP, UA, risk_level      | Stripe, Vercel, Supabase              | (b) contract            | Indefinite (accounting)                               | US (Stripe)                    | TLS, webhook signature + livemode guard (T-01), idempotency UNIQUE on stripe_event_id, partial-refund handling (F-07), async/SCA paymentIntent re-check (T-04), payment-row UNIQUE constraints (T-05) |
| 8   | Engagement analytics (first-party) | Funnel + UX telemetry for product                         | Survey takers, paying customers       | analytics_event rows, scroll depth, time-on-section, click events                | Supabase, Vercel                      | (a) consent             | 180d (F-02 purge)                                     | EU                             | Consent-gated visitor ID (T-02), per-submission rate limit (R-18), CSRF-protected ingest                                                                                                              |
| 9   | Engagement analytics (third-party) | Cross-session product insights                            | Survey takers, paying customers       | Vendor cross-site identifiers                                                    | GA4, Hotjar, Contentsquare            | (a) consent             | Vendor-controlled                                     | US (GA, Hotjar, Contentsquare) | CSP allowlist, CookieYes category-tagged loading                                                                                                                                                      |
| 10  | Advertising tracking               | Attribution + retargeting                                 | Survey takers, paying customers       | Vendor pixels                                                                    | Facebook, TikTok, Google Ads          | (a) consent             | Vendor-controlled                                     | US                             | CookieYes "advertisement" category gating                                                                                                                                                             |
| 11  | Operational forensics              | Investigate incidents + audit admin actions               | Admins                                | admin email, action, IP, target id                                               | Supabase, Vercel                      | (f) legitimate interest | Indefinite (audit trail)                              | EU                             | RLS service_role-only, log redaction (F-10), Slack masking                                                                                                                                            |
| 12  | Abuse detection                    | Rate-limit, CSRF storm detection, honeypot, fraud signals | All visitors                          | IP (collapsed to /64 for IPv6 per R-08), event counters, Stripe Radar risk_level | Upstash KV, Vercel, Stripe            | (f) legitimate interest | KV TTL (≤5 min); risk_level follows payment lifecycle | EU/US                          | Per-IP + per-(IP, submission) buckets; honeypot duration check (R-09)                                                                                                                                 |
| 13  | Email-bounce suppression           | Avoid re-mailing complainants                             | All email recipients                  | email + reason                                                                   | Supabase, Resend                      | (f) legitimate interest | Indefinite (deletion would re-mail)                   | EU + US                        | Resend webhook signature + idempotency (R-02)                                                                                                                                                         |
| 14  | DSAR fulfillment                   | Honour Art. 17 / Art. 20 requests                         | All data subjects exercising rights   | email, action, admin email, IP, rows_affected                                    | Supabase                              | (c) legal obligation    | Indefinite (proof)                                    | EU                             | Optimistic locking on admin PATCH (F-05), audit-log (F-01)                                                                                                                                            |

## 3. Processors / sub-processors

| Vendor                 | Role                                 | Data shared                           | Location          | DPA on file?                           |
| ---------------------- | ------------------------------------ | ------------------------------------- | ----------------- | -------------------------------------- |
| **Supabase**           | Database, auth                       | All personal data (encrypted at rest) | EU region         | ✅ standard Supabase DPA (out-of-repo) |
| **Vercel**             | Hosting + edge runtime               | Request logs (IP, UA, URL)            | Global edge       | ✅ Vercel DPA                          |
| **Stripe**             | Payment processing                   | Payment data per activity #7          | US (with EU SCCs) | ✅ Stripe DPA                          |
| **Resend**             | Email delivery                       | Recipient email, first_name, content  | US (with EU SCCs) | ✅ Resend DPA                          |
| **Upstash**            | KV (rate-limit, engagement counters) | IP-derived keys, ephemeral            | Configured region | ✅ Upstash DPA                         |
| **Google Analytics 4** | Web analytics                        | Consent-gated identifiers             | US                | ✅ Google DPA via Workspace            |
| **Hotjar**             | Session replay + heatmaps            | Consent-gated                         | EU + US           | ✅ Hotjar DPA                          |
| **Contentsquare**      | UX heatmaps                          | Consent-gated                         | EU + US           | ✅ Contentsquare DPA                   |
| **CookieYes**          | Consent management                   | Cookie consent state                  | EU                | ✅ CookieYes DPA                       |
| **Facebook (Meta)**    | Ad pixel                             | Consent-gated cross-site id           | US                | ✅ Meta Business DPA                   |
| **TikTok Ads**         | Ad pixel                             | Consent-gated cross-site id           | US/Singapore      | ✅ TikTok DPA                          |
| **Google Ads**         | Ad pixel                             | Consent-gated cross-site id           | US                | ✅ Google Ads DPA                      |
| **Slack**              | Ops alerting                         | Masked email, action, kind            | US                | ✅ Slack DPA                           |

DPAs are stored outside this repository (in the company's contract management). Refresh annually; verify whenever a vendor SOC/ISO certification renews.

## 4. Cross-border transfers

Activities involving US-based processors (Stripe, Resend, Hotjar, Contentsquare, Facebook, TikTok, Google, Slack) rely on the SCCs included in their respective DPAs. No transfer to a country without an EU adequacy decision OR SCCs in place.

## 5. Security measures (cross-reference)

Detailed implementation lives in `docs/runbooks/SECURITY.md` and the residual-risk plan. Headline measures:

- TLS in transit, encryption at rest (Supabase, Stripe, Resend defaults)
- RLS service-role-only on all PII tables; tested via integration suite (F-18)
- CSP with `report-uri` (R-11); HSTS preload (R-12); CORP (T-16)
- CSRF double-submit cookie; rotation on admin login (R-03)
- Rate-limiting per IP + per (IP, submission) — IPv6 /64 collapse (R-08, R-18)
- Admin session: 30-min idle timeout (R-13) + concurrent session cap (T-15)
- Webhook signature verification + livemode guard (T-01) + idempotency
- Optimistic locking on admin mutations (F-05)
- Kill switches (F-12), mid-loop re-check (T-20)
- Per-table retention via daily cron (F-02 + T-17)
- DSAR endpoint with audit trail (F-01)
- Marketing consent versioning (T-11)
- Right to restriction: `processing_restricted_at` flag (T-09)
- Backups: Supabase PITR 7 days; DR runbook (F-11)

## 6. Data breach response

`docs/runbooks/DISASTER_RECOVERY.md` and `.github/INCIDENT_RESPONSE_AGENT.md` cover incident response. Notifiable breaches under Art. 33: within 72 hours to the supervisory authority. Notification to data subjects per Art. 34 when high risk.

## 7. Change log

- 2026-05-26: created per T-18 residual-risk audit. Aligns with DPIA + Lawful Basis docs.
