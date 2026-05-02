# **tests**/

Unit tests (Vitest) that mirror the source directory structure.

## Key Conventions

- Run with `npm test` (once), `npm run test:watch` (watch mode), or `npm run test:coverage` (with coverage).
- `setup.ts` contains global Vitest setup (mocks, env vars). New global mocks go there.
- Test file paths mirror source paths (see mapping below).

## Test-to-Source Mapping

| Test File                                      | Source File                               |
| ---------------------------------------------- | ----------------------------------------- |
| `api/waitlist-validation.test.ts`              | `app/api/waitlist/route.ts`               |
| `api/contact-validation.test.ts`               | `app/api/contact/route.ts`                |
| `api/health.test.ts`                           | `app/api/health/route.ts`                 |
| `api/staging-login.test.ts`                    | `app/api/staging-login/route.ts`          |
| `api/logout.test.ts`                           | `app/api/admin/logout/route.ts`           |
| `api/admin-submissions.test.ts`                | `app/api/admin/submissions/route.ts`      |
| `api/admin-export.test.ts`                     | `app/api/admin/export/route.ts`           |
| `api/admin-survey-status.test.ts`              | `app/api/admin/survey-status/route.ts`    |
| `lib/csrf.test.ts`                             | `lib/csrf.ts`                             |
| `lib/csrf-body.test.ts`                        | `lib/csrf.ts` (body-based CSRF)           |
| `lib/ratelimit.test.ts`                        | `lib/ratelimit.ts`                        |
| `lib/ratelimit-full.test.ts`                   | `lib/ratelimit.ts` (full integration)     |
| `lib/circuit-breaker.test.ts`                  | `lib/circuit-breaker.ts`                  |
| `lib/admin/auth.test.ts`                       | `lib/admin/auth.ts`                       |
| `lib/emails/waitlist.test.ts`                  | `lib/emails/waitlist.ts`                  |
| `lib/scoring/engine.test.ts`                   | `lib/scoring/engine.ts`                   |
| `lib/scoring/config.test.ts`                   | `lib/scoring/config.ts`                   |
| `components/admin/AdminLoginForm.test.tsx`     | `components/admin/AdminLoginForm.tsx`     |
| `components/staging/StagingLoginForm.test.tsx` | `components/staging/StagingLoginForm.tsx` |
| `components/waitlist/WaitlistPage.test.tsx`    | `components/waitlist/WaitlistPage.tsx`    |
| `proxy.test.ts`                                | `proxy.ts`                                |

## Regression Test Convention

When writing a test for a **bug fix**, wrap it in a `describe` block prefixed with `regression:` and the issue number or a short description. This makes regression tests searchable via `grep -r "regression:"`.

```ts
describe("regression: #42 — duplicate email signup returns wrong status", () => {
  it("returns 409 for duplicate email instead of 500", async () => {
    // test the specific scenario that caused the bug
  });
});
```

**Rules:**

- Use `regression: #<number>` when a GitHub issue exists
- Use `regression: <short-description>` for bugs found without an issue
- Place the regression describe block inside the existing test file for the affected module
- Always test the **exact scenario** that triggered the bug, not just a generic variation
