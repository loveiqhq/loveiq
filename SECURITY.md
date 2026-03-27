# Security Guide

## Environment & secrets

- **Server-only secrets** (set only in Vercel env vars, never in client bundles): `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RECAPTCHA_SECRET_KEY`, `SLACK_WAITLIST_WEBHOOK_URL`, `SLACK_CONTACT_WEBHOOK_URL`, `SLACK_SURVEY_WEBHOOK_URL`, `STAGING_PASSWORD`, `SURVEY_CLOSE_PASSWORD`.
- **Server config** (not secret but server-only): `SUPABASE_URL`, `RESEND_FROM`, `RESEND_REPLY_TO`, `CONTACT_TO_EMAIL`.
- **Client-safe** (`NEXT_PUBLIC_*` prefix, exposed in browser bundles by design): `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_GTM_ID`.
- Never expose the Supabase service role key to the client; keep all DB access server-side.

## Secrets rotation schedule

| Secret                      | Rotation                | How to rotate                                         |
| --------------------------- | ----------------------- | ----------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | Quarterly / on incident | Supabase Dashboard → Settings → API → Regenerate      |
| `RESEND_API_KEY`            | Quarterly / on incident | Resend Dashboard → API Keys → Create new → Delete old |
| `RECAPTCHA_SECRET_KEY`      | Annually / on incident  | Google reCAPTCHA Admin → Settings → Regenerate        |
| `SLACK_*_WEBHOOK_URL`       | On incident only        | Slack App → Incoming Webhooks → Add new → Remove old  |
| `STAGING_PASSWORD`          | On incident only        | Update in Vercel env vars → Redeploy                  |
| `SURVEY_CLOSE_PASSWORD`     | On incident only        | Update in Vercel env vars → Redeploy                  |

**Rotation checklist:**

1. Generate new key in the service dashboard
2. Update Vercel environment variable
3. Trigger redeploy
4. Verify functionality (test form submissions)
5. Revoke/delete the old key
6. Log the rotation date

**Rotation reminders:** Set calendar reminders for:

- January 1, April 1, July 1, October 1 (quarterly review)

## Monitoring & alerts

- Watch Vercel logs for spikes or 429/500s on `/api/waitlist`.
- Monitor Supabase logs for insert anomalies and rate spikes; enable row-level auditing if available.
- Monitor Resend dashboard for bounce/complaint rates; alert on send failures.
- Add Google Search Console/GA alerts for traffic anomalies.

## Backups & exports

- Export waitlist data regularly from Supabase (CSV or snapshots) and store securely.
- Test restores periodically to ensure data integrity.

## Abuse protection

- Rate limit and cooldown on `/api/waitlist` (in place).
- Honeypot field on forms; consider adding CAPTCHA via env-flagged toggle if abuse increases.
- Keep generic error messages to avoid information disclosure.

## Secure headers & CSP

- Security headers are set in `proxy.ts` with nonce-based CSP (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP).
- If you add new third-party scripts/resources, update CSP in `proxy.ts` accordingly.
- All inline scripts must use the `nonce` prop passed from the layout.
- **SRI (Subresource Integrity):** Google Analytics and reCAPTCHA don't support SRI hashes because their scripts change dynamically. Our nonce-based CSP provides equivalent protection by only allowing scripts with valid nonces to execute.

## Dependencies

- Run `npm audit` regularly; patch high/critical issues. Avoid shipping dev-only tooling to production if not needed.
- **Automated scanning**: See `.github/workflows/security.yml` for comprehensive dependency scanning
- **SBOM**: Software Bill of Materials generated on every build (90-day retention)
- **Dependabot**: Configured in `.github/dependabot.yml` for automated security updates

## Security Scanning

The repository uses multiple layers of automated security scanning:

### 1. Secret Scanning (TruffleHog)

- Scans entire git history for leaked credentials
- Runs on every push, PR, and weekly
- Fails build if verified secrets detected

### 2. SAST - Static Analysis

- **Semgrep**: Fast SAST for OWASP Top 10, Node.js/Next.js patterns
- **CodeQL**: Deep semantic analysis for complex vulnerabilities
- Results visible in GitHub Security tab

### 3. Dependency Scanning

- **npm audit**: Fails on high/critical vulnerabilities
- **SBOM generation**: CycloneDX format, stored as artifact
- **Dependency Review**: Blocks PRs with vulnerable dependencies

### 4. Custom Security Rules

- API routes must have CSRF protection, rate limiting, Zod validation
- Checks for dangerous patterns (eval, dangerouslySetInnerHTML)
- Verifies security headers in middleware
- Scans build output for leaked secrets

### 5. Enhanced Linting

- `eslint-plugin-security` for security anti-patterns
- `eslint-plugin-no-secrets` for secret detection
- Custom rules in `eslint.config.mjs`

## Incident response

- On suspected compromise: rotate Supabase/Resend keys, invalidate sessions if added later, redeploy, and review logs. Notify affected users if data exposure is confirmed.
- Review GitHub Security tab for any active alerts
- Check TruffleHog and CodeQL findings for indicators of compromise
- Generate fresh SBOM to audit all dependencies
