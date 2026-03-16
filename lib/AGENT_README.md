# lib/

Runtime utilities and server-side logic shared across API routes and components.

## Key Conventions

- All Supabase access is via REST API — no direct database client. See `admin/supabase.ts` for the fetch helper pattern.
- `lib/scoring/` is the V3 archetype scoring engine. Its config is auto-generated from CSVs in `data/scoring-config/` via `node scripts/update-scoring-config.js`. Do not hand-edit `data/scoring-config.ts`.

## File Manifest

| File                     | Purpose                                         | Primary Consumers                             |
| ------------------------ | ----------------------------------------------- | --------------------------------------------- |
| `csrf.ts`                | Server-side CSRF token verification             | All API routes (POST/PATCH/DELETE)            |
| `csrf-client.ts`         | Client-side CSRF token reader (cookie → header) | All `"use client"` forms and fetch calls      |
| `ratelimit.ts`           | IP-based rate limiting (Supabase-backed)        | All API routes                                |
| `analytics.ts`           | GA4 event tracking helpers                      | Client components (landing, waitlist, survey) |
| `logger.ts`              | pino structured logging                         | API routes, middleware                        |
| `circuit-breaker.ts`     | Circuit breaker for external service calls      | API routes calling Resend, Slack              |
| `fetch-with-timeout.ts`  | Fetch wrapper with configurable timeout         | `circuit-breaker.ts`                          |
| `supabase-middleware.ts` | Supabase Auth client for Next.js middleware     | `proxy.ts` (root middleware)                  |

### `admin/` — Admin panel server utilities

| File                 | Purpose                                             | Primary Consumers                                        |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| `auth.ts`            | Admin session verification (cookie → Supabase Auth) | All `app/api/admin/*` routes                             |
| `audit.ts`           | Admin action audit logging                          | Admin API routes (status changes, deletes)               |
| `roles.ts`           | Role-based access control (email allowlist)         | `auth.ts`                                                |
| `supabase.ts`        | Supabase REST fetch helper (service role key)       | Admin API routes                                         |
| `supabase-server.ts` | Server-side Supabase Auth client (next/headers)     | `app/admin/auth/callback/route.ts`                       |
| `format.ts`          | Display formatting utilities (`maskEmail`)          | Admin components (`SubmissionTable`, `SubmissionDetail`) |

### `emails/` — Email templates (Resend)

| File                  | Purpose                                   | Primary Consumers              |
| --------------------- | ----------------------------------------- | ------------------------------ |
| `waitlist.ts`         | Waitlist confirmation email HTML template | `app/api/waitlist/route.ts`    |
| `admin-magic-link.ts` | Admin magic link email HTML template      | `app/api/admin/login/route.ts` |

### `scoring/` — V3 Archetype Scoring Engine

| File        | Purpose                                                  | Primary Consumers         |
| ----------- | -------------------------------------------------------- | ------------------------- |
| `types.ts`  | TypeScript types for scoring config and results          | All scoring files         |
| `config.ts` | Loads and validates compiled scoring config              | `engine.ts`               |
| `engine.ts` | Core scoring algorithm (answers → archetype percentages) | `app/api/survey/route.ts` |
| `index.ts`  | Public API barrel export                                 | `app/api/survey/route.ts` |
