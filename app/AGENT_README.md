# app/

> For the full file listing, see the **Repo Map** in [CLAUDE.md](../CLAUDE.md).

## Purpose

Next.js App Router directory containing all pages (`page.tsx`) and API routes (`app/api/<name>/route.ts`), plus root layout, global CSS, and Next.js special files (`robots.ts`, `sitemap.ts`).

## Key Conventions

- Pages are thin wrappers that import their content from `components/<page-name>/`. Keep business logic and UI out of `app/` files.
- All new API routes must include CSRF verification, rate limiting, and Zod validation. Use `app/api/waitlist/route.ts` as the canonical reference.
- Legal pages follow a flat structure: `app/{legal-slug}/page.tsx`.
