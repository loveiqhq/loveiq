# Technology Stack

> **Last verified:** 2026-03-27 | **Verified against:** package.json dependencies and devDependencies

**Analysis Date:** 2026-02-25

## Languages

**Primary:**

- TypeScript 5.3 - All application code (`tsconfig.json`)

**Secondary:**

- JavaScript - Configuration files (`next.config.js`, `tailwind.config.js`, `postcss.config.js`)

## Runtime

**Environment:**

- Node.js (no version pinned, typical Next.js 16 compatibility)
- Browser runtime (React client components)

**Package Manager:**

- npm (no version pinned)
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**

- Next.js ^16.1.6 - Full-stack React framework with App Router (`package.json`)
- React ^19.2.4 - UI component library (`package.json`)
- React DOM ^19.2.4 - React rendering for web (`package.json`)

**Testing:**

- Vitest ^4.0.18 - Unit/integration test runner (`package.json`, `__tests__/`)
- Playwright ^1.58.2 - E2E browser testing (`package.json`, `e2e/`)
- @axe-core/playwright ^4.11.1 - Accessibility audits in E2E (`package.json`)
- @testing-library/react ^16.3.2 - React component testing utilities

**Build/Dev:**

- TypeScript ^5.3.3 - Type checking and compilation (`package.json`)
- PostCSS ^8.4.31 - CSS processing (`postcss.config.js`)
- Autoprefixer ^10.4.24 - CSS vendor prefixes (`package.json`)
- Tailwind CSS ^3.4.19 - Utility-first CSS framework (`tailwind.config.js`)
- ESLint ^9.39.2 - Code linting (`package.json`)
- Prettier ^3.8.1 - Code formatting
- Husky ^9.1.7 - Git hooks (pre-push runs unit tests)

## Key Dependencies

**Critical:**

- Resend ^6.9.2 - Transactional email service (`package.json`, `app/api/contact/route.ts`, `app/api/invite/route.ts`)
- Zod ^4.3.6 - Schema validation (`package.json`, `app/api/contact/route.ts`, `app/api/survey/route.ts`)
- @supabase/supabase-js ^2.99.1 - Supabase client (database + auth) (`package.json`, `lib/admin/`)
- @supabase/ssr ^0.9.0 - Supabase server-side auth helpers for Next.js (`package.json`, `lib/admin/`)
- Lenis ^1.3.17 - Smooth scroll library (`components/SmoothScroll.tsx`)

**Observability:**

- @vercel/otel ^2.1.1 - OpenTelemetry for Vercel
- pino ^10.3.1 - Structured logging

**Infrastructure:**

- next/font/google - Font optimization (`app/layout.tsx`) - Manrope (sans), Lora (serif)
- next/script - Script loading optimization (`app/layout.tsx`)

**Dev Only:**

- @types/node ^25.3.0 - Node.js type definitions
- @types/react ^19.2.14 - React type definitions
- @types/react-dom ^19.2.3 - React DOM type definitions
- eslint-config-next ^16.1.6 - Next.js ESLint rules
- eslint-plugin-no-secrets ^2.2.2 - Secret detection in code
- eslint-plugin-security ^4.0.0 - Security anti-pattern linting
- @next/bundle-analyzer ^16.1.6 - Bundle size visualization (`npm run analyze`)
- csv-parse ^6.1.0 - CSV parsing (used by `scripts/update-glossary.js`)

## Configuration

**Environment:**

- `.env.local` for environment variables (gitignored)
- Required vars documented in `SECURITY.md`:
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` - Database
  - `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO` - Email
  - `RECAPTCHA_SECRET_KEY` - Spam protection
  - `SLACK_WAITLIST_WEBHOOK_URL`, `SLACK_CONTACT_WEBHOOK_URL`, `SLACK_SURVEY_WEBHOOK_URL` - Notifications
  - `STAGING_PASSWORD` - Staging environment auth
  - `CONTACT_TO_EMAIL` - Contact form recipient
  - Note: Admin panel auth uses Supabase Auth (magic links), not an env var password
  - `SURVEY_CLOSE_PASSWORD` - Survey pause/close protection
  - `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` - Public client-side vars
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Admin panel auth (browser-safe)
  - `NEXT_PUBLIC_GTM_ID` - Google Tag Manager (optional)
  - `LOG_LEVEL` - Pino log level (optional, default: info)

**Build:**

- `tsconfig.json` - TypeScript compiler options (strict mode enabled)
- `next.config.js` - Next.js configuration
- `tailwind.config.js` - Tailwind with custom design tokens
- `postcss.config.js` - PostCSS with Tailwind and Autoprefixer
- `eslint.config.mjs` - Flat ESLint config (ESLint 9+)
- `proxy.ts` - Next.js middleware: CSP headers, CSRF cookies, security logging

## Platform Requirements

**Development:**

- Any platform with Node.js
- No containerization required

**Production:**

- Vercel-ready (Next.js optimized)
- Strict CSP headers configured in `proxy.ts`
- HSTS, X-Frame-Options, and other security headers enabled

---

_Stack analysis: 2026-02-25_
_Last updated: 2026-03-27_
_Update after major dependency changes_
