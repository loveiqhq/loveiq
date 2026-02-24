# Technology Stack

**Analysis Date:** 2025-01-14

## Languages

**Primary:**

- TypeScript 5.3 - All application code (`tsconfig.json`)

**Secondary:**

- JavaScript - Configuration files (`next.config.js`, `tailwind.config.js`, `postcss.config.js`)

## Runtime

**Environment:**

- Node.js (no version pinned, typical Next.js 14 compatibility)
- Browser runtime (React client components)

**Package Manager:**

- npm (no version pinned)
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**

- Next.js 14.2.0 - Full-stack React framework with App Router (`package.json`)
- React 18.2.0 - UI component library (`package.json`)
- React DOM 18.2.0 - React rendering for web (`package.json`)

**Testing:**

- Not detected (no test framework in dependencies)

**Build/Dev:**

- TypeScript 5.3.3 - Type checking and compilation (`package.json`)
- PostCSS 8.4.31 - CSS processing (`postcss.config.js`)
- Autoprefixer 10.4.16 - CSS vendor prefixes (`package.json`)
- Tailwind CSS 3.4.4 - Utility-first CSS framework (`tailwind.config.js`)
- ESLint 8.57.1 - Code linting (`package.json`)

## Key Dependencies

**Critical:**

- Resend 6.6.0 - Transactional email service (`package.json`, `app/api/waitlist/route.ts`, `app/api/contact/route.ts`)
- Zod 4.3.4 - Schema validation (`package.json`, `app/api/waitlist/route.ts`, `app/api/contact/route.ts`)

**Infrastructure:**

- next/font/google - Font optimization (`app/layout.tsx`) - Manrope (sans), Lora (serif)
- next/script - Script loading optimization (`app/layout.tsx`)

**Dev Only:**

- @types/node 20.11.0 - Node.js type definitions
- @types/react 18.2.43 - React type definitions
- @types/react-dom 18.2.17 - React DOM type definitions
- eslint-config-next 14.2.0 - Next.js ESLint rules
- ffmpeg-static 5.3.0 - FFmpeg binary (purpose unclear, possibly unused)

## Configuration

**Environment:**

- `.env.local` for environment variables (gitignored)
- Required vars documented in `SECURITY.md`:
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` - Database
  - `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_REPLY_TO` - Email
  - `RECAPTCHA_SECRET_KEY` - Spam protection
  - `SLACK_WAITLIST_WEBHOOK_URL`, `SLACK_CONTACT_WEBHOOK_URL` - Notifications
  - `NEXT_PUBLIC_SITE_URL` - Public site URL

**Build:**

- `tsconfig.json` - TypeScript compiler options (strict mode enabled)
- `next.config.js` - Next.js configuration with security headers
- `tailwind.config.js` - Tailwind with custom design tokens
- `postcss.config.js` - PostCSS with Tailwind and Autoprefixer
- `.eslintrc.json` - ESLint extending next/core-web-vitals

## Platform Requirements

**Development:**

- Any platform with Node.js
- No containerization required

**Production:**

- Vercel-ready (Next.js optimized)
- Strict CSP headers configured in `next.config.js`
- HSTS, X-Frame-Options, and other security headers enabled

---

_Stack analysis: 2025-01-14_
_Update after major dependency changes_
