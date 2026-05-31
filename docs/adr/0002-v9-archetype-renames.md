# ADR 0002 — V9 archetype display-name renames

- Status: Accepted
- Date: 2026-05-25 (decision date; cutover began 2026-05-14)
- Deciders: Eman + product
- Related: ADR 0001 (engine_version stability)

## Context

The V9 scoring workbook renamed three archetypes for product/marketing
reasons. The internal scoring math (bias values, prototype slots) is
unchanged — display-name change only.

| V8 name                 | V9 name             |
| ----------------------- | ------------------- |
| Approval Seeker         | Tender Devotee      |
| Power Orchestrator      | Authority Conductor |
| Exhibitionist Performer | Radiant Performer   |

The rename was not in the V9 workbook's changelog tab and was only discovered
during an `archetype_bias` diff against V8. Reports already in the field
contained the V8 names; the cutover therefore needed both:

1. New scoring rows produced under V9 to use the new names.
2. Old rows to be rewritten so historical admin dashboards remain consistent.

## Decision

Apply a one-time data rewrite migration (`20260514120000_v9_archetype_renames.sql`)
that updates `scoring_result.primary_archetype` + `v5_primary_archetype` +
JSONB columns (`percentages`, `raw_scores`, `diagnostics`, `v5_*`) via
`regexp_replace` on the JSONB cast to text.

Preserve backward compatibility for any existing report URLs by adding a
legacy alias map in `lib/report/archetypeSlug.ts` so old slugs still resolve.

Provide a paired rollback file in `supabase/rollbacks/` that reverses the
rename (kept outside `supabase/migrations/` so it is never auto-applied).

## Consequences

- Pro: admin dashboards, comparison charts, and report rendering all converge
  on a single set of names. No code-side alias layer needed in scoring.
- Pro: rollback is possible if a V9 archetype name turns out to break
  rendering in an unforeseen way.
- Con: the rewrite was not tested against a prod snapshot before staging
  cutover (a gap captured by F-14 in the residual-risk audit). The
  migration is idempotent so re-running on a partially-applied DB is safe,
  but a transactional partial failure would still need the rollback file.
- Con: `engine_version` does not change (see ADR 0001), so the rename is
  invisible to consumers filtering by engine version. Per-row identity is
  available via `config_sha` (F-03).

## Lessons

For any future high-risk migration of similar shape (data rewrite across
many rows + JSONB columns), run the forward + rollback pair against a
restored PITR snapshot before merging. See
`docs/runbooks/MIGRATION_ROLLBACK.md` § "Tested-against-prod-snapshot drill".
