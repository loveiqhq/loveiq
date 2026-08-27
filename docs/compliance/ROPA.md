# Records of Processing Activity — LoveIQ Web

> Owner: Eman (data controller).
> Last reviewed: 2026-05-26.
> Review cadence: when a new processing activity is added OR a new vendor processor is engaged.

GDPR Art. 30 requires the controller to maintain a written record of processing activities. This is the operational source-of-truth; companion documents:

- `docs/compliance/DPIA.md` — risk assessment + data-subject rights
- `docs/compliance/LAWFUL_BASIS.md` — Art. 6(1) basis per activity
- `app/privacy-policy/page.tsx` — public-facing disclosure

## 1. Controller

- **Name**: LoveIQ (Eman)
- **Contact**: <hello@loveiq.org>
- **Data Protection Officer**: not formally appointed (under the Art. 37 threshold for mandatory DPO designation)

## 2. Processing activities

| #   | Activity                           | Purposes                                                  | Data subjects                         | Categories of personal data                                                                     | Categories of recipients (processors) | Lawful basis (Art. 6)   | Retention                                             | Cross-border transfer          | Technical + organisational measures                                                                                                                                                                   |
| --- | ---------------------------------- | --------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------- | ----------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Waitlist signup                    | Track pre-launch interest                                 | Waitlist signups                      | email, optional first_name, UTM, IP                                                             | Supabase, Vercel                      | (a) consent             | Indefinite until DSAR                                 | EU (Supabase EU region)        | RLS, TLS, RBAC, no client DB access                                                                                                                                                                   |
| 2   | Survey submission                  | Generate personality archetype report                     | Survey takers                         | email, first_name, ~60 answers (incl. sensitive-by-context), IP, session_id, posthog_session_id | Supabase, Vercel                      | (a) consent             | Until DSAR delete                                     | EU                             | RLS, TLS, F-18 RLS integration test, retention purge of partial saves >30d                                                                                                                            |
| 3   | Archetype scoring                  | Produce the report content                                | Survey takers                         | Derived from #2 (no new PII)                                                                    | Supabase, Vercel                      | (b) contract            | Follows #2                                            | EU                             | `config_sha` audit (F-03); deterministic engine                                                                                                                                                       |
| 4   | Report delivery                    | Render purchased report                                   | Survey takers + share-link recipients | personal_report row, signed token                                                               | Supabase, Vercel                      | (b) contract            | Indefinite (tokens revocable)                         | EU                             | Token signing + `revoked_at` + `expires_at` (F-17) + share-recipient cookie HMAC                                                                                                                      |
| 5   | Transactional email                | Deliver purchase confirmation, share link                 | Survey takers, share recipients       | recipient email, first_name, signed unsubscribe token                                           | Resend, Vercel                        | (b) contract            | Resend processor-side log (DPA)                       | US (Resend)                    | TLS, DKIM/SPF on send domain, idempotent webhook (R-02)                                                                                                                                               |
| 6   | Marketing nurture email            | Re-engage non-converted users                             | Survey takers who opted in (Q16015)   | recipient email, first_name, promo code                                                         | Resend, Stripe, Vercel                | (a) consent             | Resend processor-side log                             | US (Resend, Stripe)            | Suppression list, RFC 8058 unsubscribe header, marketing_opt_in_terms_version (T-11), kill switch (F-12), mid-loop kill-switch re-check (T-20)                                                        |
| 7   | Payment processing                 | Take card payments                                        | Paying customers                      | Stripe customer id, card brand/last4, charge id, amount, IP, UA, risk_level                     | Stripe, Vercel, Supabase              | (b) contract            | Indefinite (accounting)                               | US (Stripe)                    | TLS, webhook signature + livemode guard (T-01), idempotency UNIQUE on stripe_event_id, partial-refund handling (F-07), async/SCA paymentIntent re-check (T-04), payment-row UNIQUE constraints (T-05) |
| 8   | Engagement analytics (first-party) | Funnel + UX telemetry for product                         | Survey takers, paying customers       | analytics_event rows, scroll depth, time-on-section, click events                               | Supabase, Vercel                      | (a) consent             | 180d (F-02 purge)                                     | EU                             | Consent-gated visitor ID (T-02), per-submission rate limit (R-18), CSRF-protected ingest                                                                                                              |
| 9   | Engagement analytics (third-party) | Cross-session product insights                            | Survey takers, paying customers       | Vendor cross-site identifiers; PostHog session replay                                           | GA4, Microsoft Clarity, PostHog       | (a) consent (see note)  | Vendor-controlled; PostHog replay 30d                 | US (GA, Clarity), EU (PostHog) | CSP allowlist, CookieYes category-tagged loading, production-only tag gating (GA4/Ads/Clarity are not loaded on staging or localhost)                                                                 |
| 10  | Advertising tracking               | Attribution + retargeting                                 | Survey takers, paying customers       | Vendor pixels                                                                                   | Facebook, TikTok, Google Ads          | (a) consent             | Vendor-controlled                                     | US                             | CookieYes "advertisement" category gating                                                                                                                                                             |
| 11  | Operational forensics              | Investigate incidents + audit admin actions               | Admins                                | admin email, action, IP, target id                                                              | Supabase, Vercel                      | (f) legitimate interest | Indefinite (audit trail)                              | EU                             | RLS service_role-only, log redaction (F-10), Slack masking                                                                                                                                            |
| 12  | Abuse detection                    | Rate-limit, CSRF storm detection, honeypot, fraud signals | All visitors                          | IP (collapsed to /64 for IPv6 per R-08), event counters, Stripe Radar risk_level                | Upstash KV, Vercel, Stripe            | (f) legitimate interest | KV TTL (≤5 min); risk_level follows payment lifecycle | EU/US                          | Per-IP + per-(IP, submission) buckets; honeypot duration check (R-09)                                                                                                                                 |
| 13  | Email-bounce suppression           | Avoid re-mailing complainants                             | All email recipients                  | email + reason                                                                                  | Supabase, Resend                      | (f) legitimate interest | Indefinite (deletion would re-mail)                   | EU + US                        | Resend webhook signature + idempotency (R-02)                                                                                                                                                         |
| 14  | DSAR fulfillment                   | Honour Art. 17 / Art. 20 requests                         | All data subjects exercising rights   | email, action, admin email, IP, rows_affected                                                   | Supabase                              | (c) legal obligation    | Indefinite (proof)                                    | EU                             | Optimistic locking on admin PATCH (F-05), audit-log (F-01)                                                                                                                                            |

## 3. Processors / sub-processors

| Vendor                 | Role                                 | Data shared                                                                                                                                                                                                                                                                                                                | Location            | DPA on file?                           |
| ---------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------- |
| **Supabase**           | Database, auth                       | All personal data (encrypted at rest)                                                                                                                                                                                                                                                                                      | EU region           | ✅ standard Supabase DPA (out-of-repo) |
| **Vercel**             | Hosting + edge runtime               | Request logs (IP, UA, URL)                                                                                                                                                                                                                                                                                                 | Global edge         | ✅ Vercel DPA                          |
| **Stripe**             | Payment processing                   | Payment data per activity #7                                                                                                                                                                                                                                                                                               | US (with EU SCCs)   | ✅ Stripe DPA                          |
| **Resend**             | Email delivery                       | Recipient email, first_name, content                                                                                                                                                                                                                                                                                       | US (with EU SCCs)   | ✅ Resend DPA                          |
| **Upstash**            | KV (rate-limit, engagement counters) | IP-derived keys, ephemeral                                                                                                                                                                                                                                                                                                 | Configured region   | ✅ Upstash DPA                         |
| **Google Analytics 4** | Web analytics                        | Consent-gated identifiers                                                                                                                                                                                                                                                                                                  | US                  | ✅ Google DPA via Workspace            |
| **Microsoft Clarity**  | Session replay + heatmaps            | NOT consent-gated (see note)                                                                                                                                                                                                                                                                                               | EU + US             | ⚠️ NOT a processor — see note below    |
| **PostHog**            | Product analytics + session replay   | Custom event stream, autocapture, session replay (30d retention), distinct_id = lowercased email once a survey is submitted                                                                                                                                                                                                | EU (eu.posthog.com) | ❓ NOT VERIFIED — see note below       |
| **CookieYes**          | Consent management                   | Cookie consent state                                                                                                                                                                                                                                                                                                       | EU                  | ✅ CookieYes DPA                       |
| **Facebook (Meta)**    | Ad pixel                             | Consent-gated cross-site id                                                                                                                                                                                                                                                                                                | US                  | ✅ Meta Business DPA                   |
| **TikTok Ads**         | Ad pixel                             | Consent-gated cross-site id                                                                                                                                                                                                                                                                                                | US/Singapore        | ✅ TikTok DPA                          |
| **Google Ads**         | Ad pixel                             | Consent-gated cross-site id                                                                                                                                                                                                                                                                                                | US                  | ✅ Google Ads DPA                      |
| **Slack**              | Ops alerting + funnel notifications  | Masked email, action, kind, acquisition channel (UTM source/medium/campaign), device type, self-reported country tier, A/B arm, journey timings, purchase amount. **No survey answers, no scoring/archetype output beyond the archetype name already shown on a purchase, never a raw email address, never `utm_content`** | US                  | ✅ Slack DPA                           |

DPAs are stored outside this repository (in the company's contract management). Refresh annually; verify whenever a vendor SOC/ISO certification renews.

## 4. Cross-border transfers

Activities involving US-based processors (Stripe, Resend, Facebook, TikTok, Google, Slack) rely on the SCCs included in their respective DPAs. No transfer to a country without an EU adequacy decision OR SCCs in place.

### PostHog was missing from this record entirely (found 2026-08-27)

PostHog has been running in production since before this file was last reviewed —
35,671 events over the 30 days to 2026-08-27, with **session replay enabled** and a
30-day recording retention — and it had no row in either table above. It is now
listed, but three things about it are **unresolved and need a human decision**:

1. **No DPA has been verified.** The row is marked `❓ NOT VERIFIED` rather than
   guessed. PostHog publishes a DPA and is EU-hosted here (`eu.posthog.com`), which
   is a better starting position than Clarity's, but nobody has confirmed one is on
   file for this account. Until someone does, treat the entry as incomplete.
2. **It is not consent-gated**, the same deliberate choice as Microsoft Clarity
   (see the note below, and `features/analytics/client.ts`, which captures to
   PostHog _before_ the two GA4 consent checks precisely so declining analytics does
   not silently empty the funnel). Everything the Clarity note says about recording
   EU visitors without consent, and about Article-9 answers being captured in survey
   replays, applies to PostHog too.
3. **`posthog.identify()` sets `distinct_id` to the lowercased email** on survey
   submit (`features/survey/ui/hooks/useSubmitSurvey.ts`), so PostHog holds a direct
   identifier, not a pseudonymous one. Unlike Clarity, PostHog _does_ support
   per-person deletion, so a DSAR erasure is at least technically possible here —
   but no runbook step currently does it.

**What changed on 2026-08-27**, and what it does and does not fix:

- `survey_submission.posthog_session_id` now stores the PostHog `$session_id` of the
  session that submitted, so the Slack notification can deep-link to that replay.
  This creates no new category of data in PostHog — the recording already existed;
  it stores a pointer to it in our own database, which is why activity #2 above now
  lists the column. It also means a DSAR erasure of a submission removes our link to
  the recording but not the recording itself (30-day expiry aside).
- GA4, Google Ads, GTM and Clarity are no longer loaded outside production. Before
  this, staging and every developer's localhost recorded into the same GA4 property,
  Ads account and Clarity project as customers — verified by curl:
  staging.loveiq.org served `G-QTYY69L46N`, `AW-18068690553` and `/clarity-init.js`
  identically to the live site. That is a data-minimisation improvement (fewer
  people's sessions sent to US controllers) and is recorded as such in activity #9.
  PostHog deliberately still runs everywhere and tags its events `deploy_env`
  instead, because it is the only replay/error trail staging and dev have.

### Microsoft Clarity is an independent controller, not a processor

Unlike the Hotjar and Contentsquare arrangements it replaced (both processors
under signed DPAs), Microsoft operates Clarity **as an independent data
controller** and does not execute processor/service-provider addenda for it.
Microsoft's own FAQ states Clarity "is GDPR-compliant **as a data controller**"
(<https://learn.microsoft.com/en-us/clarity/faq>). There is therefore no Clarity
DPA to obtain, and the processor table row above is retained only for
completeness — the relationship is controller-to-controller disclosure made on
the basis of the visitor's consent, not processing on LoveIQ's instructions.

Consequences that need a legal decision (flagged 2026-08-10, not resolved here):

1. **Special-category exposure — UNMITIGATED (owner decision, 2026-08-10).**
   Session recordings are captured on `/survey`, which collects Art. 9 data. The
   survey root previously carried `data-clarity-mask` so question text, choice
   labels and selection state were masked; **that mask was deliberately
   removed**, so recordings can now reconstruct a visitor's Art. 9 answers and
   those recordings are disclosed to an independent controller. Compounding
   this, the tag is **no longer consent-gated** (see §"Consent" below), so the
   disclosure happens without the Art. 9(2)(a) explicit consent that the privacy
   policy §5 relies on. Restoring either control is a one-line change.
2. **No per-user erasure.** Clarity has no per-subject delete: Microsoft's FAQ
   states "You need to delete the entire project to delete user's data." This
   conflicts with the Art. 17 route in activity #14 — an erasure request cannot
   currently be honoured inside Clarity without deleting the whole project.
   Mitigating factor: recordings are retained 30 days (favorites and a random
   sample up to 9 months), so exposure is time-bounded.
3. **Privacy-policy wording.** §7 now carves Microsoft out of the blanket
   "all recipients are processors under Art. 28 DPAs" statement, and §7.4
   describes Clarity as loaded on all visits with Microsoft as an independent
   controller. **Still unreconciled:** §5 states Art. 9 data is processed on
   Art. 9(2)(a) explicit consent, which the un-gated recorder contradicts. That
   is a lawyer's call to resolve, not an engineering one — flagged 2026-08-10.

### Consent — Clarity is NOT consent-gated (owner decision, 2026-08-10)

The Clarity tag in `app/layout.tsx` carries no `type="text/plain"` and no
`data-cookieyes` attribute, so it executes on every page load for every
visitor irrespective of the CookieYes banner. This knowingly reverses audit
finding H1 and was chosen to maximize recorded sessions. Consequences: EU
visitors are recorded without consent; the CookieYes banner does not reflect
actual behavior for this vendor; and because the survey mask was removed in
the same change, Art. 9 answers are among what is recorded. `e2e/smoke.spec.ts`
asserts the un-gated shape so the decision cannot be reversed by accident in
either direction.

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
