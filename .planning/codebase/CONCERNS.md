# Codebase Concerns

**Analysis Date:** 2025-01-14

## Tech Debt

**In-memory rate limiting:**

- Issue: Rate limiting uses in-memory Maps that don't persist across serverless function instances
- Files: `app/api/waitlist/route.ts`, `app/api/contact/route.ts`
- Why: Quick implementation for MVP
- Impact: Rate limiting ineffective in serverless (each instance has fresh state)
- Fix approach: Move to Redis or Upstash for distributed rate limiting

**Deep relative imports:**

- Issue: Import paths like `../../../lib/emails/waitlist` are hard to maintain
- Files: `app/api/waitlist/route.ts`
- Why: No path aliases configured
- Impact: Refactoring file locations requires updating many imports
- Fix approach: Add path aliases in `tsconfig.json` (e.g., `@/lib/*`)

**Generic section naming:**

- Issue: Components named `Section05` through `Section12` don't describe purpose
- Files: `components/landing/Section05.tsx` through `Section12.tsx`
- Why: Likely matches original design mockup naming
- Impact: Hard to find specific section without checking content
- Fix approach: Rename to descriptive names (e.g., `TestimonialsSection`, `PricingSection`)

**Temporary files in root:**

- Issue: Large temporary files committed or present in root
- Files: `tmp_index.css` (~402KB), `tmp_index.js` (~8.5MB), `tmp_loveiq.html`
- Why: Development artifacts not cleaned up
- Impact: Clutters repository, increases clone size
- Fix approach: Delete files and add to `.gitignore`

## Known Bugs

**None detected in code review**

- Note: No runtime testing performed; bugs may exist but weren't visible in static analysis

## Security Considerations

**Hardcoded GA tracking ID:**

- Risk: Google Analytics ID visible in source code
- File: `app/layout.tsx` (line 115-121)
- Current mitigation: GA IDs are designed to be public
- Recommendations: Consider moving to environment variable if privacy-sensitive

**In-memory rate limiting bypass:**

- Risk: Rate limiting can be bypassed by hitting different serverless instances
- Files: `app/api/waitlist/route.ts`, `app/api/contact/route.ts`
- Current mitigation: None
- Recommendations: Implement Redis-based rate limiting (Upstash is Vercel-compatible)

**No CSRF protection on API routes:**

- Risk: Cross-site request forgery possible on form endpoints
- Files: `app/api/waitlist/route.ts`, `app/api/contact/route.ts`
- Current mitigation: Rate limiting, honeypot fields, reCAPTCHA (contact only)
- Recommendations: Add CSRF tokens for sensitive operations

**Email enumeration possible:**

- Risk: Timing attack could reveal if email exists in waitlist
- File: `app/api/waitlist/route.ts` (existing check returns faster)
- Current mitigation: Same success response for existing emails
- Recommendations: Current mitigation is adequate

## Performance Bottlenecks

**None detected:**

- Site is static/marketing focused
- No database-heavy operations
- API routes are simple form handlers

**Potential future concern:**

- If waitlist grows very large, Supabase REST queries without pagination could slow down
- Currently not an issue for check-existence queries

## Fragile Areas

**Slack notification integration:**

- Why fragile: Webhook URLs can be revoked/changed, no retry logic
- Common failures: Webhook returns non-200, network timeout
- Files: `app/api/waitlist/route.ts`, `app/api/contact/route.ts`
- Safe modification: Slack failures are already non-blocking (async, caught)
- Test coverage: None

**CSP header configuration:**

- Why fragile: Adding new third-party scripts requires CSP updates
- Common failures: Scripts blocked silently, features break
- File: `next.config.js` (lines 29-41)
- Safe modification: Test thoroughly in dev before deploy
- Test coverage: None

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

**ffmpeg-static in devDependencies:**

- Risk: Unusual dependency for a web marketing site, purpose unclear
- File: `package.json`
- Impact: Increases install time/size unnecessarily
- Migration plan: Remove if unused, document if used

**Zod 4.x:**

- Risk: Major version bump may have breaking changes
- File: `package.json` shows `^4.3.4`
- Impact: Schema validation core to API routes
- Recommendations: Review Zod changelog if updating

## Missing Critical Features

**No user authentication:**

- Problem: Cannot identify returning waitlist members
- Current workaround: Email-based identification only
- Blocks: Member area, personalized content
- Implementation complexity: Medium (Supabase Auth available)

**No email verification:**

- Problem: Waitlist signups not verified (fake emails possible)
- Current workaround: None
- Blocks: Clean email list for launches
- Implementation complexity: Low (add verification flow)

**No admin dashboard:**

- Problem: Cannot view waitlist signups without database access
- Current workaround: Direct Supabase dashboard access
- Blocks: Non-technical team members viewing signups
- Implementation complexity: Medium

## Test Coverage Gaps

**No tests:**

- What's not tested: Everything
- Risk: Regressions undetected, refactoring risky
- Priority: High (at least for API routes)
- Difficulty to test: Low for unit tests, medium for integration tests

**Specific high-risk untested areas:**

- Zod validation schemas
- Rate limiting logic
- Email template generation
- Supabase API integration
- Resend email sending

## Documentation Gaps

**No .env.example:**

- What's missing: Template for required environment variables
- Risk: New developers don't know which vars to set
- Current docs: `SECURITY.md` lists variables but no template file
- Fix: Create `.env.example` with placeholder values

---

_Concerns audit: 2025-01-14_
_Update as issues are fixed or new ones discovered_
