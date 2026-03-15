# e2e/

> For the full file listing, see the **Repo Map** in [CLAUDE.md](../CLAUDE.md).

## Purpose

End-to-end browser tests using Playwright. Tests run against a production build across 5 browser projects (Desktop Chrome/Firefox/Safari, Mobile Chrome, Mobile Safari).

## Key Conventions

- Run with `npm run test:e2e` (builds prod, starts server, runs all browsers).
- E2E tests belong in CI only, never in pre-push hooks (they take 3-6 minutes).
- Use `data-testid` attributes for stable selectors. When a locator matches multiple elements (e.g., nav links in desktop + mobile menus), use `.first()` or scope to a container.
- Test files are organized by concern: `smoke.spec.ts` (critical paths), `navigation.spec.ts`, `pages.spec.ts`, `interactions.spec.ts`, `a11y.spec.ts`, `admin.spec.ts`, `survey.spec.ts`, `visual-regression.spec.ts`.
