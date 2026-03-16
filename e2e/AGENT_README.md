# e2e/

End-to-end browser tests using Playwright. Tests run against a production build across 5 browser projects (Desktop Chrome/Firefox/Safari, Mobile Chrome, Mobile Safari).

## Key Conventions

- Run with `npm run test:e2e` (builds prod, starts server, runs all browsers).
- E2E tests belong in CI only, never in pre-push hooks (they take 3-6 minutes).
- Use `data-testid` attributes for stable selectors. When a locator matches multiple elements (e.g., nav links in desktop + mobile menus), use `.first()` or scope to a container.

## Test Files

| File                        | Scope                                      |
| --------------------------- | ------------------------------------------ |
| `smoke.spec.ts`             | Critical paths (homepage loads, nav works) |
| `navigation.spec.ts`        | All navigation links and routing           |
| `pages.spec.ts`             | Page content and metadata                  |
| `interactions.spec.ts`      | Forms, buttons, interactive elements       |
| `a11y.spec.ts`              | Accessibility (axe-core WCAG checks)       |
| `admin.spec.ts`             | Admin panel flows                          |
| `survey.spec.ts`            | Survey wizard flow                         |
| `visual-regression.spec.ts` | Screenshot comparison tests                |
