# 🔒 Security Quick Reference Card

**Keep this handy when developing!**

---

## 🚨 Before Every Commit

```bash
npm run lint    # Must pass
npm run build   # Must succeed
```

**Check:**

- [ ] No secrets/API keys in code
- [ ] No console.log (use console.info/warn/error)
- [ ] No eval() or dangerouslySetInnerHTML

---

## 📝 API Route Template

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfToken } from "@shared/http/csrf";
import { checkRateLimit, getClientIp } from "@shared/http/ratelimit";
import logger from "@shared/observability/logger";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  // 1. CSRF
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 2. Rate limit
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, {
    bucket: "my-route",
    limit: 5,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  // 3. Validate
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 4. Do work
  try {
    // ...
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Error processing request");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
```

---

## ✅ Required for All API Routes

| HTTP Method | CSRF        | Rate Limit     | Validation  |
| ----------- | ----------- | -------------- | ----------- |
| POST        | ✅ Required | ✅ Required    | ✅ Required |
| PUT         | ✅ Required | ✅ Recommended | ✅ Required |
| DELETE      | ✅ Required | ✅ Recommended | ❌ Optional |
| PATCH       | ✅ Required | ✅ Recommended | ✅ Required |
| GET         | ❌ No       | ❌ No          | ❌ No       |

---

## 🚫 Never Do This

```typescript
// ❌ DON'T
process.env.SECRET_KEY  // in client components
Math.random()  // for security
eval(userInput)
dangerouslySetInnerHTML={{ __html: userInput }}
console.log(sensitiveData)

// ✅ DO
process.env.NEXT_PUBLIC_KEY  // client-safe vars only
crypto.getRandomValues()  // for security
// Parse and validate instead of eval
<div>{sanitizedContent}</div>
console.info(publicData)  // or error/warn
```

---

## 🔐 Environment Variables

| Prefix         | Where           | Example                     |
| -------------- | --------------- | --------------------------- |
| None           | Server only     | `SUPABASE_SERVICE_ROLE_KEY` |
| `NEXT_PUBLIC_` | Server + Client | `NEXT_PUBLIC_SITE_URL`      |

**Rule:** If client needs it, prefix with `NEXT_PUBLIC_`. Otherwise, never expose.

---

## 🧪 Manual Security Testing

```bash
# Test rate limiting
for i in {1..7}; do curl -X POST http://localhost:3000/api/test; done

# Test CSRF protection
curl -X POST http://localhost:3000/api/test  # Should fail

# Check for secrets
grep -r "api[_-]key\|secret\|password" app/ shared/ features/ --include="*.ts"

# Generate SBOM
npx @cyclonedx/cyclonedx-npm --output-file sbom.json
```

---

## 📊 View Security Results

| What                 | Where                                 |
| -------------------- | ------------------------------------- |
| Code scanning alerts | GitHub → Security → Code scanning     |
| Dependency alerts    | GitHub → Security → Dependabot        |
| Secret scanning      | GitHub → Security → Secret scanning   |
| Workflow logs        | GitHub → Actions → Security & Quality |
| SBOM artifact        | Actions → Latest run → Artifacts      |

---

## 🔧 Workflow Triggers

| Event              | Workflow           | Duration   |
| ------------------ | ------------------ | ---------- |
| Push to main       | Full security scan | ~10-15 min |
| Pull request       | Full security scan | ~10-15 min |
| Monday 9am UTC     | Scheduled scan     | ~10-15 min |
| Tuesday 2:30am UTC | CodeQL only        | ~5-10 min  |

---

## 🐛 Common Issues & Fixes

| Issue                          | Fix                                                 |
| ------------------------------ | --------------------------------------------------- |
| "Invalid request" (403)        | Clear cookies, refresh page                         |
| "Please try again later" (429) | Wait 1 minute, retry                                |
| Linting fails                  | Fix errors, don't suppress unless necessary         |
| Build fails                    | Check for type errors, missing imports              |
| Secret detected                | Rotate immediately, then suppress if false positive |

---

## 📚 Documentation Links

| Need to...             | Read                        |
| ---------------------- | --------------------------- |
| Enable GitHub features | `.github/README.md`         |
| Follow best practices  | `SECURITY_CHECKLIST.md`     |
| Review security policy | `docs/runbooks/SECURITY.md` |
| Understand codebase    | `CLAUDE.md`                 |

---

## 🚀 Quick Commands

```bash
# Development
npm run dev          # Start dev server
npm run lint         # Run ESLint
npm run build        # Production build

# Security
npm audit                 # Check for vulnerabilities
npm outdated              # Check for updates
git log --all -S "SECRET" # Search history for secrets

# Generate reports
npx @cyclonedx/cyclonedx-npm --output-file sbom.json
```

---

## 🎯 Security Severity Guide

| Level        | Action                        | Timeline        |
| ------------ | ----------------------------- | --------------- |
| **Critical** | Fix immediately, deploy ASAP  | < 24 hours      |
| **High**     | Fix in current sprint         | < 1 week        |
| **Medium**   | Create issue, prioritize next | < 1 month       |
| **Low**      | Create issue, backlog         | As time permits |
| **Info**     | Review, document, no action   | Optional        |

---

## ⚠️ Red Flags in Code Review

Look for:

- [ ] API routes missing CSRF/rate limiting/validation
- [ ] `process.env.*` in client components (without NEXT*PUBLIC*)
- [ ] `eval()`, `new Function()`, `dangerouslySetInnerHTML`
- [ ] Hardcoded secrets (even test data)
- [ ] Missing error handling
- [ ] Logging sensitive data
- [ ] External links without `rel="noopener noreferrer"`
- [ ] User input rendered without sanitization

---

## 🔄 Weekly Routine

1. Review security scan results (Monday)
2. Merge Dependabot PRs (test first!)
3. Fix critical/high findings
4. Update ignore files for false positives
5. Check SBOM for new dependencies

---

## 📞 Report Security Issues

**DO NOT create public GitHub issues**

Email: <hello@loveiq.org>

Include:

- Description of vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

---

## ✨ Remember

**Security is everyone's responsibility**

- Write secure code from the start
- Review PRs with security in mind
- Keep dependencies updated
- Report issues promptly
- Follow the checklist

**When in doubt, ask!**

---

**Last updated:** 2026-05-31
**Print this and keep it visible!** 🖨️
