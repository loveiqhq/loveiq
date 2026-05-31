# ADR 0001 — Scoring engine_version stays "v4+v5" across config refreshes

- Status: Accepted
- Date: 2026-05-25
- Deciders: Eman
- Supersedes: —

## Context

The scoring engine has been through V7 → V8 → V9 versions of its CSV config
(gates, boosts, calibration, archetype names). Each refresh changes the
verdict but does not change the **engine architecture** — the same V4 softmax

- V5 independent-anchor code reads new numbers.

The `scoring_result.engine_version` text column was originally intended to
identify the engine code path. It currently stores `"v4+v5"` for every row
since the V5 path was added. Two downstream consumers depend on this exact
literal:

- `lib/admin/metric-library.ts:86` filters rows by `engine_version='v4+v5'`
- `app/api/admin/scoring/comparison/route.ts:79` does the same

If `engine_version` were bumped to `"v9"` on V9 cutover, those queries would
exclude every pre-V9 row, breaking historical dashboards.

## Decision

Keep `engine_version` at the literal `"v4+v5"` across all CSV-only config
refreshes (V7 → V8 → V9 → V10 → …). Bump it only when the engine code path
changes (e.g. adding a V6 architecture in parallel would become `"v4+v5+v6"`).

For per-row identification of the config that produced a verdict, use the
`scoring_result.config_sha` column added by F-03 (migration
`20260525120200_scoring_result_config_sha.sql`).

## Consequences

- Pro: existing admin dashboards keep working across config refreshes.
- Pro: `config_sha` provides finer-grained replay identity (CSV-byte-exact).
- Con: someone unfamiliar with this decision might bump `engine_version`
  expecting it to be the canonical "what changed" signal — hence this ADR.
- Migration: V9 cutover already happened under this rule; no backfill needed.

## Implementation

- `features/survey/server/server.ts` `storeScoringResult` writes both
  `engine_version: scoringResult.v5 ? "v4+v5" : "v4"` and
  `config_sha: getScoringConfigSha()` on every insert.
- `features/scoring/logic/config.ts` exports `getScoringConfigSha()` which
  hashes the compiled `ScoringConfig` JSON.
