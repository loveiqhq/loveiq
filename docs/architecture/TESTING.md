# Testing Patterns

> **Last verified:** 2026-05-31 | **Verified against:** vitest.config.ts, playwright.config.ts, `__tests__/`, colocated `*/tests/`, e2e/ spec files

## Test Framework

**Runner:** Vitest 4.x
**Config:** `vitest.config.ts`

**Run Commands:**

```bash
npm test              # Run all tests once
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
```

## Test File Organization

**Convention:** tests are **colocated** with their source under a `tests/` folder. Cross-cutting suites live in `__tests__/`.

**Naming:** `*.test.ts` / `*.test.tsx`

**Structure:**

```text
features/<feature>/tests/      # Feature unit/component tests (survey, scoring, admin, checkout, …)
shared/<area>/tests/           # Shared-module tests (http, observability, url, emails, auth, …)
__tests__/                     # Cross-cutting suites
├── api/health.test.ts         # Health endpoint
├── app/                       # globals.css report theme + typography invariants
├── contracts/                 # Supabase schema/RPC contracts
├── data/                      # Generated report-*.ts integrity
├── integration/               # Payment-webhook idempotency, RLS boundary (npm run test:integration)
├── scripts/                   # Data-generation script tests
├── security/                  # Premium-content bundle leakage guard
├── __fixtures__/              # Shared test fixtures (MSW server, survey)
└── setup.ts                   # Global Vitest setup
```

## Test Structure

**Suite Organization:** `describe` blocks grouped by function/module, `it` blocks for individual cases.

**Patterns:**

- Test file colocated with source (e.g. `shared/http/csrf.ts` → `shared/http/tests/csrf.test.ts`)
- Edge cases and error paths are tested explicitly
- Security-relevant tests (XSS, injection) are included

## Mocking

**Framework:** Vitest built-in (`vi.fn()`, `vi.mock()`, `vi.stubGlobal()`)

**Patterns:**

- `vi.stubGlobal('fetch', ...)` for HTTP calls
- `vi.stubGlobal('window', ...)` for browser globals (analytics)
- Environment variables mocked via `vi.stubEnv()` or direct assignment
- External services (Supabase, Resend, Slack) mocked at the fetch level

## Coverage

**Provider:** V8
**Thresholds (vitest.config.ts):** lines 60% / statements 60% / functions 65% / branches 50%
**Scope:** `features/**/{server,logic}`, `features/**/client.ts`, `shared/**`, `app/api/**`, `proxy.ts` (admin + cron excluded)
**Report formats:** text, lcov

## Test Types

**Unit Tests:** Implemented for lib utilities and Zod schemas
**Integration Tests:** API route handler tests with mocked external services
**E2E Tests:** Playwright smoke tests for critical user flows

---

## E2E Tests (Playwright)

**Runner:** Playwright 1.58+
**Config:** `playwright.config.ts`

**Run Commands:**

```bash
npm run test:e2e           # Build prod + run all browser projects
npx playwright show-report # Open last HTML report
```

**Browser Projects:**

| Name            | Device          | Viewport |
| --------------- | --------------- | -------- |
| Desktop Chrome  | Desktop Chrome  | 1280×720 |
| Desktop Firefox | Desktop Firefox | 1280×720 |
| Desktop Safari  | Desktop Safari  | 1280×720 |
| Mobile Chrome   | Pixel 7         | 412×915  |
| Mobile Safari   | iPhone 15 Pro   | 393×852  |

**Test Files:**

```text
e2e/
├── smoke.spec.ts                # Landing, nav, footer, security headers, 404, API
├── navigation.spec.ts           # Desktop nav links + mobile hamburger
├── interactions.spec.ts         # FAQ accordion, CTA hrefs, footer links
├── pages.spec.ts                # Static routes: status 200 + title check
├── a11y.spec.ts                 # Accessibility audits via axe-core
├── admin.spec.ts                # Admin login + dashboard flows
├── survey.spec.ts               # Survey wizard end-to-end
├── report-pricing-modal.spec.ts # Report paywall pricing modal
└── visual-regression.spec.ts    # Screenshot diffs (the spec CI runs)
```

**Viewport breakpoints:**

- `sm` = 640px — hamburger hidden above this (`sm:hidden`)
- `lg` = 1024px — desktop nav links shown above this (`hidden lg:flex`)
- Desktop test skip: `test.skip(width < 1024, "desktop-only")`
- Mobile test skip: `test.skip(width >= 640, "mobile-only")`

**Viewport skip pattern:**

```typescript
test.beforeEach(async ({ page }) => {
  const width = page.viewportSize()?.width ?? 0;
  test.skip(width < 1024, "desktop-only");
  await page.goto("/");
});
```

**Web server config:**

- Uses production build: `npm run build && npm run start`
- `reuseExistingServer: !process.env.CI` — reuses running local server

**Pre-push hook rule:**
E2E tests must NOT be in pre-push hooks. Pre-push runs only `npm test` (Vitest). The full E2E suite (`npm run test:e2e`, 5 browser projects) is run locally.

**CI job:** `.github/workflows/visual-regression.yml` ("Playwright visual regression")

- Runs `npm run test:visual` (Chromium only) against `e2e/visual-regression.spec.ts`
- Installs Playwright Chromium and uploads the HTML report as an artifact

---

_Last updated: 2026-05-31_
