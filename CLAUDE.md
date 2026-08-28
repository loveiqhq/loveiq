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
npm run docs:check   # Docs-truth + markdownlint + cspell + prettier (mirrors docs-truth CI job)
npm run check        # Lint + test + docs:check + build (full CI check)
npm run setup        # Install deps + create .env.local from .env.example
```

---

## Repo Map

```text
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
│   │   ├── mcp/route.ts        # Company brain over MCP (bearer auth) — Claude's recall layer
│   │   ├── analytics-event/route.ts # Persist report-engagement events to analytics_event (CSRF + rate-limited; allowlisted event types only)
│   │   └── admin/                   # Admin panel API routes
│   │       ├── login/route.ts       # Admin login (magic link via Supabase Auth)
│   │       ├── logout/route.ts      # Admin logout
│   │       ├── stats/route.ts       # Dashboard analytics
│   │       ├── submissions/route.ts # Submission list (paginated, full-text search, per-column sort, is_likely_test flag)
│   │       ├── submissions/[id]/route.ts # Submission CRUD (GET/PATCH/DELETE; GET also returns report_token)
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
│   ├── landing/ui/white/       # White landing sections (W*) — arm A of the live 50/50 A/B
│   ├── landing/ui/white-v1/    # The white landing before the 2026-08-10 rebuild — arm B
│   ├── landing/ui/             # Shared: FooterSection + ScrollAnimator + NavSection (404) + S06Archetypes (data)
│   ├── about/ui/               # About page sections (Hero, Team, Publications, etc.)
│   ├── glossary/ui/            # /glossary index + term page
│   ├── legal/ui/               # Shared chrome for legal pages
│   ├── trust-zone/ui/          # /trust-zone
│   ├── not-found/ui/           # 404 page
│   ├── staging/                # Staging password gate (ui/ + tests/)
│   ├── survey/                 # ui/, server/, tests/, server/emails/ — assessment funnel (white/dark theme A/B concluded 2026-08-25 in favour of white)
│   ├── report/                 # ui/, server/, tests/, server/emails/ — /report paywalled
│   ├── checkout/               # ui/, server/, tests/ — Stripe checkout
│   ├── pricing/                # logic/ — report pricing math
│   ├── scoring/                # logic/, tests/ — V4+V5 archetype engine
│   ├── invite/                 # ui/, emails/, tests/ — partner invite consolidation
│   ├── contact/tests/          # Contact form pipeline tests (route stays in app/api/contact/)
│   ├── cron/tests/             # Scheduled job tests (routes stay in app/api/cron/)
│   ├── analytics/              # client.ts (GA4 helpers) + tests/
│   ├── brain/                  # server/ + tests/ — company brain: Slack Q&A over our docs, commits and Jira
│   └── admin/                  # ui/ (22 internal subdomains), server/, server/emails/, tests/ — 280+ files preserving internal structure
├── shared/                     # Cross-cutting infrastructure (renamed from lib/)
│   ├── http/                   # csrf, csrf-client, ratelimit, fetch-with-timeout, circuit-breaker, after-response
│   ├── observability/          # logger (pino)
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
├── docs/architecture/          # Architecture docs (ARCHITECTURE.md, CONVENTIONS.md, AGENTS.md, etc.)
├── docs/runbooks/              # Operational runbooks (SECURITY.md, DEVELOPMENT.md, DISASTER_RECOVERY.md, etc.)
├── FILE_INDEX.md               # Task-based file lookup (find any file by what you want to do)
└── [config files]              # package.json, tsconfig.json, tailwind.config.js, etc.
```

---

## Architecture Overview

**Type:** Static marketing site with API routes (Next.js 16 App Router)

**No end-user authentication.** This is a pre-launch marketing site driven by the assessment funnel at `/survey`. The admin panel (`/admin/*`) uses Supabase Auth with magic link emails; see `admin_users` table for the email allowlist.

### Data Flow

1. **Page Load:** SSR → Client hydration → Smooth scroll init → Analytics pageview
2. **Contact Form:** Form → reCAPTCHA → CSRF check → Rate limit → Zod validation → Resend email → Slack notification
3. **Survey Submission:** Form → CSRF check → Rate limit → Zod validation → Honeypot check → Email cooldown → Supabase RPC → consent PATCH (also stores `posthog_session_id`, the PostHog `$session_id` captured at submit) → Slack notification with a "▶ Watch session recording" button beside the admin link
4. **Pre-Report Wizard:** Survey submit → ProcessingSequence (white; 5 animated steps around a progress ring, ~11s, waits for the POST) → fade to PreReportWizard (5 slides, dark) → `/report/<token>`. SurveyConfirmation is the error path only.
5. **Survey Tracking:** Question transition → Buffer events → Flush batch → CSRF check → Rate limit → Zod validation → Supabase insert
6. **Admin Panel:** `/admin/*` → Supabase Auth middleware gate (magic link session) → API routes with session + CSRF + rate limit → Supabase queries
7. **Invite Send:** Form → CSRF check → Rate limit → Zod validation → Resend email (after response) → Supabase invite_event insert (after response)
8. **Invite Tracking:** Share button click → CSRF check → Rate limit → Zod validation → Supabase invite_event insert
9. **Survey Partial Save:** Auto-save on question transition → CSRF check (header or body for sendBeacon) → Rate limit → Zod validation → Supabase upsert (survey_partial_save)
10. **Nurture Email Sequence:** `/api/cron/nurture-sequence` (hourly) reads `personal_report.created_date_time`, fans out to 5 stages (`6h_no_view`, `6h_no_unlock`, `30h_no_unlock`, `54h_no_unlock`, `78h_no_unlock`). At 30h/54h, mints a per-user Stripe Promotion Code (24h expiry, customer-restricted) → Resend send → idempotency write to `report_price_quote.metadata.nurtureEmailsSent[]` + `nurturePromoCodes[stage]`. Email CTA links carry `?promo=<code>&offer=1&pricingSessionId=…&utm_campaign=<stage>`. The `/report/[token]` page stashes `?promo=` in sessionStorage; checkout-session POST forwards it, server validates ownership via `resolveNurturePromo()`, pre-applies as `discounts:[]` on the Stripe session, and stamps `metadata.promoCode`/`metadata.promoStage` for attribution.
11. **78h Call Invite + Calendly Capture:** The final nurture stage (`78h_no_unlock`) sends NO discount — it invites a 20-minute call (CTA → Calendly, UTM + name/email prefill) and writes a `call_invite_sent` row to `booking_event`. Calendly `invitee.created` / `invitee.canceled` hit `/api/calendly/webhook` (signature-verified, idempotent via `calendly_webhook_event`) → `call_booked` / `call_canceled` rows in `booking_event`, correlated by `utm_content` (submission id) → email fallback. All booking events surface in the admin submission timeline.
12. **Post-call 100% coupon (manual grant):** After the call, an admin clicks "Grant 100% coupon" on the submission detail → `/api/admin/submissions/[id]/grant-call-coupon` mints a one-time 100%-off code (`STRIPE_COUPON_100`, 14-day expiry), stores it under `report_price_quote.metadata.nurturePromoCodes.post_call`, emails the user a one-tap unlock link, and writes a `call_coupon_sent` `booking_event`. Redeemed via the normal `?promo=` checkout → $0 session → existing fulfillment unlocks `full_report`.

### Analytics environments

**GA4, Google Ads, GTM and Microsoft Clarity load on production only.** Their IDs are
hardcoded (there is no per-environment property), so before 2026-08-27 every
`npm run dev` page view and every visit to `staging.loveiq.org` recorded into the
same GA4 property, Ads account and Clarity project as real customers — and on Google
Ads that meant a developer clicking through checkout fed the conversion signal the
bidding algorithm optimises on.

The gate is `isProductionSite()` in `shared/env/is-non-prod-deploy.ts`, evaluated at
build time in `app/layout.tsx`, so the tags are not emitted at all off production.
It is a positive **allowlist** of production hosts and is deliberately **not** the
inverse of `isNonProdDeploy()` in the same file — the two gates guard opposite risks
and so must fail in opposite directions. See the doc comments there; the difference
is what closes `npm run build && npm start` on a laptop, which has
`NODE_ENV=production` and a localhost site URL.

Consequences to expect:

- `window.gtag` is undefined off production, so every `track()` call skips GA4. This
  needs no per-call handling — `features/analytics/client.ts` already gates on
  `window.__loveiqAnalyticsEnabled`, which the (now absent) init script sets.
- **PostHog and CookieYes still run everywhere.** PostHog is the only replay and
  error trail staging and local dev have, so it is labelled rather than excluded: it
  registers `deploy_env` (`production` | `staging` | `development`) as a super
  property, so filtering is one click. CookieYes must stay because its consent cookie
  is what gates the first-party durable writes in `persistAnalyticsEvent` — dropping
  it would silently stop the funnel tables staging QA reads, not just quieten a third
  party.
- `sendGa4PurchaseEvent` refuses to send off production too. It runs in the Stripe
  webhook rather than a browser, and staging shares the production database, so a
  sandbox test purchase would otherwise arrive in real GA4 as revenue.

To verify a change here, build twice and diff the served HTML — that is how the gate
was confirmed:

```bash
npm run build && npx next start -p 3111                       # localhost URL: 0 trackers
NEXT_PUBLIC_SITE_URL=https://www.loveiq.org npm run build \
  && NEXT_PUBLIC_SITE_URL=https://www.loveiq.org npx next start -p 3112   # all 5 present
```

### Key Boundaries

- **Server-only secrets:** Supabase service key, Resend API key, reCAPTCHA secret, Slack webhooks
- **Client-safe:** Only `NEXT_PUBLIC_*` vars (site URL, reCAPTCHA site key, Supabase URL + anon key)
- **No direct DB client:** All Supabase access via REST API in API routes

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill values:

| Variable                                   | Required     | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                     | Yes          | Canonical URL for metadata                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`        | For PostHog  | PostHog project token (`phc_...`, browser-safe). Initialised in `instrumentation-client.ts`, so autocapture + pageviews cover every page (landing, survey, report, checkout, admin). Unset = PostHog no-ops silently and the site renders normally.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `NEXT_PUBLIC_POSTHOG_HOST`                 | For PostHog  | PostHog ingest host, e.g. `https://eu.i.posthog.com` (EU cloud, project 244778). Also read by `proxy.ts` to widen `script-src`/`connect-src` to this host plus its registrable domain; an unparseable value is ignored rather than throwing in middleware.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `SUPABASE_URL`                             | For forms    | Survey + admin database                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`                | For forms    | Supabase auth (server-only!)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `RESEND_API_KEY`                           | For forms    | Email sending                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `RESEND_FROM`                              | No           | From address (default: `LoveIQ <hello@send.loveiq.org>`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `RESEND_REPLY_TO`                          | No           | Reply-to address                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `RESEND_AUDIENCE_ID`                       | No           | Resend Audience UUID. Opted-in marketing recipients (Q16015 = "Yes") are pushed here. When unset, the audience push is skipped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `EMAIL_IMAGE_BASE_URL`                     | No           | Base URL for EMAIL `<img>` `src` (logo + testimonial photos), resolved by `getEmailImageBaseUrl()` in `shared/emails/site-url.ts`. Mail clients (esp. Gmail) may strip remote images whose host doesn't align with the sending domain (Resend's "Host images on the sending domain" warning), so logos silently fail for some recipients. Set to a host aligned with the sending domain (e.g. `https://send.loveiq.org`) **only after** that host serves the `/public` assets (add it to the Vercel project first — otherwise every email image 404s). When unset, falls back to `NEXT_PUBLIC_SITE_URL` (no behaviour change). CTA links always stay on `NEXT_PUBLIC_SITE_URL`. Staging/preview/non-localhost-http values are rejected to the fallback. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`           | For contact  | reCAPTCHA client key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `RECAPTCHA_SECRET_KEY`                     | For contact  | reCAPTCHA server key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SLACK_CONTACT_WEBHOOK_URL`                | No           | Slack notifications for contact form                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SLACK_SURVEY_WEBHOOK_URL`                 | No           | Slack notifications for survey submissions + report chapter feedback (👍/👎 with optional comment/issue)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `SLACK_PAYMENTS_WEBHOOK_URL`               | No           | Slack notifications for report purchases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `SLACK_OPS_WEBHOOK_URL`                    | No           | Ops/alerts channel: 5xx errors, cron failures, Stripe disputes/refunds, circuit-breaker state, admin actions, daily digest                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `SLACK_BOT_TOKEN`                          | No           | Slack **bot** token (`xoxb-...`, scope `chat:write`). Enables LIVE-UPDATING survey notifications: incoming webhooks return no message id, so the per-user journey ping was frozen at the instant of submission — its rail could only ever show step 1 of 5 and the pricing arm read "Not recorded" because no quote existed yet. With this set the message is posted via `chat.postMessage` and then edited as the person opens their report, starts checkout and pays. Needs `SLACK_JOURNEY_CHANNEL_ID` too; without both, falls back to the existing webhook with no behaviour change.                                                                                                                                                                |
| `SLACK_JOURNEY_CHANNEL_ID`                 | No           | Channel ID (`C0...`, from the channel's "Copy link" — not the `#name`) the bot posts journey notifications into. Paired with `SLACK_BOT_TOKEN`; the bot must be invited to that channel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `STAGING_PASSWORD`                         | For staging  | Password gate for staging deployment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `NEXT_PUBLIC_SUPABASE_URL`                 | For admin    | Supabase project URL (browser-safe, for admin auth SDK)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`            | For admin    | Supabase anon key (browser-safe, for admin auth SDK)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `JOURNEY_BACKFILL_ENABLED`                 | No           | Gates the one-shot catch-up at `/api/cron/journey-backfill`, which re-posts the last 7 days of survey notifications in the current format as replies under a single thread. **Leave unset.** Set to `true` only while running it (Vercel → Crons → Run), then remove it. Its cron schedule is annual and meaningless — this flag is the real control, and the run is idempotent via `slack_journey_message.backfilled_at`, so pressing Run twice resumes rather than double-posting. `?dryRun=1` counts without posting and ignores the flag. Needs `SLACK_BOT_TOKEN` + `SLACK_JOURNEY_CHANNEL_ID`; only the messages that bot posted can be edited in place, which is why the rest are re-posted.                                                      |
| `SURVEY_CLOSE_PASSWORD`                    | For admin    | Password required to close/pause the survey (server-only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `CONTACT_TO_EMAIL`                         | For contact  | Contact form recipient                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `NEXT_PUBLIC_GTM_ID`                       | No           | GTM container ID (optional, falls back to direct gtag.js)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GA4_API_SECRET`                           | No           | GA4 Measurement Protocol API secret (server-only). Enables server-side `purchase` tracking from the Stripe webhook so GA4's purchase count matches real payments (the client-side event is lossy — ad blockers, closed tabs, consent). Create in GA4 Admin → Data Streams → Measurement Protocol API secrets. Sent with the SAME `transaction_id` (Stripe session id) as the client event, so GA4 dedupes to one purchase. Consent-gated via the flag captured at checkout. When unset, server-side purchase tracking is skipped (no error).                                                                                                                                                                                                            |
| `GA4_MEASUREMENT_ID`                       | No           | Optional override for the GA4 web-stream ID used by server-side Measurement Protocol sends. Defaults to the ID hardcoded in `app/layout.tsx` (`G-QTYY69L46N`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `LOG_LEVEL`                                | No           | Pino log level (fatal/error/warn/info/debug/trace; default: info)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`       | For checkout | Browser-safe Stripe publishable key (`pk_test_...` sandbox or `pk_live_...` prod)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `STRIPE_SECRET_KEY`                        | For checkout | Server-only Stripe secret (`sk_test_...` sandbox or `sk_live_...` prod)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `STRIPE_WEBHOOK_SECRET`                    | For checkout | Webhook signing secret (`whsec_...`) per Stripe dashboard endpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `STRIPE_COUPON_50`                         | For nurture  | Stripe Coupon ID for 50%-off (e.g. `nurture_50`). Used by `/api/cron/nurture-sequence` to mint per-user 24h promotion codes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `STRIPE_COUPON_75`                         | For nurture  | Stripe Coupon ID for 75%-off (e.g. `nurture_75`). Same purpose, last-chance reminder                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `STRIPE_COUPON_100`                        | For calls    | Stripe Coupon ID for 100%-off (e.g. `nurture_100`). Used by the admin "grant post-call 100% coupon" action to mint a one-time code that unlocks the full report free after a 20-minute call. Redeemed via normal `?promo=` checkout → $0 session → existing fulfillment. Grant action returns 503 when unset.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `CALENDLY_WEBHOOK_SECRET`                  | For calls    | Signing key from the Calendly v2 webhook subscription. Used by `/api/calendly/webhook` to verify `invitee.created` / `invitee.canceled` and record `booking_event` rows. Webhook returns 503 (safe no-op) when unset — set only after creating the subscription pointing at `/api/calendly/webhook`.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `STRIPE_CHECKOUT_ENABLED`                  | For checkout | `true` to create real Stripe sessions; default `false`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `NEXT_PUBLIC_STRIPE_CHECKOUT_PREVIEW_MODE` | No           | `false` for normal flow; `true` adds a "preview" banner only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `KV_REST_API_URL`                          | For prod     | Upstash Redis REST URL — backs the rate limiter; falls back to in-memory if unset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `KV_REST_API_TOKEN`                        | For prod     | Upstash Redis REST token — paired with `KV_REST_API_URL`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `CRON_SECRET`                              | For crons    | Bearer token for `/api/cron/*` endpoints; required when those crons are deployed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `NURTURE_TIME_BUDGET_MS`                   | No           | Wall-clock budget (ms) for the `nurture-sequence` cron loop. It stops starting new candidates past this and defers the rest to the next hourly run, keeping the function under its 60s `maxDuration`. Default `42000`. Tuning knob only — raise only alongside `maxDuration` in `vercel.json` + the route export. **Do not set `0` to pause** (it silently defers all sends); pause via the `nurture_sequence` kill switch.                                                                                                                                                                                                                                                                                                                             |
| `PURGE_OLD_DATA_ENABLED`                   | No           | Safety flag for the destructive retention purge (`/api/cron/purge-old-data`). **Postponed** — leave unset (disabled). Route no-ops unless exactly `true` AND the cron is re-added to `vercel.json`. See "Postponed / TODO" below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `NURTURE_78H_CALL_ENABLED`                 | No           | Gates the 78h nurture stage (the 20-minute call invite → Calendly + its `call_invite_sent` booking_event). **Paused by default** (unset/not `true`) — there is no product person to take the calls. The other four nurture stages always run regardless. Set to `true` to resume the call invite once someone can take the calls — **also requires `NURTURE_78H_CALENDLY_URL` to be set**, else the stage stays paused (env flip only, no deploy).                                                                                                                                                                                                                                                                                                      |
| `NURTURE_78H_CALENDLY_URL`                 | No           | Operator Calendly booking link for the 78h call invite (whoever takes the 20-minute calls). Read at send time so it can be flipped without a redeploy. The 78h stage stays **paused unless this is set in addition to** `NURTURE_78H_CALL_ENABLED=true`, so a dead/empty booking link is never sent. e.g. `https://calendly.com/<handle>/20min`. (Previously a hardcoded personal link; moved to env when that teammate was offboarded.)                                                                                                                                                                                                                                                                                                                |
| `UNSUBSCRIBE_SECRET`                       | For email    | 32-byte hex string used to sign HMAC-SHA256 unsubscribe tokens (generate with `crypto.randomBytes(32).toString('hex')`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `RESEND_WEBHOOK_SECRET`                    | For email    | Svix webhook signing secret (`whsec_...`) from Resend dashboard; used by `/api/resend/webhook`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `SHARE_VERIFY_SECRET`                      | For sharing  | ≥16-char HMAC secret for stateless share-recipient cookies (1-yr lifetime); falls back to `SUPABASE_SERVICE_ROLE_KEY` when unset                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `STRATEGY_DIGEST_SIGNING_SECRET`           | For digest   | ≥16-char HMAC secret that signs the PNG-chart URLs embedded in the funnel-digest Slack messages. Slack's image proxy is anonymous so authenticity proof must travel in the URL. Falls back to `SHARE_VERIFY_SECRET` → `SUPABASE_SERVICE_ROLE_KEY` when unset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID`  | No           | Trustpilot Business Unit ID. When set (and after the visitor grants the `cookieyes-functional` category) the live Trustpilot review widget loads in the landing reviews section + report pricing modals; unset shows only the cookieless static rating block (no third-party cookies).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `NEXT_PUBLIC_TRUSTPILOT_DOMAIN`            | No           | Review domain (e.g. `loveiq.org`) used for the public Trustpilot profile link. Optional companions: `NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID_CAROUSEL` / `NEXT_PUBLIC_TRUSTPILOT_TEMPLATE_ID_MICRO` (TrustBox template overrides) and `NEXT_PUBLIC_TRUSTPILOT_SCORE` / `NEXT_PUBLIC_TRUSTPILOT_REVIEW_COUNT` (static-block numbers, shown only when both are set — never fabricated).                                                                                                                                                                                                                                                                                                                                                                        |
| `ADMIN_TEST_EMAIL_REGEX`                   | No           | Override the staff-email regex used to flag test submissions (default `^.+@loveiq\.org$`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `STRIPE_LIVE_MODE`                         | No           | T-01 livemode-guard **override** (optional). By default the guard derives the expected mode from `STRIPE_SECRET_KEY` (`sk_live_` ⇒ live, else test), so it is self-configuring and does not need setting. Set to `true`/`false` only to force a mode that differs from the key. Webhook events whose `event.livemode` mismatches the expected mode are refused (Slack ops alert) so cross-mode events never fulfill against prod data. (History: when this was a required env, leaving it unset on a live-mode prod refused 100% of real webhooks — now auto-derived.)                                                                                                                                                                                  |
| `GOOGLE_SERVICE_ACCOUNT_KEY`               | For brain    | Service-account JSON (or base64 of it) for `ga4-reader@loveiq-brain`. **Preferred over the `GOOGLE_OAUTH_*` refresh token**, which a Google Workspace reauth policy invalidates every few weeks (`invalid_grant / invalid_rapt`) and which then freezes GA4 + Search Console until someone clicks a browser prompt. A service account has no user session and never reauths. Scopes are requested per-token, so it stays read-only. Falls back to the refresh token when unset.                                                                                                                                                                                                                                                                         |
| `CLARITY_API_TOKEN`                        | No           | Microsoft Clarity Data Export token. Lets the brain read session-recording and heatmap metrics (dead clicks, rage clicks, JS errors) through `/api/mcp` → `query_external_service`. Clarity is already live on the site via `public/clarity-init.js`; this only adds READ access for the brain. Its export API covers the last 1–3 days, so it is current state rather than history.                                                                                                                                                                                                                                                                                                                                                                    |
| `GOOGLE_WORKLOAD_IDENTITY_AUDIENCE`        | No           | Workload Identity Pool provider path, enabling **keyless** Google auth on Vercel. Vercel signs an OIDC token per deployment (`VERCEL_OIDC_TOKEN`); Google trades it for its own token, which then impersonates `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT`. **Nothing is stored, so nothing expires** — the only option that survives the Workspace reauth policy and the ban on downloadable keys. The pool is restricted to the single subject `owner:loveiq:project:loveiq-web:environment:production`, so previews and other projects cannot use it. Production only.                                                                                                                                                                                      |
| `GOOGLE_IMPERSONATE_SERVICE_ACCOUNT`       | No           | Service account to impersonate for Google reads. When set, `GOOGLE_OAUTH_*` needs only the **non-sensitive** `cloud-platform` scope — it is exchanged for a service-account token carrying analytics/webmasters/drive read scopes via `iamcredentials.generateAccessToken`. This is the durable path: a downloadable service-account key is blocked by `constraints/iam.disableServiceAccountKeyCreation`, and a refresh token minted with the sensitive scopes keeps dying to a Workspace reauth policy. Needs `roles/iam.serviceAccountTokenCreator` on the target.                                                                                                                                                                                   |
| `POSTHOG_API_KEY`                          | No           | PostHog Personal API Key. Enables the brain's read-only PostHog queries through `/api/mcp` → `query_external_service`. Unset means those queries answer "not configured" instead of implying there is no data.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `GITHUB_TOKEN`                             | No           | Optional. The repo is public, so the brain reads issues, PRs and CI runs without it; a token only raises the GitHub rate limit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `SUPABASE_TEST_URL`                        | No           | Integration tests only (`npm run test:integration`). Point at a Supabase branch with the full migration set applied. Leave unset to skip integration tests silently.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `SUPABASE_TEST_SERVICE_ROLE_KEY`           | No           | Integration tests only. Service-role key for `SUPABASE_TEST_URL`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `SUPABASE_TEST_ANON_KEY`                   | No           | Integration tests only. Anon key for `SUPABASE_TEST_URL`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `BRAIN_LLM_KEY`                            | For brain    | API key for the company-brain answer model. **The default provider is Google Gemini's free tier**, and Google MAY use free-tier prompts to improve its models — those prompts carry our docs, commits, Jira and business numbers, so treat that as a known trade-off, not a non-issue. Groq's free tier does not train on prompts and is a drop-in swap via `BRAIN_LLM_BASE_URL` + `BRAIN_LLM_MODEL` (chosen against here only because Groq's console was unreachable at setup). Unset ⇒ the brain replies that it has no model configured, and nothing else breaks.                                                                                                                                                                                    |
| `BRAIN_LLM_BASE_URL`                       | No           | OpenAI-compatible base URL for the brain (default `https://generativelanguage.googleapis.com/v1beta/openai/`, i.e. Gemini). The whole point of writing against that shape: Gemini, Groq (`https://api.groq.com/openai/v1`), OpenAI or a local Ollama swap with this one value and no code change.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `BRAIN_LLM_MODEL`                          | No           | Brain model id (default `gemini-3.6-flash`). **`gemini-2.5-flash` is retired for new API keys** and answers 404 "no longer available to new users", so anything copied from an older guide fails. Groq's `groq/compound` is the drop-in alternative and does not train on the prompts it receives.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `BRAIN_LLM_REASONING_EFFORT`               | No           | Reasoning budget, sent only when set. Gemini 3.x thinks before answering and those tokens come out of the completion budget first: measured, `low` took a real question from 13.7s to 1.7s for the same answer, and too small a budget returns an EMPTY reply with finish reason "length" rather than an error. Leave unset for providers that reject unknown parameters.                                                                                                                                                                                                                                                                                                                                                                               |
| `SLACK_BRAIN_BOT_TOKEN`                    | For brain    | Bot token for the brain's **own** Slack app — deliberately separate from `SLACK_BOT_TOKEN`, which drives the live journey messages; adding event subscriptions and `im:*` scopes to that app would force a reinstall and risk breaking a working integration. Scopes: `app_mentions:read`, `chat:write`, `im:history`, `im:read`, `im:write`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `SLACK_BRAIN_SIGNING_SECRET`               | For brain    | Signing secret for the brain's Slack app, used by `/api/slack/events` to verify Slack's `v0` request signature. Route returns 503 while unset, so it is safe to deploy before the app exists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `SLACK_BRAIN_TEAM_ID`                      | For brain    | Slack workspace id (`T0...`) the brain will answer. A valid Slack signature proves a request came from Slack, not that it came from **our** Slack, and the corpus is deliberately undifferentiated — revenue, ad spend, cost per paying customer, every internal doc — so there is no per-source restriction to fall back on if the app is ever installed elsewhere. **Unset means the check is off**, which is the state a first deploy ships in unless this is set deliberately.                                                                                                                                                                                                                                                                      |
| `LOVEIQ_MCP_TOKEN`                         | For MCP      | Bearer token for `/api/mcp`, which exposes the company-brain corpus to Claude itself — claude.ai connectors, Claude Desktop, and the Code CLI via the committed `.mcp.json`. This is the layer Marcus and Mark asked for: Claude reasoning over the corpus rather than a second chat product. One shared token, so treat it as read access to everything indexed. Unset ⇒ 503, safe to deploy first. **Point the connector at `https://www.loveiq.org/api/mcp`** — the apex-to-www redirect drops the `Authorization` header and presents as a confusing 401.                                                                                                                                                                                           |
| `NOTION_TOKEN`                             | For brain    | Notion internal-integration secret (`ntn_…`) for the nightly ingest. **Replaces Jira** — decision 2026-08-28, the team runs its board in Notion. Must belong to the **LoveIQ** workspace: the account first connected to Claude here was an `@aqvc.com` one whose teamspaces were AQVC Labs, Navigate Ventures and Asset Management, i.e. another company's material with no LoveIQ content. An integration sees nothing until pages are shared with it in Notion (page → ⋯ → Connections), and that sharing is the real access boundary. Unset ⇒ the source is skipped silently, by design.                                                                                                                                                            |
| `NOTION_TEAMSPACE_ID`                      | No           | Advisory, logged only. Notion's search API has no teamspace filter, so scope is decided by which pages the integration was shared with.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `NOTION_EXCLUDE_TITLES`                    | No           | Comma-separated, case-insensitive substrings of Notion page titles to keep OUT of the corpus. **Ships empty, and that is the decision — see "Who can see what" below.** The mechanism exists only if the open-access policy ever changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `JIRA_BASE_URL`                            | For brain    | Jira Cloud site for the nightly ingest, e.g. `https://loveiq.atlassian.net`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `JIRA_EMAIL`                               | For brain    | Atlassian account email, paired with `JIRA_API_TOKEN` for Basic auth against the Jira REST API.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `JIRA_API_TOKEN`                           | For brain    | Atlassian API token ([create one](https://id.atlassian.com/manage-profile/security/api-tokens)). When this, `JIRA_EMAIL` or `JIRA_BASE_URL` is unset, `/api/cron/brain-ingest` still returns `200 {ok:true}` with `results[].skipped = "jira-not-configured"` for that source — the run itself succeeds. Since 2026-08-27 a skipped or zero-row source also raises an ops Slack alert once a day, because otherwise a source that quietly stops is invisible.                                                                                                                                                                                                                                                                                           |
| `GOOGLE_OAUTH_CLIENT_ID`                   | For brain    | Google OAuth client id for the GA4 + Search Console ingest. **No Google Cloud project and no service account**: this comes from `gcloud auth application-default login`, which uses Google's own client. See `.env.example` for the exact command and scopes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GOOGLE_OAUTH_CLIENT_SECRET`               | For brain    | Paired with `GOOGLE_OAUTH_CLIENT_ID`, from the same `application_default_credentials.json`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GOOGLE_OAUTH_REFRESH_TOKEN`               | For brain    | Long-lived refresh token, exchanged for an access token per run. Scopes are fixed at login — a missing one surfaces as a 403 "insufficient authentication scopes" error, which the ingester rewrites into the command that fixes it. **Must come from a custom OAuth client in `loveiq-brain` with an Internal consent screen**; gcloud's shared client is refused the sensitive `analytics.readonly` scope ("This app is blocked"). Any plain `gcloud auth application-default login` on the machine overwrites the credential file and silently drops the extra scopes, so copy the values into `.env.local` rather than reading them from that file.                                                                                                 |
| `GOOGLE_OAUTH_ACCESS_TOKEN`                | No           | **Local runs only.** A ready-made Google access token, which overrides the three `GOOGLE_OAUTH_*` values above. Obtained by impersonating the `ga4-reader@loveiq-brain` service account (`gcloud auth print-access-token --impersonate-service-account=… --scopes=…analytics.readonly`) — the one route that needs no browser consent, because gcloud's shared client is **blocked** from requesting `analytics.readonly`. GA4 only: the service account is a Viewer on the GA4 property but not a user on Search Console. Lasts an hour and needs the gcloud CLI, so it can never be a deployment credential.                                                                                                                                          |
| `GA4_PROPERTY_ID`                          | For brain    | GA4 **numeric** property id (GA4 Admin → Property Settings), not the `G-` measurement id. When Google Ads is linked to the property, ad cost/clicks/impressions arrive through the same report — so no Google Ads API and no developer-token approval is needed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `SEARCH_CONSOLE_SITE`                      | For brain    | Search Console property exactly as listed there — `sc-domain:loveiq.org` for a domain property, `https://www.loveiq.org/` for a URL-prefix one. The only source of the search queries people used to find us.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

**The site renders without env vars.** Forms will fail gracefully with error messages.

### Stripe checkout

The paywall on `/report` is always enforced — clicking a locked premium section opens the pricing modal. Purchases unlock by tier:

- `essentials` plan → essentials sections only
- `full_report` plan → essentials + full-report sections
- `all_reports` plan → all sections across every archetype

Sandbox and live mode both run the real fulfillment path. To test in sandbox use Stripe test card `4242 4242 4242 4242` (any future date, any CVC). After a successful test purchase, the webhook fulfills the access plan onto the report.

Required Vercel env vars (test or production):

```text
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
- See `docs/architecture/TESTING.md` for full E2E reference

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
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

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

The landing page is the white design under `features/landing/ui/white/`, currently
in a 50/50 A/B against the white landing that preceded the 2026-08-10 rebuild
(`features/landing/ui/white-v1/`). `proxy.ts` assigns the arm and `app/page.tsx`
renders it; see `shared/experiments/landingVariant.ts`. Force an arm with
`/?variant=white` or `/?variant=white_prev`.

A new section normally belongs to the CURRENT arm only — `white-v1/` is a frozen
snapshot and should not gain features.

1. Create `features/landing/ui/white/WNewSection.tsx`
2. Follow existing section patterns (see `white/WArchetypes.tsx` / `white/WReportPreview.tsx`)
3. Import and add to `features/landing/ui/white/LandingPageWhite.tsx` in order
4. Use `animate-on-scroll` class for scroll animations

#### Add a New Page

1. Create `app/{page-name}/page.tsx`
2. Create `features/{feature}/ui/{PageName}Page.tsx` for content
3. Add to navigation if needed (`NavSection.tsx`, `FooterSection.tsx`)
4. Add to `app/sitemap.ts` for SEO

#### Add a New API Endpoint

1. Create `app/api/{name}/route.ts`
2. Include CSRF verification (`verifyCsrfToken`)
3. Include rate limiting (`checkRateLimit`)
4. Add Zod schema for input validation
5. Use generic error messages
6. Log errors with `logger` from `@shared/observability/logger`

#### Add a New Environment Variable

1. Add to `.env.example` with description
2. Document in this file's Environment Variables section
3. If client-side, prefix with `NEXT_PUBLIC_`
4. Update `docs/runbooks/SECURITY.md` if it's a secret

#### Modify CSP / Add Third-Party Script

1. Edit `proxy.ts` CSP directives
2. Add domain to appropriate directive (`script-src`, `connect-src`, `img-src`, etc.)
3. Test in both dev and production build
4. Document in `docs/runbooks/SECURITY.md`

---

## Security Guidelines

### Secrets

- **Never commit secrets** - Use `.env.local` (gitignored)
- **Never expose service keys** - `SUPABASE_SERVICE_ROLE_KEY` is server-only
- **Use placeholders in code** - Document where to get real values

### Input Handling

- All API inputs validated with Zod
- Email addresses normalized (lowercase, trimmed)
- HTML escaped in email templates (`features/invite/emails/invite.ts`)
- Header injection prevented in contact form

### Rate Limiting

- IP-based rate limiting on all form endpoints
- Persisted in Supabase (survives deployments)
- Email-based cooldown on survey submissions

### CSRF Protection

- Double-submit cookie pattern
- Cookie set by middleware (`proxy.ts`)
- Verified in API routes (`shared/http/csrf.ts`)

See `docs/runbooks/SECURITY.md` for rotation schedules and incident response.

---

## Agent Operating Rules

When working in this codebase:

1. **Search before creating** - Check if a similar component/pattern exists
2. **Match existing patterns** - Follow conventions in `features/landing/ui/` for sections
3. **Smallest change principle** - Don't refactor unrelated code
4. **Never commit secrets** - Use placeholders like `your-api-key-here`
5. **Run lint before finishing** - `npm run lint` must pass
6. **Test the build** - `npm run build` must succeed
7. **Preserve security** - Don't weaken CSP, rate limits, or CSRF checks
8. **Keep error messages generic** - Avoid information disclosure
9. **Use existing utilities** - `shared/http/ratelimit.ts`, `shared/http/csrf.ts`, `features/analytics/client.ts`, `shared/observability/logger.ts`, `shared/http/circuit-breaker.ts`, `shared/http/fetch-with-timeout.ts`
10. **Document unknowns** - If uncertain, note assumptions and which files to check
11. **Clean up temporary files** - If you create any `.md` files for planning, implementation logs, fix summaries, or debugging notes (e.g., in `docs/plans/` or repo root), **delete them once the task is complete**. Only permanent documentation (like this file, `docs/runbooks/SECURITY.md`, `docs/runbooks/DEVELOPMENT.md`, `docs/architecture/*`) should remain in the repo.

### When Uncertain

- Check `docs/architecture/` docs for architecture decisions
- Look at similar existing code (e.g., existing API routes, existing sections)
- Ask rather than guess on security-related changes

---

## Commit Message Convention

**Every commit message MUST end with a `For Marcus:` line** — one to three very short, plain-language sentences describing what changed in non-technical terms. Our strategy lead (non-technical) reads every commit in the Slack commit channel, and the raw message is often too much. This line is his summary.

Rules for the `For Marcus:` line:

- Plain English only — no jargon, no file names, no function names, no acronyms (CSP, env, API, etc.).
- Describe the **user-facing or business effect**, not the code change. ("Emails now show the logo" — not "route img src through getEmailImageBaseUrl".)
- One to three short sentences. Write it as if explaining to a smart friend who does not code.
- Place it as the **last line of the commit message.**

**Never include AI / assistant attribution in commit messages** — no `Co-Authored-By: Claude…`, no "generated by AI", no tool credits. The full message posts publicly to the Slack commit channel and must read as the team's own work.

Example:

```text
fix(emails): align image host with sending domain

<normal technical commit body here>

For Marcus: Fixed the LoveIQ logo and photos not showing up in our emails. They will now load properly when people open them.
```

The Slack commit channel posts the full message, so Marcus automatically gets a plain-English summary at the end of every commit.

---

## Who can see what (company brain)

**Everything indexed is readable by everyone.** The brain has no per-user or
per-role filtering, by decision — 2026-08-28, restated as company-wide policy:
LoveIQ runs an open culture where everyone can see everything.

This matters because some sources DO enforce their own permissions and the brain
does not inherit them:

- **Notion** has per-page permissions. A page restricted to a few people in Notion
  becomes readable by anyone who can ask the brain. The workspace holds
  "Performance management", onboarding pages and job posts naming real people.
  Indexed anyway, deliberately.
- **The repo is public**, so docs and commits were already world-readable.
- **Business numbers** — revenue, ad spend, cost per customer — are in the corpus
  and therefore answerable by anyone in the Slack workspace and by anyone whose
  Claude reaches the MCP endpoint.

Two consequences worth keeping in view rather than rediscovering:

1. `SLACK_BRAIN_TEAM_ID` is the only thing stopping another Slack workspace's
   install from reading all of it, and `LOVEIQ_MCP_TOKEN` is one shared token, so
   a leak of either is a leak of the whole corpus.
2. **Credentials are not documents.** `upsertChunks` refuses any chunk containing
   a recognisable secret — GitHub, Notion, Google, Slack, Stripe, AWS, JWTs,
   private keys — and logs the title so it can be rotated. Indexing a key is not
   the same as sharing a page: it copies the secret into a searchable table, into
   every LLM prompt that retrieves it, and into a free-tier provider that may
   train on those prompts. One page in Notion ("Github token:") holds nothing but
   a bare opaque string that no safe pattern can distinguish from a hash, so it is
   excluded by title in `notion.ts` and **that token should be rotated**.
3. **Customer data is the line that does NOT move.** `brain_chunk` must never
   index user-level rows — survey answers, individual reports, email addresses.
   Open access among the team is a choice; making customers' private results
   searchable is not the same choice, and the ROPA entry for the language-model
   vendor depends on it staying true.

## Postponed / TODO (deliberately deferred work)

- **Turn on Trustpilot reviews on the site** (`NEXT_PUBLIC_TRUSTPILOT_ENABLED`).
  The Trustpilot integration (`shared/ui/trustpilot/`) is fully built and wired
  into the dark landing (`S15Testimonials`) and both report pricing modals, but
  is **OFF by default** (decision 2026-06-13: hold until enough customers have
  left a review on Trustpilot, so the widget isn't sparse/empty). The master
  switch `isTrustpilotEnabled()` in `shared/ui/trustpilot/config.ts` hides ALL
  on-site Trustpilot UI + the bootstrap script while off. **To turn on when
  ready:** set `NEXT_PUBLIC_TRUSTPILOT_ENABLED=true` (and
  `NEXT_PUBLIC_TRUSTPILOT_BUSINESS_UNIT_ID`) in the Vercel env — no code change.
  Notes: (1) the **dark / control** landing (`S15Testimonials`) falls back to its
  ORIGINAL curated testimonial grid + "30,000+" stat when off ("how it used to
  be" — the landing A/B control arm), and swaps to Trustpilot only when the flag
  is on. (2) the **white** landing variant deliberately shows a curated
  "Field reports" section (`white/WTestimonials.tsx`, the former on-site
  testimonials, pixel-matched to Figma 7828:9430) instead of Trustpilot, and
  stays that way even after the flag flips — it's the A/B counterpart to the dark
  arm. (3) the report **pricing modals** (`ScrollPricingModal`,
  `ReportPricingModal`) currently render NO social-proof block when off — the old
  `PricingTestimonialsCarousel` was deleted by the Trustpilot commit; restore it
  there or accept the gap before merging staging→main. (4) the nurture **emails**
  still reference Trustpilot copy; the flag does not touch emails (they're not
  "the website" and staging crons are short-circuited) — revisit separately.

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
  `funnel_event`, `booking_event` + `calendly_webhook_event` (the latter two hold
  Calendly invitee email/name in `raw` — privacy angle). Decide windows when
  enabling the purge above.

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

Check import paths. This repo uses `@/` (project root), `@shared/*` (→ `shared/`), and `@features/*` (→ `features/`) aliases. Use `@shared/...`, `@features/...`, `@/app/...` for cross-directory imports. Same-directory imports still use `./`.

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

| Need to...               | Look at...                                                                |
| ------------------------ | ------------------------------------------------------------------------- |
| Find any file by task    | `FILE_INDEX.md`                                                           |
| Add landing section      | `features/landing/ui/white/LandingPageWhite.tsx`, existing `white/W*.tsx` |
| Modify navigation        | `features/landing/ui/white/WNavSection.tsx`                               |
| Modify footer            | `features/landing/ui/FooterSection.tsx`                                   |
| Add API endpoint         | `app/api/contact/route.ts` (reference)                                    |
| Change email template    | `features/invite/emails/invite.ts`                                        |
| Add analytics event      | `features/analytics/client.ts`                                            |
| Modify design tokens     | `app/globals.css` (CSS vars), `tailwind.config.js`                        |
| Update security headers  | `proxy.ts`                                                                |
| Understand architecture  | `docs/architecture/ARCHITECTURE.md`                                       |
| Check coding conventions | `docs/architecture/CONVENTIONS.md`                                        |
