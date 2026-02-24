# Security Checklist for Developers

Use this checklist when making changes to ensure security compliance.

## Before Committing

- [ ] No hardcoded secrets or API keys in code
- [ ] All secrets use environment variables
- [ ] `.env.local` not committed (check git status)
- [ ] No sensitive data in comments or logs
- [ ] Run `npm run lint` - passes with no errors
- [ ] Run `npm run build` - succeeds

## API Routes

When creating or modifying API routes (`app/api/**`):

- [ ] POST/PUT/DELETE/PATCH routes include `verifyCsrfToken()`
- [ ] All POST routes include `checkRateLimit()`
- [ ] Input validation with Zod schema
- [ ] Error messages are generic (no information disclosure)
- [ ] No sensitive data logged to console
- [ ] Proper timeout on external API calls (`fetchWithTimeout`)
- [ ] Email addresses normalized (lowercase, trimmed)

**Example template:**

```typescript
export async function POST(request: Request) {
  // 1. CSRF verification
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 2. Rate limiting
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, { bucket: "my-route", limit: 5, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  // 3. Validation
  const schema = z.object({ email: z.string().email() });
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 4. Business logic
  try {
    // ... do work
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error:", err);
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
```

## Client Components

When working with React components (`components/**`, `app/**/page.tsx`):

- [ ] No direct `process.env` access (only `NEXT_PUBLIC_*`)
- [ ] No `dangerouslySetInnerHTML` (use proper escaping)
- [ ] No `eval()` or `new Function()`
- [ ] External links include `rel="noopener noreferrer"`
- [ ] User input sanitized before rendering
- [ ] Forms include CSRF token from cookie

## Security Headers

When modifying `proxy.ts` (middleware):

- [ ] All required headers present (CSP, X-Frame-Options, HSTS, etc.)
- [ ] CSP updated if adding new third-party scripts
- [ ] New domains added to appropriate CSP directive
- [ ] Dev mode relaxations still appropriate
- [ ] Nonce-based inline script handling preserved

## Dependencies

When adding or updating dependencies:

- [ ] Reviewed package on npm for legitimacy
- [ ] Checked package download statistics and maintenance
- [ ] No dependencies with critical vulnerabilities
- [ ] License compatible with project (no GPL-3.0, AGPL-3.0)
- [ ] Added to `.semgrepignore` if auto-generated code

## Environment Variables

When adding new environment variables:

- [ ] Added to `.env.example` with description
- [ ] Documented in `CLAUDE.md` Environment Variables section
- [ ] Server-only secrets NOT prefixed with `NEXT_PUBLIC_`
- [ ] Updated `SECURITY.md` if it's a secret (rotation schedule)
- [ ] Build succeeds without the variable (graceful degradation)

## Pull Requests

Before opening a PR:

- [ ] All security checks pass locally (`npm run lint`, `npm run build`)
- [ ] No new security warnings in console
- [ ] Branch is up to date with main
- [ ] Commit messages don't contain sensitive info
- [ ] PR description explains security implications (if any)

## Code Review Focus Areas

When reviewing PRs, pay special attention to:

### High Risk Areas

- API routes (authentication, authorization, input validation)
- Database queries (SQL injection, data leaks)
- File uploads/downloads (path traversal)
- External API calls (SSRF, timeout handling)
- Crypto operations (weak algorithms, bad entropy)

### Common Vulnerabilities

- ❌ SQL injection (not applicable - we use REST API)
- ❌ XSS (dangerouslySetInnerHTML, unescaped user input)
- ❌ CSRF (missing token verification)
- ❌ Broken authentication (not applicable - no auth yet)
- ❌ Sensitive data exposure (logging secrets, error messages)
- ❌ XXE (not applicable - no XML parsing)
- ❌ Broken access control (not applicable - no auth yet)
- ❌ Security misconfiguration (missing headers, insecure defaults)
- ❌ Known vulnerable components (outdated dependencies)
- ❌ Insufficient logging (no security event tracking)

## Security Testing

### Manual Testing

- [ ] Test with invalid/malicious input
- [ ] Test rate limiting (submit form 6+ times rapidly)
- [ ] Test CSRF protection (submit without cookie/header)
- [ ] Test with extremely long inputs (DoS)
- [ ] Test special characters in inputs (injection)

### Automated Testing

Security scans run automatically on push/PR:

- Secret scanning (TruffleHog)
- SAST (Semgrep + CodeQL)
- Dependency scanning (npm audit + SBOM)
- Custom security rules
- ESLint security plugins

View results in:

- GitHub Actions → Security & Quality workflow
- GitHub Security tab → Code scanning alerts
- Pull request checks

## Incident Response

If you discover a security issue:

1. **Do NOT create a public GitHub issue**
2. Report to security team immediately
3. Follow `SECURITY.md` incident response procedures
4. Rotate affected secrets immediately
5. Review logs for indicators of compromise

## Resources

- `SECURITY.md` - Main security guide
- `SECURITY_SCANNING.md` - Detailed scanning documentation
- `CLAUDE.md` - Codebase conventions and patterns
- `.github/workflows/security.yml` - CI/CD security workflow

## Quick Commands

```bash
# Run linting
npm run lint

# Run build (catches many issues)
npm run build

# Check for outdated dependencies
npm outdated

# Audit dependencies
npm audit

# Generate SBOM locally
npx @cyclonedx/cyclonedx-npm --output-file sbom.json

# Search for potential secrets
grep -r "api[_-]key\|secret\|password" app/ lib/ --include="*.ts"
```
