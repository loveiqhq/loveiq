# Testing Patterns

> **Last verified:** 2026-03-15 | **Verified against:** vitest.config.ts, playwright.config.ts, **tests**/, e2e/ spec files

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

**Location:** `__tests__/` (mirrors source structure)

**Naming:** `*.test.ts`

**Structure:**

```
__tests__/
├── api/
│   ├── contact-validation.test.ts     # Contact form Zod schema tests
│   ├── admin-export.test.ts           # Admin CSV export tests
│   ├── admin-login.test.ts            # Admin login tests
│   ├── admin-stats.test.ts            # Admin dashboard stats tests
│   ├── admin-submission-detail.test.ts # Admin submission detail tests
│   ├── admin-submissions.test.ts      # Admin submission list tests
│   ├── admin-survey-status.test.ts    # Admin survey status tests
│   ├── admin-product-kpis.test.ts     # Admin product KPIs tests
│   ├── health.test.ts                 # Health check tests
│   ├── logout.test.ts                 # Logout tests
│   └── survey-tracking.test.ts        # Survey tracking tests
├── lib/
│   ├── analytics.test.ts             # GA4 event tracking tests
│   ├── csrf.test.ts                  # CSRF token verification tests
│   ├── csrf-body.test.ts             # CSRF body verification tests
│   ├── fetch-with-timeout.test.ts    # Fetch wrapper timeout tests
│   ├── ratelimit.test.ts             # IP extraction + rate limit tests
│   ├── ratelimit-full.test.ts        # Full rate limit flow tests
│   ├── circuit-breaker.test.ts       # Circuit breaker tests
│   ├── admin/auth.test.ts            # Admin auth tests
│   ├── scoring/                      # Scoring engine tests (32 tests)
│   └── emails/                       # Email template + XSS prevention tests
├── components/survey/hooks/          # Survey hook tests
├── proxy.test.ts                     # Middleware security header tests
└── fixtures/                         # Shared test data
```

## Test Structure

**Suite Organization:** `describe` blocks grouped by function/module, `it` blocks for individual cases.

**Patterns:**

- Test file mirrors source file path (`lib/csrf.ts` -> `__tests../shared/http/csrf.test.ts`)
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
**Thresholds:** Lines 60% (enforced in vitest.config.ts)
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
| Name | Device | Viewport |
|------|--------|----------|
| Desktop Chrome | Desktop Chrome | 1280×720 |
| Desktop Firefox | Desktop Firefox | 1280×720 |
| Desktop Safari | Desktop Safari | 1280×720 |
| Mobile Chrome | Pixel 7 | 412×915 |
| Mobile Safari | iPhone 15 Pro | 393×852 |

**Test Files:**

```
e2e/
├── smoke.spec.ts        # Landing, nav, footer, security headers, 404, API
├── navigation.spec.ts   # Desktop nav links + mobile hamburger
├── interactions.spec.ts # FAQ accordion, CTA hrefs, footer links
├── pages.spec.ts        # Static routes: status 200 + title check
└── a11y.spec.ts         # Accessibility audits via axe-core
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
E2E tests must NOT be in pre-push hooks. Pre-push runs only `npm test` (Vitest). E2E runs in CI via the `browser-tests` job in `.github/workflows/security.yml`.

**CI job:** `browser-tests` in `.github/workflows/security.yml`

- Installs engines: `npx playwright install --with-deps chromium firefox webkit`
- Uploads HTML report as artifact (14-day retention)

---

_Last updated: 2026-02-18_
