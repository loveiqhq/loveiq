# Architecture

> **Last verified:** 2026-03-15 | **Verified against:** app/, lib/, components/ directory structure, package.json dependencies, admin auth flow

**Analysis Date:** 2025-01-14

## Pattern Overview

**Overall:** Static Marketing Site with API Routes

**Key Characteristics:**

- Next.js 16 App Router architecture
- Server-side rendering for pages
- Client components for interactivity
- API routes for form handling (waitlist, contact, survey) and staging auth
- No end-user authentication; admin panel uses Supabase Auth magic links with `admin_users` email allowlist
- CSRF protection via double-submit cookie pattern
- Supabase-backed rate limiting on all form endpoints

## Layers

**Pages Layer (App Router):**

- Purpose: Define routes and page-level layouts
- Contains: Page components that compose UI sections
- Location: `app/` directory
- Depends on: Component layer
- Used by: Next.js routing

**Component Layer:**

- Purpose: Reusable UI components organized by page
- Contains: React components (Server + Client)
- Location: `components/` directory
- Subdirectories: `landing/`, `about/`, `glossary/`, `legal/`, `survey/`, `trust-zone/`, `staging/`, `not-found/`, `waitlist/`, `admin/`
- Depends on: CSS custom properties (globals.css), Tailwind CSS
- Used by: Pages

**API Layer:**

- Purpose: Server-side form processing and utilities
- Contains: Route handlers for POST/GET requests
- Location: `app/api/` directory
- Depends on: External services (Supabase, Resend, Slack), lib utilities
- Used by: Client-side form submissions

**Library Layer:**

- Purpose: Shared utilities and helpers
- Contains: Analytics, CSRF, rate limiting, circuit breaker, logging, email templates, admin auth/roles
- Location: `lib/` directory
- Key files: `analytics.ts`, `csrf.ts`, `ratelimit.ts`, `circuit-breaker.ts`, `logger.ts`, `fetch-with-timeout.ts`
- Subdirectories: `admin/` (auth, roles, audit, Supabase client helpers), `emails/`
- Depends on: External APIs, Supabase
- Used by: Components, API routes, middleware

**Middleware Layer:**

- Purpose: Security headers, CSRF cookie management, request logging
- Contains: CSP directives, CSRF token generation, security logging
- Location: `proxy.ts`
- Used by: All requests

## Data Flow

**Landing Page Load:**

1. User navigates to `/`
2. Next.js renders `app/page.tsx` (Server Component)
3. `LandingPage` component composes all sections (S01Hero through S14CTA)
4. Client components hydrate for interactivity
5. Smooth scroll initialized (Lenis)
6. Google Analytics tracks page view

**Waitlist Signup Flow:**

1. User submits email via modal/form
2. Client-side validation (basic)
3. POST to `/api/waitlist`
4. CSRF token verification (`lib/csrf.ts`)
5. Rate limiting check (IP-based, Supabase-backed)
6. Server validates with Zod schema
7. Honeypot check (bot detection)
8. Check Supabase for existing email
9. Insert new signup to Supabase
10. Send confirmation email via Resend
11. Notify Slack webhook
12. Return success response
13. Client shows success state

**Contact Form Flow:**

1. User fills contact form on About page
2. reCAPTCHA verification on client
3. POST to `/api/contact` with captcha token
4. CSRF token verification
5. Rate limiting check (Supabase-backed)
6. Server validates with Zod schema
7. Server-side reCAPTCHA verification
8. Send email via Resend to team
9. Notify Slack webhook
10. Return success response

**Survey Submission Flow:**

1. User completes survey on `/survey`
2. POST to `/api/survey`
3. CSRF token verification
4. Rate limiting check (IP-based, Supabase-backed)
5. Server validates with Zod schema
6. Honeypot check (bot detection)
7. Email cooldown check (5 min per email)
8. Submit via Supabase RPC (`submit_survey`)
9. Notify Slack webhook (after response)
10. Return success response

**State Management:**

- Stateless - No persistent client state
- Form state managed locally in components
- No global state management (Redux, Context)
- Server state: Database (Supabase) for waitlist and rate limiting

## Key Abstractions

**Section Components:**

- Purpose: Self-contained page sections
- Examples: `S01Hero`, `S06Archetypes`, `S13FAQ`, `S14CTA`
- Pattern: Functional components with Tailwind styling
- Location: `components/landing/*.tsx`, `components/about/*.tsx`

**API Route Handlers:**

- Purpose: Server-side form processing
- Examples: `app/api/waitlist/route.ts`, `app/api/contact/route.ts`, `app/api/survey/route.ts`
- Pattern: Next.js Route Handlers with CSRF + rate limiting + Zod validation
- Features: CSRF protection, Supabase-backed rate limiting, validation, honeypot

**Analytics Helpers:**

- Purpose: Typed event tracking
- Examples: `track()`, `trackStartSurvey()`, `trackWaitlistSignup()`
- Pattern: Wrapper functions around gtag
- Location: `lib/analytics.ts`

## Entry Points

**Main Entry:**

- Location: `app/layout.tsx`
- Triggers: All page navigations
- Responsibilities: Root layout, fonts, metadata, scripts, analytics

**Page Routes:**

- `/` - `app/page.tsx` → `LandingPage`
- `/about` - `app/about/page.tsx` → `AboutPage`
- `/waitlist` - `app/waitlist/page.tsx`
- `/survey` - `app/survey/page.tsx` → `SurveyPage`
- `/glossary` - `app/glossary/page.tsx` → Glossary index
- `/glossary/[slug]` - `app/glossary/[slug]/page.tsx` → Glossary term
- `/trust-zone` - `app/trust-zone/page.tsx`
- `/login` - `app/login/page.tsx` → Staging login
- `/admin` - `app/admin/page.tsx` → Admin dashboard (Supabase Auth protected)
- `/admin/login` - `app/admin/login/page.tsx` → Admin magic link login
- `/admin/submissions` - `app/admin/submissions/page.tsx` → Submission browser
- `/admin/submissions/[id]` - `app/admin/submissions/[id]/page.tsx` → Submission detail
- `/admin/survey-status` - `app/admin/survey-status/page.tsx` → Survey toggle
- `/privacy-policy`, `/terms-of-use`, `/terms-and-conditions`, `/medical-disclaimer`, `/digital-content-terms`, `/cookies`, `/imprint` - Legal pages

**API Routes:**

- `/api/waitlist` - `app/api/waitlist/route.ts`
- `/api/contact` - `app/api/contact/route.ts`
- `/api/survey` - `app/api/survey/route.ts`
- `/api/health` - `app/api/health/route.ts`
- `/api/staging-login` - `app/api/staging-login/route.ts` (staging only)
- `/api/staging-logout` - `app/api/staging-logout/route.ts` (staging only)
- `/api/admin/*` - Admin API routes (login, logout, stats, submissions, export, survey-status)
- `/admin/auth/callback` - `app/admin/auth/callback/route.ts` (Supabase Auth magic link callback)

**SEO Routes:**

- `/robots.txt` - `app/robots.ts`
- `/sitemap.xml` - `app/sitemap.ts`

## Error Handling

**Strategy:** Try/catch in API routes, graceful degradation in UI

**Patterns:**

- API routes return JSON with `error` field on failure
- Rate limiting returns 429 status
- CSRF failure returns 403 status
- Validation errors return 400 status
- External service errors return 500 status
- Structured logging via pino (`lib/logger.ts`)

## Cross-Cutting Concerns

**Logging:**

- pino structured logging (`lib/logger.ts`)
- Slack notifications for important events (waitlist signups, contact submissions)
- @vercel/otel for OpenTelemetry integration

**Validation:**

- Zod schemas at API boundary (`app/api/*/route.ts`)
- No client-side validation library

**Security:**

- CSRF protection via double-submit cookie (`lib/csrf.ts`, `proxy.ts`)
- Rate limiting (IP-based, Supabase-backed via `lib/ratelimit.ts`)
- Honeypot fields for bot detection
- reCAPTCHA for contact form
- Strict CSP headers in `proxy.ts`
- Input sanitization via Zod
- Fetch timeout wrapper (`lib/fetch-with-timeout.ts`)
- Circuit breaker pattern (`lib/circuit-breaker.ts`)

**SEO:**

- Structured data (Organization, Website, FAQ schemas)
- Open Graph and Twitter meta tags
- Sitemap and robots.txt generation

---

_Architecture analysis: 2025-01-14_
_Last updated: 2026-03-15_
_Update when major patterns change_
