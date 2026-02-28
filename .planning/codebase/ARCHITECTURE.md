# Architecture

**Analysis Date:** 2025-01-14

## Pattern Overview

**Overall:** Static Marketing Site with API Routes

**Key Characteristics:**

- Next.js App Router architecture
- Server-side rendering for pages
- Client components for interactivity
- API routes for form handling (waitlist, contact)
- No persistent user sessions or authentication

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
- Subdirectories: `landing/`, `about/`
- Depends on: Theme utilities, Tailwind CSS
- Used by: Pages

**API Layer:**

- Purpose: Server-side form processing
- Contains: Route handlers for POST requests
- Location: `app/api/` directory
- Depends on: External services (Supabase, Resend, Slack)
- Used by: Client-side form submissions

**Library Layer:**

- Purpose: Shared utilities and helpers
- Contains: Analytics tracking, email templates
- Location: `lib/` directory
- Depends on: External APIs (Google Analytics)
- Used by: Components, API routes

**Theme Layer:**

- Purpose: Design system tokens and utilities
- Contains: Gradient definitions, radius, effects
- Location: `components/theme.ts`, `app/globals.css`
- Depends on: CSS custom properties
- Used by: All components

## Data Flow

**Landing Page Load:**

1. User navigates to `/`
2. Next.js renders `app/page.tsx` (Server Component)
3. `LandingPage` component composes all sections
4. Client components hydrate for interactivity
5. Google Analytics tracks page view

**Waitlist Signup Flow:**

1. User submits email via modal/form
2. Client-side validation (basic)
3. POST to `/api/waitlist`
4. Server validates with Zod schema
5. Rate limiting check (IP-based)
6. Honeypot check (bot detection)
7. Check Supabase for existing email
8. Insert new signup to Supabase
9. Send confirmation email via Resend
10. Notify Slack webhook
11. Return success response
12. Client shows success state

**Contact Form Flow:**

1. User fills contact form on About page
2. reCAPTCHA verification on client
3. POST to `/api/contact` with captcha token
4. Server validates with Zod schema
5. Rate limiting check
6. Server-side reCAPTCHA verification
7. Send email via Resend to team
8. Notify Slack webhook
9. Return success response

**State Management:**

- Stateless - No persistent client state
- Form state managed locally in components
- No global state management (Redux, Context)
- Server state: Database (Supabase) for waitlist only

## Key Abstractions

**Section Components:**

- Purpose: Self-contained page sections
- Examples: `HeroSection`, `FooterSection`, `Section05-12`
- Pattern: Functional components with Tailwind styling
- Location: `components/landing/*.tsx`, `components/about/*.tsx`

**API Route Handlers:**

- Purpose: Server-side form processing
- Examples: `app/api/waitlist/route.ts`, `app/api/contact/route.ts`
- Pattern: Next.js Route Handlers with POST method
- Features: Rate limiting, validation, honeypot

**Theme Constants:**

- Purpose: Centralized design tokens
- Examples: `gradients`, `radii`, `effects`, `pills`
- Pattern: Exported objects with Tailwind class strings
- Location: `components/theme.ts`

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

**API Routes:**

- `/api/waitlist` - `app/api/waitlist/route.ts`
- `/api/contact` - `app/api/contact/route.ts`

**SEO Routes:**

- `/robots.txt` - `app/robots.ts`
- `/sitemap.xml` - `app/sitemap.ts`

## Error Handling

**Strategy:** Try/catch in API routes, graceful degradation in UI

**Patterns:**

- API routes return JSON with `error` field on failure
- Rate limiting returns 429 status
- Validation errors return 400 status
- External service errors return 500 status
- Console logging for debugging (no structured error tracking)

## Cross-Cutting Concerns

**Logging:**

- Console.log/warn/error for debugging
- No structured logging or log aggregation
- Slack notifications for important events

**Validation:**

- Zod schemas at API boundary (`app/api/*/route.ts`)
- No client-side validation library

**Security:**

- Rate limiting (IP-based, in-memory)
- Honeypot fields for bot detection
- reCAPTCHA for contact form
- Strict CSP headers in `next.config.js`
- Input sanitization via Zod

**SEO:**

- Structured data (Organization, Website, FAQ schemas)
- Open Graph and Twitter meta tags
- Sitemap and robots.txt generation

---

_Architecture analysis: 2025-01-14_
_Update when major patterns change_
