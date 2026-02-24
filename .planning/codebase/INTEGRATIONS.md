# External Integrations

**Analysis Date:** 2025-01-14

## APIs & External Services

**Email Service:**

- Resend - Transactional emails (waitlist confirmation, contact form)
  - SDK/Client: `resend` npm package v6.6.0
  - Auth: API key in `RESEND_API_KEY` env var
  - From address: `RESEND_FROM` env var (default: `LoveIQ <hello@send.loveiq.org>`)
  - Reply-to: `RESEND_REPLY_TO` env var (default: `hello@loveiq.org`)
  - Used in: `app/api/waitlist/route.ts`, `app/api/contact/route.ts`

**Spam Protection:**

- Google reCAPTCHA - Contact form spam protection
  - Integration method: Server-side verification via REST API
  - Auth: Secret key in `RECAPTCHA_SECRET_KEY` env var
  - Used in: `app/api/contact/route.ts`

**Notifications:**

- Slack Webhooks - Team notifications for signups and contacts
  - Waitlist webhook: `SLACK_WAITLIST_WEBHOOK_URL` env var
  - Contact webhook: `SLACK_CONTACT_WEBHOOK_URL` env var
  - Used in: `app/api/waitlist/route.ts`, `app/api/contact/route.ts`

## Data Storage

**Databases:**

- Supabase PostgreSQL - Waitlist signups storage
  - Connection: REST API via `SUPABASE_URL` env var
  - Auth: Service role key in `SUPABASE_SERVICE_ROLE_KEY` env var
  - Table: `waitlist_signups`
  - Used in: `app/api/waitlist/route.ts`
  - Note: Direct REST API calls, no ORM

**File Storage:**

- Not detected (static assets only in `public/`)

**Caching:**

- Not detected (no Redis or similar)

## Authentication & Identity

**Auth Provider:**

- Not detected (no user authentication system)
- Site is marketing/landing page only

**OAuth Integrations:**

- Not applicable

## Monitoring & Observability

**Analytics:**

- Google Analytics 4 - Page views and event tracking
  - Measurement ID: `G-QTYY69L46N` (hardcoded in `app/layout.tsx`)
  - Integration: Google Tag Manager via `next/script`
  - Custom events via `lib/analytics.ts`:
    - `cta_click` - CTA button tracking
    - `waitlist_signup` - Signup tracking

**Error Tracking:**

- Not detected (no Sentry or similar)

**Logs:**

- Console logging only (stdout/stderr)
- Used in API routes for debugging

## CI/CD & Deployment

**Hosting:**

- Vercel-ready (Next.js framework)
  - Deployment: Not configured in repo (likely Vercel dashboard)
  - Environment vars: Configured externally

**CI Pipeline:**

- Not detected (no GitHub Actions or similar in repo)

## Environment Configuration

**Development:**

- Required env vars:
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  - `RESEND_API_KEY`
  - `RECAPTCHA_SECRET_KEY`
  - `NEXT_PUBLIC_SITE_URL`
- Optional env vars:
  - `RESEND_FROM`, `RESEND_REPLY_TO`
  - `SLACK_WAITLIST_WEBHOOK_URL`, `SLACK_CONTACT_WEBHOOK_URL`
  - `CONTACT_TO_EMAIL`
- Secrets location: `.env.local` (gitignored)

**Staging:**

- Not documented

**Production:**

- Secrets management: Vercel environment variables (assumed)
- Security headers: Configured in `next.config.js`

## Webhooks & Callbacks

**Incoming:**

- Not applicable (no payment or external webhooks)

**Outgoing:**

- Slack notifications for waitlist signups (`app/api/waitlist/route.ts`)
- Slack notifications for contact submissions (`app/api/contact/route.ts`)

## Third-Party Script CSP

Content Security Policy in `next.config.js` allows:

- `googletagmanager.com` - Analytics
- `google-analytics.com` - Analytics
- `google.com/recaptcha` - reCAPTCHA
- `gstatic.com/recaptcha` - reCAPTCHA assets
- `images.unsplash.com` - Stock images
- `figma.com` - Design assets

---

_Integration audit: 2025-01-14_
_Update when adding/removing external services_
