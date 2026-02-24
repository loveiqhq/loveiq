# Codeium Instructions for LoveIQ Web

## Project Overview

**Type:** Next.js 16 App Router marketing website
**Stack:** TypeScript + React + Tailwind CSS + Supabase + Resend
**Purpose:** Pre-launch marketing with waitlist/contact forms
**Authentication:** None

## Documentation to Read

1. `CLAUDE.md` - Main codebase instructions and architecture
2. `SECURITY.md` - Security policy and procedures
3. `.github/SECURITY_CHECKLIST.md` - Developer security checklist
4. `.github/SECURITY_QUICK_REFERENCE.md` - Quick reference card

## Critical Security Requirements

### All API Routes Must Include

#### 1. CSRF Verification

```typescript
import { verifyCsrfToken } from "@/lib/csrf";

if (!(await verifyCsrfToken(request))) {
  return NextResponse.json({ error: "Invalid request." }, { status: 403 });
}
```

#### 2. Rate Limiting

```typescript
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

const ip = getClientIp(request);
const rateLimit = await checkRateLimit(ip, {
  bucket: "route-name",
  limit: 5,
  windowMs: 60_000,
});
if (!rateLimit.allowed) {
  return NextResponse.json({ error: "Please try again later." }, { status: 429 });
}
```

#### 3. Input Validation

```typescript
import { z } from "zod";

const schema = z.object({
  email: z.string().email().max(320),
});

const parsed = schema.safeParse(await request.json().catch(() => ({})));
if (!parsed.success) {
  return NextResponse.json({ error: "Invalid input" }, { status: 400 });
}
```

### Never Suggest

❌ Hardcoded secrets or API keys (even in comments/examples)
❌ `eval()`, `new Function()`, `dangerouslySetInnerHTML`
❌ `Math.random()` for security operations
❌ `console.log()` (use `console.info/warn/error` instead)
❌ `process.env.*` in client components (only `NEXT_PUBLIC_*`)
❌ Skipping security controls (CSRF, rate limiting, validation)
❌ Information disclosure in error messages
❌ TypeScript `any` type (use proper types)

### Always Include

✅ CSRF verification in POST/PUT/DELETE/PATCH routes
✅ Rate limiting in all POST routes
✅ Zod schema validation for all inputs
✅ `crypto.getRandomValues()` for security-sensitive randomness
✅ Generic error messages (no internal details exposed)
✅ Proper TypeScript types
✅ Error handling with try/catch
✅ Logging errors with context

## Complete API Route Template

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";

const schema = z.object({
  email: z.string().email().max(320),
  // Add other fields as needed
});

const RATE_LIMIT_CONFIG = {
  bucket: "route-name",
  limit: 5,
  windowMs: 60_000, // 1 minute
};

export async function POST(request: Request) {
  // 1. CSRF verification
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 2. Rate limiting
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, RATE_LIMIT_CONFIG);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)),
        },
      }
    );
  }

  // 3. Input validation
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email } = parsed.data;

  // 4. Business logic
  try {
    // ... do work

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error in route-name:", err);
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
```

## File Organization Patterns

| Type             | Location              | Example                                |
| ---------------- | --------------------- | -------------------------------------- |
| Landing sections | `components/landing/` | `S01Hero.tsx`, `S02Features.tsx`       |
| API routes       | `app/api/`            | `app/api/waitlist/route.ts`            |
| Utilities        | `lib/`                | `lib/csrf.ts`, `lib/ratelimit.ts`      |
| Pages            | `app/`                | `app/about/page.tsx`                   |
| Components       | `components/`         | `components/glossary/GlossaryCard.tsx` |

**Before creating new files:** Check if similar functionality already exists.

## Component Pattern

```typescript
import { FC } from "react";

interface ComponentNameProps {
  title: string;
  description?: string;
}

const ComponentName: FC<ComponentNameProps> = ({ title, description }) => {
  return (
    <section className="relative bg-page py-16 lg:py-24">
      <div className="content-shell">
        <h2 className="font-serif text-3xl lg:text-4xl mb-4">{title}</h2>
        {description && (
          <p className="text-lg text-gray-300">{description}</p>
        )}
      </div>
    </section>
  );
};

export default ComponentName;
```

## Styling Guidelines

- **Framework:** Tailwind CSS
- **Design tokens:** Defined in `app/globals.css`
- **Common classes:**
  - `content-shell` - Max-width container
  - `section-shell` - Section padding
  - `animate-on-scroll` - Scroll animations
- **Fonts:**
  - `font-sans` - Manrope (body text)
  - `font-serif` - Lora (headings)
- **Colors:** Use CSS custom properties
  - `bg-page`, `bg-surface`
  - `text-accent-orange`, `text-accent-purple`

## Environment Variables

| Type                | Prefix         | Access          | Example                     |
| ------------------- | -------------- | --------------- | --------------------------- |
| Server-only secrets | None           | Server only     | `SUPABASE_SERVICE_ROLE_KEY` |
| Client-safe config  | `NEXT_PUBLIC_` | Server + Client | `NEXT_PUBLIC_SITE_URL`      |

**Rule:** Only suggest `process.env.*` access:

- In API routes (server-side)
- In server components
- `NEXT_PUBLIC_*` can be used anywhere

## Error Handling Best Practices

### Generic Error Messages

```typescript
// ✅ GOOD - No information disclosure
return NextResponse.json({ error: "Invalid input" }, { status: 400 });
return NextResponse.json({ error: "Unable to process request." }, { status: 500 });

// ❌ BAD - Exposes internal details
return NextResponse.json(
  { error: "Email admin@company.com not found in users table" },
  { status: 400 }
);
```

### Proper Error Logging

```typescript
try {
  // ... operation
} catch (err) {
  // Log details for debugging (server-side only)
  console.error("Detailed context for debugging:", err);

  // Return generic message to user
  return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
}
```

## Code Style

- TypeScript strict mode (no `any` types)
- Functional components with `FC` type annotation
- Async/await over raw promises
- Descriptive variable names
- Comments only for complex logic
- Follow existing code patterns in the repository

## Testing Checklist

Before marking code as complete:

1. ✅ Run `npm run lint` - must pass
2. ✅ Run `npm run build` - must succeed
3. ✅ No hardcoded secrets
4. ✅ API routes have security controls
5. ✅ Error messages are generic
6. ✅ TypeScript types are proper
7. ✅ Follows existing patterns

## Security Headers

All security headers are configured in `proxy.ts` (middleware):

- Content-Security-Policy (CSP) with nonce
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Strict-Transport-Security (HSTS)
- Referrer-Policy: strict-origin-when-cross-origin

**When adding third-party scripts:** Update CSP directives in `proxy.ts`

## External API Calls

Use `fetchWithTimeout` for all external calls:

```typescript
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const response = await fetchWithTimeout(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
  cache: "no-store",
  timeoutMs: 10000, // 10 second timeout
});
```

## Red Flags - Alert User

Warn user if suggesting code with:

- Hardcoded secrets (even test data)
- Missing security controls in API routes
- Unsafe patterns (eval, dangerouslySetInnerHTML)
- Information disclosure in errors
- Weak cryptography
- Missing input validation
- Missing error handling

## Reference Files

For architectural decisions:

- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/CONVENTIONS.md`

For similar patterns:

- Check existing code in `components/landing/`
- Check existing API routes in `app/api/`

## When Uncertain

1. Check for similar existing code in the repository
2. Review `.planning/codebase/` documentation
3. Follow patterns established in `CLAUDE.md`
4. Ask user for clarification on security-sensitive changes

---

## Summary

**Key Principles:**

- **Security first:** All API routes need CSRF + rate limiting + validation
- **Type safety:** Proper TypeScript, no `any`
- **Error handling:** Generic messages to users, detailed logs on server
- **Existing patterns:** Follow what's already in the codebase
- **Testing:** Lint and build must pass

**This is a security-focused project.** When suggesting code, prioritize security over convenience. When in doubt, check the security checklist or ask the user.
