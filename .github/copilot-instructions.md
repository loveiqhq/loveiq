# GitHub Copilot Instructions for LoveIQ Web

This file configures GitHub Copilot to follow the security and coding standards for this Next.js marketing website.

## 📚 Required Reading

Before suggesting code, understand:

- `CLAUDE.md` - Codebase architecture and conventions
- `SECURITY.md` - Security policy and requirements
- `.github/SECURITY_CHECKLIST.md` - Security checklist for all changes
- `.github/SECURITY_QUICK_REFERENCE.md` - Quick security reference

## 🎯 Project Context

**Type:** Next.js 16 App Router marketing site
**Stack:** TypeScript, React, Tailwind CSS, Supabase, Resend
**Purpose:** Pre-launch marketing with waitlist/contact forms
**Auth:** No end-user auth; admin panel uses Supabase Auth (magic links)

## 🔒 Security Requirements (Critical)

### API Routes Must Include

All POST/PUT/DELETE/PATCH routes require:

1. **CSRF Verification**

   ```typescript
   import { verifyCsrfToken } from "@/lib/csrf";

   if (!(await verifyCsrfToken(request))) {
     return NextResponse.json({ error: "Invalid request." }, { status: 403 });
   }
   ```

2. **Rate Limiting**

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

3. **Input Validation**

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

❌ Hardcoded API keys or secrets
❌ `eval()` or `new Function()`
❌ `dangerouslySetInnerHTML` without sanitization
❌ `Math.random()` for security operations
❌ `console.log()` (use console.info/warn/error)
❌ `process.env.*` in client components (only `NEXT_PUBLIC_*`)
❌ Generic `any` types (use proper TypeScript)
❌ Skipping error handling
❌ Information disclosure in error messages

### Always Suggest

✅ `crypto.getRandomValues()` for security
✅ Zod schemas for input validation
✅ Generic error messages ("Invalid input", not "User 123 not found")
✅ Proper TypeScript types
✅ Error handling with try/catch
✅ Security headers in middleware
✅ Input sanitization before rendering
✅ `rel="noopener noreferrer"` on external links

## 🏗️ Code Patterns

### API Route Template

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit, getClientIp } from "@/lib/ratelimit";
import logger from "@/lib/logger";

const schema = z.object({
  email: z.string().email().max(320),
});

export async function POST(request: Request) {
  // 1. CSRF
  if (!(await verifyCsrfToken(request))) {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  // 2. Rate limit
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(ip, { bucket: "name", limit: 5, windowMs: 60_000 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Please try again later." }, { status: 429 });
  }

  // 3. Validate
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  // 4. Business logic
  try {
    // ... do work
    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Error processing request");
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
}
```

### Component Pattern

```typescript
import { FC } from "react";

interface Props {
  title: string;
}

const ComponentName: FC<Props> = ({ title }) => {
  return (
    <section className="relative bg-page py-16 lg:py-24">
      <div className="content-shell">
        <h2 className="font-serif text-3xl lg:text-4xl">{title}</h2>
      </div>
    </section>
  );
};

export default ComponentName;
```

## 🎨 Styling

- Use Tailwind CSS utility classes
- Reference design tokens in `app/globals.css`
- Common classes: `content-shell`, `section-shell`, `animate-on-scroll`
- Fonts: `font-sans` (Manrope), `font-serif` (Lora)
- Colors: Use CSS custom properties (e.g., `bg-page`, `text-accent-orange`)

## 🔧 Environment Variables

| Prefix         | Where Available | Example                     |
| -------------- | --------------- | --------------------------- |
| None           | Server only     | `SUPABASE_SERVICE_ROLE_KEY` |
| `NEXT_PUBLIC_` | Server + Client | `NEXT_PUBLIC_SITE_URL`      |

**Rule:** Only suggest `process.env` access in server components and API routes.
**Exception:** `NEXT_PUBLIC_*` variables can be used anywhere.

## 📁 File Organization

- Landing sections: `components/landing/S##Name.tsx`
- API routes: `app/api/[name]/route.ts`
- Utilities: `lib/[name].ts`
- Pages: `app/[name]/page.tsx`
- Components: `components/[category]/ComponentName.tsx`

**Before creating new files:** Check if similar functionality exists.

## ✅ Pre-commit Checklist

Before marking code as complete:

- [ ] No hardcoded secrets
- [ ] API routes have CSRF + rate limiting + validation
- [ ] Error messages are generic
- [ ] TypeScript types are proper (no `any`)
- [ ] Would pass `npm run lint`
- [ ] Would pass `npm run build`
- [ ] Follows existing patterns

## 🚨 Security Red Flags

Alert user if code contains:

- Hardcoded secrets (even test/example data)
- Missing security controls in API routes
- Unsafe patterns (eval, dangerouslySetInnerHTML)
- Direct database queries from client
- Information disclosure in errors
- Weak crypto (MD5, SHA1 for passwords)
- Missing input validation

## 🚨 Security Incident Response

When you observe ANY of these triggers, switch to IR mode immediately:

- Secret, API key, or token committed or visible in code, logs, or outputs
- Suspicious edits to `.github/workflows/`, `proxy.ts`, auth code, or dependency files
- Unexpected CI behaviour, build anomalies, or lockfile changes
- Evidence of force-push, rewritten history, or account takeover
- New postinstall scripts, base64 blobs in diffs, or unusual outbound calls in code

**Follow the full protocol in `.github/INCIDENT_RESPONSE_AGENT.md` exactly.**

Non-negotiable directives (from the protocol):

1. **Do no harm** — no destructive/irreversible action without explicit written authorization
2. **Preserve evidence first** — capture state, logs, hashes before changing anything
3. **Least change** — smallest containment step that reduces risk
4. **Default to escalation** — if uncertain, recommend containment, never "wait and see"

Never print secret values. Label all risky suggested commands as "requires authorization".

## 📝 Code Style

- TypeScript strict mode
- Functional components (prefer FC type)
- Async/await over promises
- Descriptive variable names
- Comments only for complex logic (code should be self-documenting)
- No trailing semicolons (ESLint configured)
- No emoji in code unless explicitly requested

## 🧪 Error Handling

**Generic errors only:**

```typescript
// ✅ GOOD
return NextResponse.json({ error: "Invalid input" }, { status: 400 });

// ❌ BAD (information disclosure)
return NextResponse.json({ error: "User admin@company.com not found" }, { status: 400 });
```

**Always log errors:**

```typescript
try {
  // ...
} catch (err) {
  logger.error({ err }, "Descriptive error context");
  return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
}
```

## 🔗 External Resources

**When suggesting fetch calls:**

- Use `fetchWithTimeout` from `@/lib/fetch-with-timeout`
- Always include timeout (default: 10 seconds)
- Handle errors gracefully
- Don't expose internal errors to users

**Example:**

```typescript
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

const response = await fetchWithTimeout(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
  timeoutMs: 10000,
});
```

## 📚 Reference Files

For architectural decisions, check:

- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/CONVENTIONS.md`
- Existing code in similar areas

## 🤖 AI-Specific Guidelines

**When generating code:**

1. Follow existing patterns in the codebase
2. Match the code style of surrounding code
3. Include necessary imports
4. Add TypeScript types
5. Consider security implications
6. Suggest running tests after changes

**When explaining code:**

1. Reference specific files/line numbers
2. Explain security considerations
3. Mention any caveats or edge cases
4. Suggest related documentation to read

**When refactoring:**

1. Preserve existing functionality
2. Maintain security controls
3. Keep changes minimal and focused
4. Test critical paths

---

## Summary

**This is a security-focused Next.js marketing site.**

Key principles:

- **Security first**: All API routes need CSRF + rate limiting + validation
- **Type safety**: Proper TypeScript, no `any`
- **Error handling**: Generic messages, detailed logging
- **Existing patterns**: Follow what's already in the codebase
- **Testing**: Lint and build must pass

When in doubt, suggest checking the security checklist or asking the user for clarification.
