# `__tests__/`

Cross-cutting unit/contract/integration tests (Vitest). Feature- and module-specific
tests are **colocated** with their source instead of living here.

## Key Conventions

- Run with `npm test` (once), `npm run test:watch` (watch mode), or `npm run test:coverage` (with coverage).
- Integration tests run separately via `npm run test:integration` (need `SUPABASE_TEST_*` env vars).
- `setup.ts` contains global Vitest setup (mocks, env vars). New global mocks go there.
- **Colocated by default:** a module's tests live next to it under a `tests/` folder —
  `shared/<area>/tests/*.test.ts` and `features/<feature>/tests/*.test.*`. Only cross-cutting
  suites (API handlers, data files, app-level CSS, contracts, integration, scripts, security) live here.

## What lives in `__tests__/`

| Path                                | Covers                                                    |
| ----------------------------------- | --------------------------------------------------------- |
| `api/health.test.ts`                | `app/api/health/route.ts`                                 |
| `app/*.test.ts`                     | `app/globals.css` report theme + typography invariants    |
| `contracts/*.ts`                    | Supabase schema/RPC contracts (`supabase/migrations/**`)  |
| `data/*.test.ts`                    | Generated `data/report-*.ts` content integrity            |
| `integration/*.integration.test.ts` | Payment-webhook idempotency, RLS boundary (live Supabase) |
| `scripts/*.test.ts`                 | `scripts/convert-report-content.js`                       |
| `security/*.test.ts`                | Premium-content bundle leakage guard                      |
| `__fixtures__/`                     | Shared test fixtures (MSW server, survey fixtures)        |
| `setup.ts`                          | Global Vitest setup                                       |

## Colocated test examples (live next to source, not here)

| Test File                                           | Source File                                |
| --------------------------------------------------- | ------------------------------------------ |
| `features/contact/tests/contact-validation.test.ts` | `app/api/contact/route.ts`                 |
| `features/scoring/tests/engine.test.ts`             | `features/scoring/logic/engine.ts`         |
| `features/admin/tests/admin-auth-lib.test.ts`       | `features/admin/server/auth.ts`            |
| `features/admin/tests/AdminLoginForm.test.tsx`      | `features/admin/ui/AdminLoginForm.tsx`     |
| `features/staging/tests/StagingLoginForm.test.tsx`  | `features/staging/ui/StagingLoginForm.tsx` |
| `shared/http/tests/csrf.test.ts`                    | `shared/http/csrf.ts`                      |
| `shared/http/tests/ratelimit.test.ts`               | `shared/http/ratelimit.ts`                 |
| `shared/http/tests/circuit-breaker.test.ts`         | `shared/http/circuit-breaker.ts`           |
| `shared/auth/tests/proxy.test.ts`                   | `proxy.ts`                                 |

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
