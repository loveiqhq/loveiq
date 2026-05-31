# Codebase Concerns

> **Last verified:** 2026-03-15 | **Verified against:** implemented features (admin dashboard, Supabase Auth), open issues

**Analysis Date:** 2025-01-14

## Tech Debt

**Email enumeration timing (low priority):**

- Issue: Timing attack could theoretically reveal if email exists in survey submissions
- Files: `app/api/survey/route.ts`
- Current mitigation: Same success response for existing emails
- Impact: Minimal — current mitigation is adequate

## Resolved Items

**Public waitlist surface retired:** RESOLVED (2026-05)

- Was: `/waitlist` page + `/api/waitlist` route still live after the funnel moved to `/survey`
- Fix: Deleted public page, API route, signup email template, and broadcast pipeline; `/waitlist` 301-redirects to `/survey` via `next.config.js`
- `waitlist_user` table preserved for admin growth analytics (historical data only, no new inserts)
- Evidence: `next.config.js` redirects block, no `app/waitlist/` or `app/api/waitlist/` directories

**In-memory rate limiting:** RESOLVED (2026-01)

- Was: Rate limiting used in-memory Maps that reset across serverless instances
- Fix: Supabase-backed persistent rate limiting in `shared/http/ratelimit.ts`
- Evidence: `checkRateLimit()` writes to Supabase `rate_limits` table

**Deep relative imports:** RESOLVED (2026-01)

- Was: Import paths like `../../../features/invite/emails/invite` hard to maintain
- Fix: `@/*` path alias configured in `tsconfig.json`
- Evidence: All cross-directory imports use `@/*`, `@shared/*`, `@features/*`

**Generic section naming:** RESOLVED (2026-01)

- Was: Components named `Section05` through `Section12` with no description
- Fix: Renamed to descriptive names: `S01Hero.tsx` through `S15Testimonials.tsx`
- Evidence: `features/landing/ui/S01Hero.tsx` ... `S15Testimonials.tsx`

**Temporary files in root:** RESOLVED (2026-01)

- Was: `tmp_index.css`, `tmp_index.js`, `tmp_loveiq.html` committed
- Fix: Files deleted and patterns added to `.gitignore`

**No CSRF protection:** RESOLVED (2026-01)

- Was: No CSRF token validation on API routes
- Fix: Double-submit cookie pattern in `shared/http/csrf.ts`, verified in all API routes
- Evidence: `verifyCsrfToken()` called in survey + contact + invite route handlers

**No tests:** RESOLVED (2026-02)

- Was: Zero test coverage
- Fix: Vitest unit tests in `__tests__/`, Playwright E2E tests in `e2e/`
- Evidence: `npm test` runs unit tests, `npm run test:e2e` runs Playwright

**No .env.example:** RESOLVED (2026-01)

- Was: No template for required environment variables
- Fix: `.env.example` created with placeholder values

**ffmpeg-static in devDependencies:** RESOLVED (2026-01)

- Was: Unusual dependency with unclear purpose
- Fix: Removed from `package.json`

**No admin dashboard:** RESOLVED (2026-03)

- Was: Cannot view survey submissions or waitlist signups without database access
- Fix: Full admin panel at `/admin/*` with dashboard, submission browser, CSV export, and survey status toggle
- Auth: Supabase Auth magic link emails with `admin_users` email allowlist table
- Evidence: `app/admin/`, `app/api/admin/`, `features/admin/server/`, `features/admin/ui/`

## Known Bugs

**None detected in code review**

- Unit tests (Vitest) and E2E tests (Playwright) provide regression coverage

## Security Considerations

**Hardcoded GA tracking ID:**

- Risk: Google Analytics ID visible in source code
- File: `app/layout.tsx`
- Current mitigation: GA IDs are designed to be public
- Recommendations: Consider moving to environment variable if privacy-sensitive

## Performance Bottlenecks

**None detected:**

- Site is static/marketing focused
- No database-heavy operations
- API routes are simple form handlers

**Potential future concern:**

- If survey submissions grow very large, Supabase REST queries without pagination could slow down
- Currently not an issue for check-existence queries

## Fragile Areas

**Slack notification integration:**

- Why fragile: Webhook URLs can be revoked/changed, no retry logic
- Common failures: Webhook returns non-200, network timeout
- Files: `app/api/survey/route.ts`, `app/api/contact/route.ts`, `app/api/stripe/webhook/route.ts`
- Safe modification: Slack failures are already non-blocking (async, caught)

**CSP header configuration:**

- Why fragile: Adding new third-party scripts requires CSP updates
- Common failures: Scripts blocked silently, features break
- File: `proxy.ts`
- Safe modification: Test thoroughly in dev before deploy

## Scaling Limits

**Supabase tier:**

- Current capacity: Depends on plan (free tier: 500MB, 50k requests/month)
- Limit: API rate limits, database size
- Symptoms at limit: 429 errors, insert failures
- Scaling path: Upgrade Supabase plan

**Resend tier:**

- Current capacity: Depends on plan (free tier: 100 emails/day)
- Limit: Daily email quota
- Symptoms at limit: Email sending failures
- Scaling path: Upgrade Resend plan

## Dependencies at Risk

**Zod 4.x:**

- Risk: Major version bump may have breaking changes
- File: `package.json` shows `^4.3.4`
- Impact: Schema validation core to API routes
- Recommendations: Review Zod changelog if updating

## Missing Critical Features

**No end-user authentication:**

- Problem: Cannot identify returning users across sessions
- Current workaround: Email-based identification on survey submission only
- Blocks: Member area, personalized content
- Implementation complexity: Medium (Supabase Auth available)
- Note: Admin panel now has authentication via Supabase Auth magic links (see resolved item below)

**No email verification:**

- Problem: Survey signups not verified (fake emails possible)
- Current workaround: None
- Blocks: Clean email list for launches
- Implementation complexity: Low (add verification flow)

## Documentation Gaps

**None critical** — `CLAUDE.md`, `docs/runbooks/SECURITY.md`, `docs/runbooks/DEVELOPMENT.md`, `CONTRIBUTING.md`, and `docs/api.md` cover the main areas.

---

_Concerns audit: 2025-01-14_
_Last updated: 2026-03-15_
_Update as issues are fixed or new ones discovered_
