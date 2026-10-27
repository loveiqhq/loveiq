# External Integrations

> **Last verified:** 2026-10-27 | **Verified against:** `origin/main` at `3ca54753`: API routes, `shared/`, `features/`, `proxy.ts`, `.github/workflows/`, `.env.example`, Supabase migrations

## APIs & External Services

**Payments:**

- Stripe - Checkout sessions, promotion codes, automatic tax and signed webhooks
  - SDK/Client: `stripe` npm package (exact version in `package.json`)
  - Auth: `STRIPE_SECRET_KEY` (server), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (browser), `STRIPE_WEBHOOK_SECRET` (webhook signature)
  - Used in: `app/api/stripe/`, `features/checkout/server/`, `features/pay-to-start/`
  - The price and any discount code are checked on the server. A payment counts once. A full refund or a dispute locks the report again (`features/checkout/server/fulfillment.ts`)
  - Tax: `automatic_tax` is switched on in `features/checkout/server/stripeCheckout.ts` when Stripe Tax is active

**Email Service:**

- Resend - Transactional emails (contact form, invite emails, admin magic links)
  - SDK/Client: `resend` npm package (exact version in `docs/versions.md` / `package.json`)
  - Auth: API key in `RESEND_API_KEY` env var
  - From address: `RESEND_FROM` env var (default: `LoveIQ <hello@send.loveiq.org>`)
  - Reply-to: `RESEND_REPLY_TO` env var (default: `hello@loveiq.org`)
  - Used in: `app/api/contact/route.ts`, `app/api/invite/route.ts`, `app/api/admin/login/route.ts`

**Spam Protection:**

- Google reCAPTCHA - Contact form spam protection
  - Integration method: Server-side verification via REST API
  - Auth: Secret key in `RECAPTCHA_SECRET_KEY` env var
  - Used in: `app/api/contact/route.ts`

**Notifications:**

- Slack Webhooks - Team notifications for surveys, contacts, and payments
  - Contact webhook: `SLACK_CONTACT_WEBHOOK_URL` env var
  - Survey webhook: `SLACK_SURVEY_WEBHOOK_URL` env var
  - Payments webhook: `SLACK_PAYMENTS_WEBHOOK_URL` env var
  - Ops webhook: `SLACK_OPS_WEBHOOK_URL` env var (5xx errors, failed cron runs, Stripe disputes and refunds, daily digest)
  - Used in: `app/api/contact/route.ts`, `app/api/survey/route.ts`, `app/api/stripe/webhook/route.ts`

**Cookie Consent:**

- CookieYes - Cookie consent banner
  - Integration: External script loaded in `app/layout.tsx`
  - CSP: `cdn-cookieyes.com` allowed in `proxy.ts`
  - Decides: GA4 and Google Ads follow the banner. Clarity and PostHog run on all visits (see "Measuring" in [`ARCHITECTURE.md`](ARCHITECTURE.md))

## Data Storage

**Databases:**

- Supabase PostgreSQL
  - Connection: REST API via `SUPABASE_URL` env var
  - Auth: Service role key in `SUPABASE_SERVICE_ROLE_KEY` env var
  - Tables: about 100, created in `supabase/migrations/`. Main groups: survey (`survey_submission`, `survey_submission_answer`, `survey_partial_save`, `survey_behavior_event`), scoring (`scoring_result`), report (`personal_report`, `personal_report_section`, `report_price_quote`, `report_session`), payments (`payment`, `payment_item`, `payment_webhook_event`), email (`email_message_event`, `email_suppression`, `resend_webhook_event`, `invite_event`), analytics (`analytics_event`, `funnel_event`), company brain (`brain_chunk`, `brain_person`, `brain_query`), feature switches (`system_flags`), admin (`admin_users`), plus `waitlist_user` (historical waitlist signups, retired surface)
  - Used in: `app/api/survey/route.ts`, `features/admin/server/supabase.ts`, and every feature that stores data
  - Staging has its own Supabase project (see [`docs/runbooks/STAGING_DATABASE.md`](../runbooks/STAGING_DATABASE.md))
  - Note: Direct REST API calls, no ORM; also used via `@supabase/supabase-js` + `@supabase/ssr` for admin auth

**File Storage:**

- Not detected (static assets only in `public/`)

**Caching and counters:**

- Upstash Redis (Vercel KV)
  - Auth: `KV_REST_API_URL` and `KV_REST_API_TOKEN`
  - Used for: rate limits (`shared/http/ratelimit.ts`) and the counters the security-storm detector reads (`shared/http/csrf.ts`)
  - Fails open on Redis errors, and falls back to in-memory limits when unset (local development and the staging project)

## Authentication & Identity

**Admin Auth:**

- Supabase Auth - Magic link email authentication for admin panel
  - SDK/Client: `@supabase/supabase-js` + `@supabase/ssr`
  - Flow: Admin enters email → magic link sent → callback at `/admin/auth/callback` → session cookie set
  - Access control: `admin_users` table in Supabase acts as email allowlist
  - Session management: Server-side via `@supabase/ssr` cookie helpers (`features/admin/server/supabase-server.ts`, `shared/auth/supabase-middleware.ts`)
  - Role support: `features/admin/server/roles.ts` (role-based access control)
  - Audit logging: `features/admin/server/audit.ts`
  - Used in: `app/admin/`, `app/api/admin/`, `features/admin/server/`

**End-User Auth:**

- None: there are no customer accounts. A report opens through its private link, and sharing a report uses a signed recipient cookie (`SHARE_VERIFY_SECRET`)

**Staging Auth:**

- Staging environment uses basic password auth (`app/api/staging-login/route.ts`)

**OAuth Integrations:**

- Not applicable (magic links are passwordless, not OAuth)

## Monitoring & Observability

**Analytics:**

- Google Analytics 4 - Page views and event tracking
  - Measurement ID: `G-QTYY69L46N` (hardcoded in `app/layout.tsx`)
  - Integration: Google Tag Manager via `next/script`
  - Custom events via `features/analytics/client.ts`:
    - `cta_click` - CTA button tracking
    - `survey_started` / `survey_progress` / `survey_completed` - Funnel tracking
    - `report_viewed` / `paywall_initiated` / `begin_checkout` - Report engagement (note: `paywall_view` retained for back-compat but no longer fired; user-initiated clicks emit `paywall_initiated`)
  - **Server-side `purchase`** via GA4 Measurement Protocol (`features/analytics/server/ga4.ts`), sent from the Stripe webhook (`features/checkout/server/fulfillment.ts`) so GA4's purchase count matches real payments — the client-side `purchase` event is lossy (ad blockers, closed tabs, consent, GTM). Same `transaction_id` (Stripe session id) as the client event, so GA4 dedupes to one purchase. Consent-gated via the `_ga`/consent captured at checkout. Requires `GA4_API_SECRET`.

**Session recordings and heatmaps:**

- PostHog - Product events, session recordings and client error capture
  - SDK/Client: `posthog-js` (`features/analytics/client.ts`)
  - Runs on all visits, not behind the cookie banner (see "Measuring" in [`ARCHITECTURE.md`](ARCHITECTURE.md))
- Microsoft Clarity - Heatmaps and session recordings
  - Script: `public/clarity-init.js`, emitted on production only; runs on all visits

**Error Tracking:**

- No dedicated error-tracking service
- Client errors go to PostHog (`posthog.captureException` in `app/error.tsx` and `app/global-error.tsx`)
- Server 5xx errors, failed cron runs, refunds and disputes post to the Slack ops channel (`SLACK_OPS_WEBHOOK_URL`)

**Logs:**

- pino structured logging (`shared/observability/logger.ts`)
- @vercel/otel for OpenTelemetry integration
- Slack notifications for important events

**CI Pipeline:**

- GitHub Actions - 22 workflows in `.github/workflows/`. GitHub's own schedule starts jobs hours late, so an hourly Vercel Cron (`/api/cron/start-github-jobs`) starts the ones that are due:
  - Checks: `ci.yml` (lint, test, integration, migration drift, browser tests, build, docs impact; a smoke test runs after a push to main), `security.yml`, `codeql.yml`, `docs-truth.yml`, `lighthouse.yml`, `load-test.yml`, `visual-regression.yml`, `health-monitor.yml`, `probe-guard.yml`, `cloud-setup-smoke.yml`
  - Company brain: `brain-ingest.yml`, `brain-embed.yml`, `brain-daily.yml`
  - UX review and fix proofs: `persona-walkers.yml`, `ux-review-verify.yml`, `ux-digest-audit.yml`, `generate-fix.yml`, `prove-fix.yml`, `sync-vision-scanners.yml`
  - Release and housekeeping: `release.yml`, `slack-commits.yml`, `survey-db-sync.yml`

## Environment Configuration

**Development:**

- Required env vars:
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - `RESEND_API_KEY`
  - `RECAPTCHA_SECRET_KEY`
  - `NEXT_PUBLIC_SITE_URL`
- Optional env vars:
  - `RESEND_FROM`, `RESEND_REPLY_TO`
  - `SLACK_CONTACT_WEBHOOK_URL`, `SLACK_SURVEY_WEBHOOK_URL`, `SLACK_PAYMENTS_WEBHOOK_URL`
  - `CONTACT_TO_EMAIL`
- Secrets location: `.env.local` (gitignored)
- Template: `.env.example`

**Staging:**

- Deployed on Vercel (staging branch)
- Protected by staging login gate

**Production:**

- Secrets management: Vercel environment variables
- Security headers: Configured in `proxy.ts`

## Webhooks & Callbacks

**Incoming:**

Three routes receive them. Each verifies a signature before doing any work, and each
is idempotent on a replay:

- `app/api/stripe/webhook/route.ts` — payment lifecycle, refunds and disputes. Signed
  with `STRIPE_WEBHOOK_SECRET`; a disputed payment re-locks the report.
- `app/api/resend/webhook/route.ts` — email delivery, bounces, complaints and sends Resend
  refused (`email.suppressed`); the last three suppress the address. Svix signature,
  `RESEND_WEBHOOK_SECRET`.
- `app/api/slack/events/route.ts` — inbound Slack events for the company brain. Slack
  signing secret plus a workspace check, so another workspace's events are refused.

Also inbound, and checked another way:

- `app/api/cron/*` — scheduled jobs, started by Vercel Cron. Each checks `Authorization: Bearer ${CRON_SECRET}`.
- `app/api/mcp/route.ts` — the company brain's MCP endpoint, which Claude connects to. Access rules are in [`docs/runbooks/COMPANY_BRAIN.md`](../runbooks/COMPANY_BRAIN.md).

**Outgoing:**

- Slack notifications for survey submissions (`app/api/survey/route.ts`)
- Slack notifications for contact submissions (`app/api/contact/route.ts`)
- Slack notifications for Stripe payments (`app/api/stripe/webhook/route.ts`)
- Stripe API: Checkout sessions and promotion codes (`features/checkout/server/`)
- Resend API: sends from the app and from the scheduled jobs
- GA4 Measurement Protocol: server-side `purchase` (`features/analytics/server/ga4.ts`)
- GitHub API: the hourly workflow dispatch (`app/api/cron/start-github-jobs/route.ts`)

## Third-Party Script CSP

`proxy.ts` builds the Content Security Policy and is the source of truth. It allows, by purpose:

- Google Tag Manager, Google Analytics and Google Ads tags (`googletagmanager.com`, `google-analytics.com`, `doubleclick.net`, `googleadservices.com`)
- reCAPTCHA (`google.com/recaptcha`, `gstatic.com/recaptcha`)
- CookieYes (`cdn-cookieyes.com`, `cookieyes.com`)
- Microsoft Clarity and Bing (`clarity.ms`, `c.bing.com`)
- Meta and TikTok hosts (`connect.facebook.net`, `analytics.tiktok.com`); no tag for them is in this repo
- Trustpilot (`trustpilot.com`; the widget is off by default)
- Stripe (`js.stripe.com`, `api.stripe.com`, `checkout.stripe.com`, `hooks.stripe.com`)
- Images (`images.unsplash.com`, `flagcdn.com`)

---

_Last updated: 2026-10-27_
_Update when adding/removing external services_
