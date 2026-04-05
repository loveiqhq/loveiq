# lib/

Runtime utilities and server-side logic shared across API routes and components.

## Key Conventions

- Keep global utilities at the root of `lib/`.
- Keep domain-specific logic in a named subdirectory.
- All Supabase access is via REST helpers or server wrappers. Do not add an ad hoc database client path.
- `lib/scoring/` is the shared scoring engine. Do not hand-edit generated config in `data/scoring-config.ts`.
- `lib/admin/` is large enough to require its own local router: use [`admin/AGENT_README.md`](admin/AGENT_README.md).

## File Manifest

| File                     | Purpose                                     | Primary consumers                        |
| ------------------------ | ------------------------------------------- | ---------------------------------------- |
| `csrf.ts`                | Server-side CSRF token verification         | All mutating API routes                  |
| `csrf-client.ts`         | Client-side CSRF token reader               | Client forms and fetch calls             |
| `ratelimit.ts`           | IP-based rate limiting                      | API routes                               |
| `analytics.ts`           | GA4 event tracking helpers                  | Client components                        |
| `logger.ts`              | pino structured logging                     | API routes, middleware                   |
| `circuit-breaker.ts`     | Circuit breaker for external service calls  | API routes calling Resend or Slack       |
| `fetch-with-timeout.ts`  | Fetch wrapper with timeout                  | `circuit-breaker.ts` and network helpers |
| `supabase-middleware.ts` | Supabase Auth client for Next.js middleware | `proxy.ts`                               |

### `admin/`

Use [`admin/AGENT_README.md`](admin/AGENT_README.md) for admin-specific auth, analytics, and operating-system lookup.

### `emails/`

| File                  | Purpose                              | Primary consumers              |
| --------------------- | ------------------------------------ | ------------------------------ |
| `waitlist.ts`         | Waitlist confirmation email template | `app/api/waitlist/route.ts`    |
| `admin-magic-link.ts` | Admin magic-link email template      | `app/api/admin/login/route.ts` |
| `invite.ts`           | Invite email template                | `app/api/invite/route.ts`      |

### `scoring/`

| File        | Purpose                                     | Primary consumers         |
| ----------- | ------------------------------------------- | ------------------------- |
| `types.ts`  | Scoring config and result types             | All scoring files         |
| `config.ts` | Loads and validates compiled scoring config | `engine.ts`               |
| `engine.ts` | Core scoring algorithm                      | `app/api/survey/route.ts` |
| `index.ts`  | Public scoring API barrel                   | `app/api/survey/route.ts` |
