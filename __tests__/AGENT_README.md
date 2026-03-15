# **tests**/

> For the full file listing, see the **Repo Map** in [CLAUDE.md](../CLAUDE.md).

## Purpose

Unit tests (Vitest) that mirror the source directory structure: `api/` for route handlers, `components/` for React components, `lib/` for utilities, plus `proxy.test.ts` for middleware.

## Key Conventions

- Run with `npm test` (once), `npm run test:watch` (watch mode), or `npm run test:coverage` (with coverage).
- `setup.ts` contains global Vitest setup (mocks, env vars). New global mocks go there.
- Test file paths mirror source paths: e.g., `lib/scoring/engine.ts` is tested in `__tests__/lib/scoring/engine.test.ts`.
