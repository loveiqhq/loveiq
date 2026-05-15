# Coding Conventions

> **Last verified:** 2026-03-15 | **Verified against:** ESLint config, tsconfig.json, Prettier config, component naming patterns

**Analysis Date:** 2025-01-14

## Naming Patterns

**Files:**

- PascalCase for React components: `S01Hero.tsx`, `LandingPage.tsx`
- camelCase for utilities: `analytics.ts`, `ratelimit.ts`
- kebab-case for directories: `app/api/contact/`
- Numbered landing sections: `S01Hero.tsx` through `S14CTA.tsx`

**Functions:**

- camelCase for all functions: `getClientIp`, `checkRateLimit`, `verifyCsrfToken`
- Descriptive async functions: `verifyCaptcha`, `sendSlackContactNotification`
- Event handlers: Not observed (no interactive client forms in reviewed code)

**Variables:**

- camelCase for variables: `normalizedEmail`, `insertPayload`
- UPPER_SNAKE_CASE for constants: `rateLimitWindowMs`, `rateLimitMax` (actually camelCase used)
- Descriptive names preferred over abbreviations

**Types:**

- PascalCase for types: `Payload`, `GTag`
- No I prefix for interfaces
- Type aliases for complex shapes

## Code Style

**Formatting:**

- Prettier 3.8.1 configured with lint-staged
- 2-space indentation
- Double quotes for JSX attributes
- Semicolons required

**Linting:**

- ESLint flat config (`eslint.config.mjs`)
- Run: `npm run lint`
- Strict TypeScript enabled (`tsconfig.json`)

## Import Organization

**Order (observed):**

1. React/Next.js imports (`next/script`, `next/font/google`)
2. External packages (`resend`, `zod`)
3. Internal modules (../shared/http/csrf`, ../shared/http/ratelimit`)
4. Relative imports (`./S01Hero`)
5. Type imports (`type { Metadata }`)

**Grouping:**

- No blank lines between import groups (flat organization)
- No alphabetical sorting enforced

**Path Aliases:**

- `@/*` alias configured in `tsconfig.json` (maps to project root)
- Used for all cross-directory imports: `@/lib/*`, `@/components/*`, `@/app/*`
- Same-directory imports still use `./`

## Error Handling

**Patterns:**

- Try/catch for external API calls
- Return early with error responses
- JSON response with `error` field
- HTTP status codes: 400 (validation), 403 (CSRF), 429 (rate limit), 500 (server error)

**Error Types:**

- No custom error classes
- Plain Error objects or string messages
- pino structured logging for errors

**Example Pattern:**

```typescript
try {
  const res = await fetch(url, options);
  if (!res.ok) {
    logger.error("Failed:", res.status);
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
} catch (err) {
  logger.error("Error:", err);
  return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
}
```

## Logging

**Framework:**

- pino structured logging (`lib/logger.ts`)
- @vercel/otel for OpenTelemetry integration

**Patterns:**

- `logger.info` for success operations
- `logger.warn` for missing optional config
- `logger.error` for failures
- Slack notifications for important events

**Where:**

- API route handlers for debugging
- External service calls (Slack, Resend, Supabase)

## Comments

**When to Comment:**

- Sparse commenting overall
- Inline comments for clarification: `// Idempotency: if the email already exists...`
- No JSDoc on functions
- `// honeypot must be empty` - Explaining validation rules

**JSDoc/TSDoc:**

- Not used (no function documentation)

**TODO Comments:**

- Not observed in codebase

## Function Design

**Size:**

- API route handlers are 50-100 lines
- Helper functions are 10-30 lines
- No strict size limits enforced

**Parameters:**

- Objects for complex parameters (request body validation)
- Destructuring in function bodies
- Example: `const { email, source, firstName, website } = parsed.data`

**Return Values:**

- Explicit returns
- `NextResponse.json()` for API responses
- Objects with `success` or `error` fields

## Module Design

**Exports:**

- Default exports for React components: `export default LandingPage`
- Named exports for utilities: `export const track = ...`
- No barrel files (no `index.ts` re-exports)

**Component Pattern:**

```typescript
import type { FC } from "react";

const ComponentName: FC = () => {
  return (
    // JSX
  );
};

export default ComponentName;
```

## CSS/Styling Conventions

**Tailwind Usage:**

- Inline Tailwind classes in JSX
- CSS custom properties for design tokens (in `globals.css`)
- Design tokens extended in `tailwind.config.js`

**Class Organization:**

- Layout classes first: `relative`, `flex`, `grid`
- Spacing: `p-4`, `mb-8`
- Typography: `text-lg`, `font-semibold`
- Colors: `bg-page`, `text-text-primary`
- Effects: `shadow-card`, `rounded-card`

**Custom Classes:**

- Utility classes in `globals.css`: `.content-shell`, `.section-shell`, `.surface-card`
- Animation classes: `.animate-float`, `.reveal-on-scroll`

## Validation Conventions

**Zod Patterns:**

```typescript
const schema = z.object({
  email: z.string().email().max(320),
  source: z.string().max(120).optional(),
  firstName: z.string().max(80).optional().nullable(),
  website: z.string().max(0).optional().nullable(), // honeypot
});

const parsed = schema.safeParse(data);
if (!parsed.success) {
  return NextResponse.json({ error: "Invalid input" }, { status: 400 });
}
```

---

_Convention analysis: 2025-01-14_
_Last updated: 2026-03-05_
_Update when patterns change_
