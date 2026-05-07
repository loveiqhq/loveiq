# External Integrations

> **Last verified:** 2026-03-15 | **Verified against:** API routes, lib/ utilities, .env.example, Supabase migrations

**Analysis Date:** 2025-01-14

## APIs & External Services

**Email Service:**

- Resend - Transactional emails (contact form, invite emails, admin magic links)
  - SDK/Client: `resend` npm package v6.9.2
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
  - Used in: `app/api/contact/route.ts`, `app/api/survey/route.ts`, `app/api/stripe/webhook/route.ts`

**Cookie Consent:**

- CookieYes - Cookie consent banner
  - Integration: External script loaded in `app/layout.tsx`
  - CSP: `cdn-cookieyes.com` allowed in `proxy.ts`

## Data Storage

**Databases:**

- Supabase PostgreSQL
  - Connection: REST API via `SUPABASE_URL` env var
  - Auth: Service role key in `SUPABASE_SERVICE_ROLE_KEY` env var
  - Tables: `survey_submission` (survey responses), `waitlist_user` (historical waitlist signups, retired surface), `rate_limits` (rate limiting), `admin_users` (admin email allowlist), `scoring_result` (survey scoring)
  - Used in: `app/api/survey/route.ts`, `lib/ratelimit.ts`, `lib/admin/supabase.ts`
  - Note: Direct REST API calls, no ORM; also used via `@supabase/supabase-js` + `@supabase/ssr` for admin auth

**File Storage:**

- Not detected (static assets only in `public/`)

**Caching:**

- Not detected (no Redis or similar)

## Authentication & Identity

**Admin Auth:**

- Supabase Auth - Magic link email authentication for admin panel
  - SDK/Client: `@supabase/supabase-js` + `@supabase/ssr`
  - Flow: Admin enters email → magic link sent → callback at `/admin/auth/callback` → session cookie set
  - Access control: `admin_users` table in Supabase acts as email allowlist
  - Session management: Server-side via `@supabase/ssr` cookie helpers (`lib/admin/supabase-server.ts`, `lib/supabase-middleware.ts`)
  - Role support: `lib/admin/roles.ts` (role-based access control)
  - Audit logging: `lib/admin/audit.ts`
  - Used in: `app/admin/`, `app/api/admin/`, `lib/admin/`

**End-User Auth:**

- None (no end-user authentication system)
- Site is marketing/landing page only

**Staging Auth:**

- Staging environment uses basic password auth (`app/api/staging-login/route.ts`)

**OAuth Integrations:**

- Not applicable (magic links are passwordless, not OAuth)

## Monitoring & Observability

**Analytics:**

- Google Analytics 4 - Page views and event tracking
  - Measurement ID: `G-QTYY69L46N` (hardcoded in `app/layout.tsx`)
  - Integration: Google Tag Manager via `next/script`
  - Custom events via `lib/analytics.ts`:
    - `cta_click` - CTA button tracking
    - `survey_started` / `survey_progress` / `survey_complete` - Funnel tracking
    - `report_viewed` / `paywall_view` / `begin_checkout` - Report engagement

**Error Tracking:**

- Not detected (no Sentry or similar)

**Logs:**

- pino structured logging (`lib/logger.ts`)
- @vercel/otel for OpenTelemetry integration
- Slack notifications for important events

**CI Pipeline:**

- GitHub Actions - 7 workflows in `.github/workflows/`:
  - `ci.yml` - Build + lint + test
  - `security.yml` - Security scanning (secrets, SAST, dependencies, SBOM)
  - `codeql.yml` - Advanced CodeQL analysis
  - `release.yml` - Release workflow
  - `health-monitor.yml` - Health monitoring
  - `lighthouse.yml` - Lighthouse CI
  - `load-test.yml` - Load testing

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

- Not applicable (no payment or external webhooks)

**Outgoing:**

- Slack notifications for survey submissions (`app/api/survey/route.ts`)
- Slack notifications for contact submissions (`app/api/contact/route.ts`)
- Slack notifications for Stripe payments (`app/api/stripe/webhook/route.ts`)

## Third-Party Script CSP

Content Security Policy in `proxy.ts` allows:

- `googletagmanager.com` - Analytics
- `google-analytics.com` - Analytics
- `google.com/recaptcha` - reCAPTCHA
- `gstatic.com/recaptcha` - reCAPTCHA assets
- `cdn-cookieyes.com` - Cookie consent
- `images.unsplash.com` - Stock images

---

_Integration audit: 2025-01-14_
_Last updated: 2026-03-15_
_Update when adding/removing external services_
