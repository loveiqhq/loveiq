# lib/

> For the full file listing, see the **Repo Map** in [CLAUDE.md](../CLAUDE.md).

## Purpose

Runtime utilities and server-side logic shared across API routes and components, including security (CSRF, rate limiting), external service integrations, email templates, and the scoring engine.

## Key Conventions

- All Supabase access is via REST API -- no direct database client. See `admin/supabase.ts` for the fetch helper pattern.
- `lib/scoring/` is the V3 archetype scoring engine. Its config is auto-generated from CSVs in `data/scoring-config/` via `node scripts/update-scoring-config.js`. Do not hand-edit `data/scoring-config.ts`.
