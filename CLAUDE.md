# CLAUDE.md

> AI assistant instructions for the LoveIQ marketing website codebase.

## TL;DR - Quick Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # Run ESLint
npm test             # Run unit tests once (Vitest)
npm run start        # Run production build locally
npm run analyze      # Bundle size analysis (opens visual treemap)
npm run docs:check   # Docs-truth + markdown prettier (mirrors docs-truth CI job)
npm run check        # Lint + test + docs:check + build (full CI check)
npm run setup        # Install deps + create .env.local from .env.example
```

---

## Repo Map

```
loveiq-web/
├── app/                        # Next.js App Router (pages + API routes)
│   ├── api/
│   │   ├── contact/route.ts    # Contact form → Resend + Slack
│   │   ├── survey/route.ts     # Survey submission → Supabase RPC + Slack
│   │   ├── health/route.ts     # Health check endpoint
│   │   ├── staging-login/route.ts   # Staging environment auth
│   │   ├── staging-logout/route.ts  # Staging environment auth
│   │   ├── survey-tracking/route.ts # Survey behavior tracking → Supabase
│   │   ├── invite/route.ts         # Invite email sending → Resend + Supabase
│   │   ├── invite-tracking/route.ts # Invite share method tracking → Supabase
│   │   ├── survey-partial/route.ts  # Partial survey save (draft) → Supabase
│   │   ├── analytics-event/route.ts # Persist report-engagement events to analytics_event (CSRF + rate-limited; allowlisted event types only)
│   │   └── admin/                   # Admin panel API routes
│   │       ├── login/route.ts       # Admin login (magic link via Supabase Auth)
│   │       ├── logout/route.ts      # Admin logout
│   │       ├── stats/route.ts       # Dashboard analytics
│   │       ├── submissions/route.ts # Submission list (paginated, full-text search, per-column sort, is_likely_test flag)
│   │       ├── submissions/[id]/route.ts # Submission CRUD (GET/PATCH/DELETE; GET also returns report_token + hotjar_user_id)
│   │       ├── submissions/[id]/timeline/route.ts # User journey timeline (waitlist, emails, shares, report engagement events)
│   │       ├── submissions/bulk-delete/route.ts # Bulk delete test submissions (admin role; server re-verifies is_likely_test)
│   │       ├── export/route.ts      # CSV export
│   │       ├── survey-status/route.ts # Survey active/closed toggle
│   │       └── product-kpis/route.ts  # Product KPI data (static)
│   ├── admin/                   # Admin panel pages (Supabase Auth-protected)
│   │   ├── auth/callback/route.ts # Magic link callback handler
│   │   ├── layout.tsx           # Admin shell (sidebar + header)
│   │   ├── login/page.tsx       # Admin login page (email + magic link)
│   │   ├── page.tsx             # Dashboard
│   │   ├── submissions/page.tsx # Submission browser
│   │   ├── submissions/[id]/page.tsx # Submission detail
│   │   ├── survey-status/page.tsx   # Survey status toggle
│   │   └── product-kpis/page.tsx   # Product KPIs dashboard
│   ├── about/page.tsx          # About page
│   ├── login/page.tsx          # Staging login page
│   ├── glossary/               # Glossary pages (index + [slug])
│   ├── trust-zone/             # Trust zone pages
│   ├── survey/page.tsx         # Survey / intro wizard
│   ├── [legal pages]           # privacy-policy, terms-*, cookies, imprint, etc.
│   ├── globals.css             # CSS variables + Tailwind + animations
│   ├── layout.tsx              # Root layout (fonts, scripts, metadata)
│   ├── page.tsx                # Landing page entry
│   ├── error.tsx                # Error boundary page
│   ├── global-error.tsx         # Root error boundary
│   ├── robots.ts               # robots.txt generation
│   └── sitemap.ts              # sitemap.xml generation
├── features/                   # Domain-first feature folders (each: ui/, server/ or logic/, tests/, AGENT_README.md)
│   ├── landing/ui/             # S01-S15 landing sections + NavSection + FooterSection + ScrollAnimator
│   ├── about/ui/               # About page sections (Hero, Team, Publications, etc.)
│   ├── glossary/ui/            # /glossary index + term page
│   ├── legal/ui/               # Shared chrome for legal pages
│   ├── trust-zone/ui/          # /trust-zone
│   ├── not-found/ui/           # 404 page
│   ├── staging/                # Staging password gate (ui/ + tests/)
│   ├── survey/                 # ui/, server/, tests/, server/emails/ — assessment funnel
│   ├── report/                 # ui/, server/, tests/, server/emails/ — /report paywalled
│   ├── checkout/               # ui/, server/, tests/ — Stripe checkout
│   ├── pricing/                # logic/ — report pricing math
│   ├── scoring/                # logic/, tests/ — V4+V5 archetype engine
│   ├── invite/                 # ui/, emails/, tests/ — partner invite consolidation
│   ├── contact/tests/          # Contact form pipeline tests (route stays in app/api/contact/)
│   ├── cron/tests/             # Scheduled job tests (routes stay in app/api/cron/)
│   ├── analytics/              # client.ts (GA4 helpers) + tests/
│   └── admin/                  # ui/ (22 internal subdomains), server/, server/emails/, tests/ — 280+ files preserving internal structure
├── shared/                     # Cross-cutting infrastructure (renamed from lib/)
│   ├── http/                   # csrf, csrf-client, ratelimit, fetch-with-timeout, circuit-breaker, after-response
│   ├── observability/          # logger (pino), hotjar
│   ├── auth/                   # supabase-middleware (admin sessions only)
│   ├── url/                    # utm, safe-href, share-message
│   ├── format/                 # html-escape
│   ├── emails/                 # ab-variant, shared HTML shell, suppression, unsubscribe-token
│   └── ui/                     # branding/, GtmScript, HydrationMarker, NonceProvider, SmoothScroll, UtmCapture, WebVitals
├── data/
│   ├── glossary-data.ts        # Auto-generated glossary terms (688KB, from CSV)
│   ├── glossary-source.csv     # Source CSV; regenerate via `node scripts/update-glossary.js`
│   ├── survey-data.ts          # Survey questions and structure
│   ├── survey-source.csv       # Source CSV for survey questions
│   ├── countries.ts            # Country list for survey forms
│   ├── scoring-config.ts       # Auto-generated scoring config (from CSVs)
│   ├── scoring-config/         # Source CSVs for archetype scoring (12 files)
│   ├── product-kpis.ts         # Report section KPI data (static/sample) + Question/Chapter KPI interfaces (live from Supabase)
│   └── product-kpis/           # Source CSV for report sections (1 file; questions/chapters now live)
├── scripts/                    # Build/data scripts (update-glossary.js, update-survey.js, etc.)
├── public/                     # Static assets (images, videos)
├── proxy.ts                    # Middleware: CSP headers, CSRF cookies, security logging
├── .github/workflows/
│   ├── ci.yml                  # Build + lint + test
│   ├── security.yml            # Security scanning (secrets, SAST, dependencies, SBOM)
│   ├── codeql.yml              # Advanced CodeQL analysis
│   ├── release.yml             # Release workflow
│   ├── health-monitor.yml      # Health monitoring
│   ├── lighthouse.yml          # Lighthouse CI
│   └── load-test.yml           # Load testing
├── .planning/                  # Architecture docs (ARCHITECTURE.md, CONVENTIONS.md, AGENTS.md, etc.)
├── FILE_INDEX.md               # Task-based file lookup (find any file by what you want to do)
├── SECURITY.md                 # Security guidelines + secrets rotation
├── DEVELOPMENT.md              # Development setup guide
└── [config files]              # package.json, tsconfig.json, tailwind.config.js, etc.
```

---

## Architecture Overview

**Type:** Static marketing site with API routes (Next.js 16 App Router)

**No end-user authentication.** This is a pre-launch marketing site driven by the assessment funnel at `/survey`. The admin panel (`/admin/*`) uses Supabase Auth with magic link emails; see `admin_users` table for the email allowlist.

### Data Flow

1. **Page Load:** SSR → Client hydration → Smooth scroll init → Analytics pageview
2. **Contact Form:** Form → reCAPTCHA → CSRF check → Rate limit → Zod validation → Resend email → Slack notification
3. **Survey Submission:** Form → CSRF check → Rate limit → Zod validation → Honeypot check → Email cooldown → Supabase RPC → Slack notification
4. **Pre-Report Wizard:** Survey submit success → 3s success animation → fade to PreReportWizard (5 slides) → SurveyConfirmation final CTA
5. **Survey Tracking:** Question transition → Buffer events → Flush batch → CSRF check → Rate limit → Zod validation → Supabase insert
6. **Admin Panel:** `/admin/*` → Supabase Auth middleware gate (magic link session) → API routes with session + CSRF + rate limit → Supabase queries
7. **Invite Send:** Form → CSRF check → Rate limit → Zod validation → Resend email (after response) → Supabase invite_event insert (after response)
8. **Invite Tracking:** Share button click → CSRF check → Rate limit → Zod validation → Supabase invite_event insert
9. **Survey Partial Save:** Auto-save on question transition → CSRF check (header or body for sendBeacon) → Rate limit → Zod validation → Supabase upsert (survey_partial_save)
10. **Nurture Email Sequence:** `/api/cron/nurture-sequence` (hourly) reads `personal_report.created_date_time`, fans out to 4 stages (`6h_no_view`, `6h_no_unlock`, `30h_no_unlock`, `54h_no_unlock`). At 30h/54h, mints a per-user Stripe Promotion Code (24h expiry, customer-restricted) → Resend send → idempotency write to `report_price_quote.metadata.nurtureEmailsSent[]` + `nurturePromoCodes[stage]`. Email CTA links carry `?promo=<code>&offer=1&pricingSessionId=…&utm_campaign=<stage>`. The `/report/[token]` page stashes `?promo=` in sessionStorage; checkout-session POST forwards it, server validates ownership via `resolveNurturePromo()`, pre-applies as `discounts:[]` on the Stripe session, and stamps `metadata.promoCode`/`metadata.promoStage` for attribution.

### Key Boundaries

- **Server-only secrets:** Supabase service key, Resend API key, reCAPTCHA secret, Slack webhooks
- **Client-safe:** Only `NEXT_PUBLIC_*` vars (site URL, reCAPTCHA site key, Supabase URL + anon key)
- **No direct DB client:** All Supabase access via REST API in API routes

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill values:

| Variable                                   | Required     | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                     | Yes          | Canonical URL for metadata                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `SUPABASE_URL`                             | For forms    | Survey + admin database                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `SUPABASE_SERVICE_ROLE_KEY`                | For forms    | Supabase auth (server-only!)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `RESEND_API_KEY`                           | For forms    | Email sending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `RESEND_FROM`                              | No           | From address (default: `LoveIQ <hello@send.loveiq.org>`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `RESEND_REPLY_TO`                          | No           | Reply-to address                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `RESEND_AUDIENCE_ID`                       | No           | Resend Audience UUID. Opted-in marketing recipients (Q16015 = "Yes") are pushed here. When unset, the audience push is skipped.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`           | For contact  | reCAPTCHA client key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `RECAPTCHA_SECRET_KEY`                     | For contact  | reCAPTCHA server key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SLACK_CONTACT_WEBHOOK_URL`                | No           | Slack notifications for contact form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SLACK_SURVEY_WEBHOOK_URL`                 | No           | Slack notifications for survey submissions + report chapter feedback (👍/👎 with optional comment/issue)                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `SLACK_PAYMENTS_WEBHOOK_URL`               | No           | Slack notifications for report purchases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `SLACK_OPS_WEBHOOK_URL`                    | No           | Ops/alerts channel: 5xx errors, cron failures, Stripe disputes/refunds, circuit-breaker state, admin actions, daily digest                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `STAGING_PASSWORD`                         | For staging  | Password gate for staging deployment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `NEXT_PUBLIC_SUPABASE_URL`                 | For admin    | Supabase project URL (browser-safe, for admin auth SDK)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`            | For admin    | Supabase anon key (browser-safe, for admin auth SDK)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SURVEY_CLOSE_PASSWORD`                    | For admin    | Password required to close/pause the survey (server-only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `CONTACT_TO_EMAIL`                         | For contact  | Contact form recipient                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `NEXT_PUBLIC_GTM_ID`                       | No           | GTM container ID (optional, falls back to direct gtag.js)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `LOG_LEVEL`                                | No           | Pino log level (fatal/error/warn/info/debug/trace; default: info)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`       | For checkout | Browser-safe Stripe publishable key (`pk_test_...` sandbox or `pk_live_...` prod)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `STRIPE_SECRET_KEY`                        | For checkout | Server-only Stripe secret (`sk_test_...` sandbox or `sk_live_...` prod)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `STRIPE_WEBHOOK_SECRET`                    | For checkout | Webhook signing secret (`whsec_...`) per Stripe dashboard endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `STRIPE_COUPON_50`                         | For nurture  | Stripe Coupon ID for 50%-off (e.g. `nurture_50`). Used by `/api/cron/nurture-sequence` to mint per-user 24h promotion codes                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `STRIPE_COUPON_75`                         | For nurture  | Stripe Coupon ID for 75%-off (e.g. `nurture_75`). Same purpose, last-chance reminder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `STRIPE_CHECKOUT_ENABLED`                  | For checkout | `true` to create real Stripe sessions; default `false`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `NEXT_PUBLIC_STRIPE_CHECKOUT_PREVIEW_MODE` | No           | `false` for normal flow; `true` adds a "preview" banner only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `KV_REST_API_URL`                          | For prod     | Upstash Redis REST URL — backs the rate limiter; falls back to in-memory if unset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `KV_REST_API_TOKEN`                        | For prod     | Upstash Redis REST token — paired with `KV_REST_API_URL`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `CRON_SECRET`                              | For crons    | Bearer token for `/api/cron/*` endpoints; required when those crons are deployed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `PURGE_OLD_DATA_ENABLED`                   | No           | Safety flag for the destructive retention purge (`/api/cron/purge-old-data`). **Postponed** — leave unset (disabled). Route no-ops unless exactly `true` AND the cron is re-added to `vercel.json`. See "Postponed / TODO" below.                                                                                                                                                                                                                                                                                                                                      |
| `UNSUBSCRIBE_SECRET`                       | For email    | 32-byte hex string used to sign HMAC-SHA256 unsubscribe tokens (generate with `crypto.randomBytes(32).toString('hex')`)                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `RESEND_WEBHOOK_SECRET`                    | For email    | Svix webhook signing secret (`whsec_...`) from Resend dashboard; used by `/api/resend/webhook`                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `SHARE_VERIFY_SECRET`                      | For sharing  | ≥16-char HMAC secret for stateless share-recipient cookies (1-yr lifetime); falls back to `SUPABASE_SERVICE_ROLE_KEY` when unset                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `STRATEGY_DIGEST_SIGNING_SECRET`           | For digest   | ≥16-char HMAC secret that signs the PNG-chart URLs embedded in the funnel-digest Slack messages. Slack's image proxy is anonymous so authenticity proof must travel in the URL. Falls back to `SHARE_VERIFY_SECRET` → `SUPABASE_SERVICE_ROLE_KEY` when unset.                                                                                                                                                                                                                                                                                                          |
| `NEXT_PUBLIC_HOTJAR_SITE_ID`               | No           | Numeric Hotjar site id; loads the recording snippet (consent-gated)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `NEXT_PUBLIC_CONTENTSQUARE_PROJECT_ID`     | No           | Numeric Contentsquare project id; enables the "Session replay ↗" chip on the admin submission detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `ADMIN_TEST_EMAIL_REGEX`                   | No           | Override the staff-email regex used to flag test submissions (default `^.+@loveiq\.org$`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `STRIPE_LIVE_MODE`                         | No           | T-01 livemode-guard **override** (optional). By default the guard derives the expected mode from `STRIPE_SECRET_KEY` (`sk_live_` ⇒ live, else test), so it is self-configuring and does not need setting. Set to `true`/`false` only to force a mode that differs from the key. Webhook events whose `event.livemode` mismatches the expected mode are refused (Slack ops alert) so cross-mode events never fulfill against prod data. (History: when this was a required env, leaving it unset on a live-mode prod refused 100% of real webhooks — now auto-derived.) |
| `SUPABASE_TEST_URL`                        | No           | Integration tests only (`npm run test:integration`). Point at a Supabase branch with the full migration set applied. Leave unset to skip integration tests silently.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SUPABASE_TEST_SERVICE_ROLE_KEY`           | No           | Integration tests only. Service-role key for `SUPABASE_TEST_URL`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `SUPABASE_TEST_ANON_KEY`                   | No           | Integration tests only. Anon key for `SUPABASE_TEST_URL`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**The site renders without env vars.** Forms will fail gracefully with error messages.

### Stripe checkout

The paywall on `/report` is always enforced — clicking a locked premium section opens the pricing modal. Purchases unlock by tier:

- `essentials` plan → essentials sections only
- `full_report` plan → essentials + full-report sections
- `all_reports` plan → all sections across every archetype

Sandbox and live mode both run the real fulfillment path. To test in sandbox use Stripe test card `4242 4242 4242 4242` (any future date, any CVC). After a successful test purchase, the webhook fulfills the access plan onto the report.

Required Vercel env vars (test or production):

```
STRIPE_CHECKOUT_ENABLED=true
NEXT_PUBLIC_STRIPE_CHECKOUT_PREVIEW_MODE=false
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... | pk_live_...
STRIPE_SECRET_KEY=sk_test_... | sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Stripe dashboard webhook endpoint: `https://<your-domain>/api/stripe/webhook` — subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Disputed payments re-lock the report automatically; if the merchant wins the dispute (`charge.dispute.closed` with `status=won`), access is restored.

For local sandbox testing, install Stripe CLI and run `stripe listen --forward-to localhost:3000/api/stripe/webhook`. Use the printed `whsec_...` as `STRIPE_WEBHOOK_SECRET`.

If `STRIPE_CHECKOUT_ENABLED=true` but any Stripe key is missing, the server logs an error on first checkout/webhook hit and the route returns 503. No silent failure.

---

## Development

### Quick Start

```bash
npm install
cp .env.example .env.local  # Edit with your values (optional for UI work)
npm run dev                  # http://localhost:3000
```

### CSP in Development

The middleware (`proxy.ts`) relaxes CSP in dev mode:

- Allows `'unsafe-eval'` for Next.js HMR
- Allows `ws://localhost:*` for WebSocket connections
- Skips `upgrade-insecure-requests`

### Common Issues

| Issue                 | Fix                                                                      |
| --------------------- | ------------------------------------------------------------------------ |
| Form returns 403      | Clear cookies for localhost, refresh page                                |
| CSP errors in console | Ensure running latest code with dev CSP relaxation                       |
| reCAPTCHA not loading | Set `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, register localhost in Google admin |

---

## Testing

### Unit Tests (Vitest)

- `npm test` — run all unit tests once
- `npm run test:watch` — watch mode
- `npm run test:coverage` — with coverage report
- Tests live in `__tests__/` mirroring source structure

### E2E Tests (Playwright)

- `npm run test:e2e` — builds prod, starts server, runs all 5 browser projects
- Browser projects: Desktop Chrome/Firefox/Safari, Mobile Chrome (Pixel 7), Mobile Safari (iPhone 15 Pro)
- Reports saved to `playwright-report/`
- See `.planning/codebase/TESTING.md` for full E2E reference

### Pre-push hook standard

- Pre-push runs: `npm test` (unit tests only, ~10–30s) ✅
- E2E belongs in CI, NOT pre-push — too slow (~3–6 min), blocks developer flow ❌

### To validate changes manually

1. `npm run lint` — must pass
2. `npm test` — must pass
3. `npm run build` — must succeed
4. `npm run test:e2e` — run before PRs or after touching UI

---

## CI/CD

**GitHub Actions** (`.github/workflows/`):

- `ci.yml` — Build + lint + test on push/PR
- `security.yml` — Security scanning (secrets, SAST, dependencies, SBOM)
- `codeql.yml` — Advanced CodeQL analysis
- `docs-truth.yml` — Documentation truth validation (links, scripts, env vars)
- `release.yml` — Release workflow
- `health-monitor.yml` — Health monitoring
- `lighthouse.yml` — Lighthouse CI
- `load-test.yml` — Load testing
- `visual-regression.yml` — Visual regression testing (Playwright screenshots)

Runs on push/PR to `main`.

**Deployment:** Vercel (configured externally, not in repo)

---

## Styling System

### Design Tokens

CSS custom properties in `app/globals.css`:

```css
--color-bg: #0b0613;
--color-surface: #0f0a18;
--accent-orange: #f26d4f;
--accent-purple: #9c7dff;
/* ... see globals.css for full list */
```

Extended in `tailwind.config.js`:

```js
colors: {
  page: "var(--color-bg)",
  surface: "var(--color-surface)",
  accent: { orange: "var(--accent-orange)", purple: "var(--accent-purple)" }
}
```

### Typography

- **Sans:** Manrope (`--font-sans`, class `font-sans`)
- **Serif:** Lora (`--font-serif`, class `font-serif`)
- Headings default to serif, body to sans

### Utility Classes

| Class                | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `.content-shell`     | Max-width container (1200px)                    |
| `.section-shell`     | Section vertical padding                        |
| `.animate-on-scroll` | Fade-up on scroll (add `.animate` when visible) |
| `.reveal-on-scroll`  | Alternative scroll reveal (add `.is-visible`)   |

### Component Patterns

```tsx
// Standard section component
const SectionName: FC = () => {
  return (
    <section className="relative bg-page py-16 lg:py-24">
      <div className="content-shell">{/* content */}</div>
    </section>
  );
};

export default SectionName;
```

---

## API Route Patterns

### Standard Structure

```typescript
// app/api/example/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const schema = z.object({
  email: z.string().email().max(320),
  // ...
});

export async function POST(request: Request) {
  // 1. CSRF verification
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 2. Rate limiting
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, { bucket: "example", limit: 5, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  // 3. Validation
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 4. Business logic
  try {
    // ... do work
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Error processing example");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
```

### Error Response Format

Always return `{ error: string }` or `{ success: true }`. Keep error messages generic to avoid information disclosure.

---

## How to Change Things Safely

### Pre-Change Checklist

- [ ] Read existing code in the area you're modifying
- [ ] Run `npm run lint` - fix any errors
- [ ] Run `npm run build` - ensure it succeeds
- [ ] Test manually in browser

### Common Tasks

#### Add a New Landing Section

1. Create `components/landing/S##NewSection.tsx`
2. Follow existing section patterns (see `S06Archetypes.tsx` for complex example)
3. Import and add to `components/landing/LandingPage.tsx` in order
4. Use `animate-on-scroll` class for scroll animations

#### Add a New Page

1. Create `app/{page-name}/page.tsx`
2. Create `components/{page-name}/{PageName}Page.tsx` for content
3. Add to navigation if needed (`NavSection.tsx`, `FooterSection.tsx`)
4. Add to `app/sitemap.ts` for SEO

#### Add a New API Endpoint

1. Create `app/api/{name}/route.ts`
2. Include CSRF verification (`verifyCsrfToken`)
3. Include rate limiting (`checkRateLimit`)
4. Add Zod schema for input validation
5. Use generic error messages
6. Log errors with `logger` from `@/lib/logger`

#### Add a New Environment Variable

1. Add to `.env.example` with description
2. Document in this file's Environment Variables section
3. If client-side, prefix with `NEXT_PUBLIC_`
4. Update `SECURITY.md` if it's a secret

#### Modify CSP / Add Third-Party Script

1. Edit `proxy.ts` CSP directives
2. Add domain to appropriate directive (`script-src`, `connect-src`, `img-src`, etc.)
3. Test in both dev and production build
4. Document in `SECURITY.md`

---

## Security Guidelines

### Secrets

- **Never commit secrets** - Use `.env.local` (gitignored)
- **Never expose service keys** - `SUPABASE_SERVICE_ROLE_KEY` is server-only
- **Use placeholders in code** - Document where to get real values

### Input Handling

- All API inputs validated with Zod
- Email addresses normalized (lowercase, trimmed)
- HTML escaped in email templates (`lib/emails/invite.ts`)
- Header injection prevented in contact form

### Rate Limiting

- IP-based rate limiting on all form endpoints
- Persisted in Supabase (survives deployments)
- Email-based cooldown on survey submissions

### CSRF Protection

- Double-submit cookie pattern
- Cookie set by middleware (`proxy.ts`)
- Verified in API routes (`lib/csrf.ts`)

See `SECURITY.md` for rotation schedules and incident response.

---

## Agent Operating Rules

When working in this codebase:

1. **Search before creating** - Check if a similar component/pattern exists
2. **Match existing patterns** - Follow conventions in `components/landing/` for sections
3. **Smallest change principle** - Don't refactor unrelated code
4. **Never commit secrets** - Use placeholders like `your-api-key-here`
5. **Run lint before finishing** - `npm run lint` must pass
6. **Test the build** - `npm run build` must succeed
7. **Preserve security** - Don't weaken CSP, rate limits, or CSRF checks
8. **Keep error messages generic** - Avoid information disclosure
9. **Use existing utilities** - `lib/ratelimit.ts`, `lib/csrf.ts`, `lib/analytics.ts`, `lib/logger.ts`, `lib/circuit-breaker.ts`, `lib/fetch-with-timeout.ts`
10. **Document unknowns** - If uncertain, note assumptions and which files to check
11. **Clean up temporary files** - If you create any `.md` files for planning, implementation logs, fix summaries, or debugging notes (e.g., in `.planning/` or repo root), **delete them once the task is complete**. Only permanent documentation (like this file, `SECURITY.md`, `DEVELOPMENT.md`, `.planning/codebase/*`) should remain in the repo.

### When Uncertain

- Check `.planning/codebase/` docs for architecture decisions
- Look at similar existing code (e.g., existing API routes, existing sections)
- Ask rather than guess on security-related changes

---

## Postponed / TODO (deliberately deferred work)

- **Enable the data-retention purge cron** (`/api/cron/purge-old-data`). Built,
  tested, and verified safe, but intentionally **OFF** (decision 2026-05-31:
  postpone deletion until we have more customers and data old enough to trim —
  as of that date 0 rows were even eligible). It only ever deletes operational
  throwaway data (abandoned survey drafts >30d, tracking events >180d, cron
  logs >90d, invite events >180d, Stripe/Resend webhook receipts) — never
  submissions, answers, scoring, reports, payments, or users. **To turn on
  when ready:** (1) set `PURGE_OLD_DATA_ENABLED=true` in the prod Vercel env,
  and (2) re-add the `/api/cron/purge-old-data` entry to `vercel.json` crons
  (schedule `30 3 * * *`). Review the retention-window list in the route first.
  The `table-size-digest` cron (non-destructive) stays on so growth is visible
  — watch it to decide when to enable the purge.
- **Add retention for unbounded telemetry tables** not yet covered:
  `survey_behavior_event`, `report_session` (holds IP/UA — privacy angle),
  `funnel_event`. Decide windows when enabling the purge above.

---

## Security Incident Response

When you observe ANY of these triggers, switch to IR mode immediately:

- Secret, API key, or token committed or visible in code, logs, or outputs
- Suspicious edits to `.github/workflows/`, `proxy.ts`, auth code, or dependency files
- Unexpected CI behaviour, build anomalies, or lockfile changes
- Evidence of force-push, rewritten history, or account takeover
- New postinstall scripts, base64 blobs in diffs, or unusual outbound calls in code

**Follow the full protocol in `.github/INCIDENT_RESPONSE_AGENT.md` exactly.**

Non-negotiable directives (from the protocol):

1. **Do no harm** — no destructive/irreversible action without explicit written authorization
2. **Preserve evidence first** — capture state, logs, hashes before changing anything
3. **Least change** — smallest containment step that reduces risk
4. **Default to escalation** — if uncertain, recommend containment, never "wait and see"

Never print secret values. Label all risky suggested commands as "requires authorization".

---

## FAQ / Troubleshooting

### Build fails with "Module not found"

Check import paths. This repo uses the `@/` alias (maps to project root). Use `@/lib/...`, `@/components/...`, `@/app/...` for cross-directory imports. Same-directory imports still use `./`.

### Forms fail silently

Check browser DevTools Network tab for response. Common causes:

- Missing CSRF cookie (refresh page)
- Rate limited (wait 1 minute)
- Missing env vars (check server logs)

### Styles not applying

- Check if using correct design token (see `globals.css`, `tailwind.config.js`)
- Tailwind purges unused classes - ensure class is in content paths

### Animations not working

- `animate-on-scroll` needs JavaScript to add `.animate` class
- `ScrollAnimator` component handles this on landing page
- Check if `IntersectionObserver` is being set up correctly

### Local dev slower than expected

- Next.js 16 uses Turbopack in dev by default
- First load compiles on-demand
- Subsequent loads are cached

---

## File Quick Reference

> For a complete task-based file index, see [`FILE_INDEX.md`](FILE_INDEX.md).

| Need to...               | Look at...                                                |
| ------------------------ | --------------------------------------------------------- |
| Find any file by task    | `FILE_INDEX.md`                                           |
| Add landing section      | `components/landing/LandingPage.tsx`, existing `S##*.tsx` |
| Modify navigation        | `components/landing/NavSection.tsx`                       |
| Modify footer            | `components/landing/FooterSection.tsx`                    |
| Add API endpoint         | `app/api/contact/route.ts` (reference)                    |
| Change email template    | `lib/emails/invite.ts`                                    |
| Add analytics event      | `lib/analytics.ts`                                        |
| Modify design tokens     | `app/globals.css` (CSS vars), `tailwind.config.js`        |
| Update security headers  | `proxy.ts`                                                |
| Understand architecture  | `.planning/codebase/ARCHITECTURE.md`                      |
| Check coding conventions | `.planning/codebase/CONVENTIONS.md`                       |
