# components/

> For the full file listing, see the **Repo Map** in [CLAUDE.md](../CLAUDE.md).

## Purpose

All React UI components, organized by page/feature in subdirectories (e.g., `landing/`, `about/`, `survey/`, `admin/`).

## Key Conventions

- Landing sections are numbered `S01Hero.tsx` through `S14CTA.tsx`. To add a new section, create `S##NewName.tsx` and import it in `LandingPage.tsx` in order.
- Root-level files (`NonceProvider.tsx`, `HydrationMarker.tsx`, `SmoothScroll.tsx`) are cross-cutting utilities used by the root layout. Page-specific components always go in a subdirectory.
