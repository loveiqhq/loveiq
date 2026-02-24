# Coding Conventions

**Analysis Date:** 2025-01-14

## Naming Patterns

**Files:**

- PascalCase for React components: `HeroSection.tsx`, `LandingPage.tsx`
- camelCase for utilities: `analytics.ts`, `waitlist.ts`
- kebab-case for directories: `app/api/waitlist/`
- Numbered sections: `Section05.tsx` through `Section12.tsx`

**Functions:**

- camelCase for all functions: `getClientIp`, `isRateLimited`, `notifySlackWaitlist`
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

- No Prettier config detected (likely using IDE defaults)
- 2-space indentation (observed)
- Double quotes for JSX attributes
- No trailing commas in objects (inconsistent)
- Semicolons required

**Linting:**

- ESLint with `next/core-web-vitals` preset (`.eslintrc.json`)
- Run: `npm run lint`
- Strict TypeScript enabled (`tsconfig.json`)

## Import Organization

**Order (observed):**

1. React/Next.js imports (`next/script`, `next/font/google`)
2. External packages (`resend`, `zod`)
3. Internal modules (`../lib/emails/waitlist`)
4. Relative imports (`./HeroSection`)
5. Type imports (`type { Metadata }`)

**Grouping:**

- No blank lines between import groups (flat organization)
- No alphabetical sorting enforced

**Path Aliases:**

- None configured (using relative imports)
- Example: `../../../lib/emails/waitlist` (deep relative paths)

## Error Handling

**Patterns:**

- Try/catch for external API calls
- Return early with error responses
- JSON response with `error` field
- HTTP status codes: 400 (validation), 429 (rate limit), 500 (server error)

**Error Types:**

- No custom error classes
- Plain Error objects or string messages
- Console.error for logging

**Example Pattern:**

```typescript
try {
  const res = await fetch(url, options);
  if (!res.ok) {
    console.error("Failed:", res.status);
    return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
  }
} catch (err) {
  console.error("Error:", err);
  return NextResponse.json({ error: "Unable to process request." }, { status: 500 });
}
```

## Logging

**Framework:**

- Console methods only (console.log, console.warn, console.error)
- No structured logging library

**Patterns:**

- `console.log` for success operations: `console.log("Slack webhook sent:", res.status)`
- `console.warn` for missing optional config: `console.warn("Slack webhook missing...")`
- `console.error` for failures: `console.error("Slack webhook failed:", res.status, body)`

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
- Theme constants in `components/theme.ts` for reusable class strings

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
_Update when patterns change_
