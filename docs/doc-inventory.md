# Documentation Inventory

> Owner: CODEOWNERS default
> Last verified: 2026-05-31
> Verified against: tracked project docs under repo root, `docs/`, `.github/`, and area `AGENT_README.md` files

This inventory tracks the canonical project documentation set. It excludes tool-vendor instruction bundles under `.agents/`, `.claude/`, and `.codeium/`, which are maintained as assistant configuration assets rather than product or engineering source-of-truth docs.

## Root Docs

| Path              | Purpose                                      | Canonical scope                                   | Source of truth / dependencies                                                                 | Owner source |
| ----------------- | -------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------ |
| `README.md`       | Top-level overview and onboarding entrypoint | Repo overview, quick start, canonical doc links   | `package.json`, `.env.example`, `.github/workflows/ci.yml`, `app/api/**`, `proxy.ts`           | `CODEOWNERS` |
| `CONTRIBUTING.md` | Contributor workflow                         | Branching, validation, docs coupling, PR contract | `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `scripts/check-docs-impact.sh` | `CODEOWNERS` |
| `CLAUDE.md`       | Repo-local AI coding instructions            | Assistant behavior, repo conventions, env notes   | `package.json`, repo structure, security docs                                                  | `CODEOWNERS` |
| `FILE_INDEX.md`   | Task-based file lookup                       | High-signal file map for common engineering tasks | Repo structure under `app/`, `features/`, `shared/`, `scripts/`, `.github/workflows/`          | `CODEOWNERS` |

## docs/

| Path                                 | Purpose                                    | Canonical scope                                       | Source of truth / dependencies                                                                                                                   | Owner source |
| ------------------------------------ | ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `docs/api.md`                        | Public API reference                       | `/api/*` routes outside `/api/admin/*`                | `app/api/**/route.ts`                                                                                                                            | `CODEOWNERS` |
| `docs/survey.md`                     | Survey flow reference                      | `/survey` runtime, persistence, autosave, recovery    | `app/survey/page.tsx`, `features/survey/ui/**`, `app/api/survey/route.ts`, `app/api/survey-partial/route.ts`, `app/api/survey-tracking/route.ts` | `CODEOWNERS` |
| `docs/admin-api.md`                  | Admin API reference                        | `/api/admin/*` route inventory and access notes       | `app/api/admin/**/route.ts`, `features/admin/server/roles.ts`                                                                                    | `CODEOWNERS` |
| `docs/admin-dashboard.md`            | Admin shell and dashboard reference        | `/admin` shell, navigation, command center, stats     | `app/admin/**`, `features/admin/ui/**`, `app/api/admin/{os,stats,actions}/**`                                                                    | `CODEOWNERS` |
| `docs/admin/AGENT_README.md`         | Admin lookup router                        | Admin cross-root code discovery                       | `app/admin/AGENT_README.md`, `app/api/admin/AGENT_README.md`, `features/admin/ui/AGENT_README.md`, `features/admin/server/AGENT_README.md`       | `CODEOWNERS` |
| `docs/admin/domains/AGENT_README.md` | Admin domain router                        | Admin task-to-domain entrypoint                       | `docs/admin/domains/*.md`                                                                                                                        | `CODEOWNERS` |
| `docs/admin/domains/submissions.md`  | Submissions domain map                     | Submission review, moderation, exports, survey status | `app/admin/submissions/**`, `app/api/admin/{submissions,export,export-presets,survey-status,comments,tags,tag-rules}/**`, `features/admin/ui/**` | `CODEOWNERS` |
| `docs/versions.md`                   | Single source of truth for pinned versions | Runtime, framework, and test-tool versions            | `package.json`, `.github/workflows/ci.yml`                                                                                                       | `CODEOWNERS` |
| `docs/doc-inventory.md`              | Canonical doc inventory                    | Project doc ownership and scope map                   | Tracked markdown files, `.github/CODEOWNERS`                                                                                                     | `CODEOWNERS` |
| `docs/knowledge-ledger.md`           | Verified doc-memory ledger                 | Material facts learned and where they were recorded   | Updated docs plus evidence paths listed per entry                                                                                                | `CODEOWNERS` |
| `docs/AI_ASSISTANT_CONFIG.md`        | AI tool configuration reference            | Repo-local assistant config files and maintenance     | `CLAUDE.md`, `.github/copilot-instructions.md`, editor config files                                                                              | `CODEOWNERS` |
| `docs/AGENT_README.md`               | Directory index                            | What belongs in `docs/`                               | Files under `docs/`                                                                                                                              | `CODEOWNERS` |
| `docs/adr/*.md`                      | Architecture Decision Records              | Engine-version stability, V9 renames, CSRF sendBeacon | Referenced source files per ADR                                                                                                                  | `CODEOWNERS` |
| `docs/plans/*.md`                    | Historical implementation handoffs         | Planning snapshots (not current canonical guidance)   | Repo state at creation time                                                                                                                      | `CODEOWNERS` |

## docs/architecture/

| Path                                          | Purpose                               | Source of truth / dependencies                                                         | Owner source |
| --------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------- | ------------ |
| `docs/architecture/ARCHITECTURE.md`           | Architecture reference                | `app/`, `features/`, `shared/`, `package.json`                                         | `CODEOWNERS` |
| `docs/architecture/STACK.md`                  | Stack summary                         | `package.json`, `docs/versions.md`                                                     | `CODEOWNERS` |
| `docs/architecture/STRUCTURE.md`              | Repo structure reference              | Current tracked source tree                                                            | `CODEOWNERS` |
| `docs/architecture/CONVENTIONS.md`            | Coding conventions                    | Source tree and repo standards                                                         | `CODEOWNERS` |
| `docs/architecture/INTEGRATIONS.md`           | External integration reference        | `app/api/**`, `shared/**`, `features/**`, env vars                                     | `CODEOWNERS` |
| `docs/architecture/TESTING.md`                | Testing reference                     | `vitest.config.ts`, `playwright.config.ts`, `__tests__/`, colocated `*/tests/`, `e2e/` | `CODEOWNERS` |
| `docs/architecture/CONCERNS.md`               | Known risk areas                      | Current codebase risk areas                                                            | `CODEOWNERS` |
| `docs/architecture/AGENTS.md`                 | Sub-agent system definitions          | Agent prompts/tools; repo conventions                                                  | `CODEOWNERS` |
| `docs/architecture/AGENT_README-planning.md`  | Directory index for architecture docs | Files under `docs/architecture/`                                                       | `CODEOWNERS` |
| `docs/architecture/AI_OPTIMIZATION_PROMPT.md` | AI optimization reference             | Planning conventions                                                                   | `CODEOWNERS` |

## docs/runbooks/

| Path                                  | Purpose                         | Source of truth / dependencies                                                                                  | Owner source |
| ------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------ |
| `docs/runbooks/DEVELOPMENT.md`        | Local setup and troubleshooting | `package.json`, `.env.example`, `.github/workflows/ci.yml`, `proxy.ts`, `app/api/**`                            | `CODEOWNERS` |
| `docs/runbooks/SECURITY.md`           | Security policy and operations  | `.env.example`, `proxy.ts`, `shared/http/csrf.ts`, `shared/http/ratelimit.ts`, `.github/workflows/security.yml` | `CODEOWNERS` |
| `docs/runbooks/SECURITY_AUDIT.md`     | Security audit snapshot         | Security posture at audit time                                                                                  | `CODEOWNERS` |
| `docs/runbooks/DISASTER_RECOVERY.md`  | Disaster recovery runbook       | Supabase backups, deploy/rollback procedures                                                                    | `CODEOWNERS` |
| `docs/runbooks/MIGRATION_ROLLBACK.md` | Migration rollback runbook      | `supabase/migrations/`, `supabase/ROLLBACK.md`                                                                  | `CODEOWNERS` |

## docs/compliance/

| Path                              | Purpose                | Source of truth / dependencies | Owner source |
| --------------------------------- | ---------------------- | ------------------------------ | ------------ |
| `docs/compliance/DPIA.md`         | Data protection impact | Data flows, Supabase tables    | `CODEOWNERS` |
| `docs/compliance/LAWFUL_BASIS.md` | Lawful basis record    | Processing activities          | `CODEOWNERS` |
| `docs/compliance/ROPA.md`         | Records of processing  | Data inventory                 | `CODEOWNERS` |

## .github/

| Path                                        | Purpose                      | Source of truth / dependencies                                                                           | Owner source |
| ------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- | ------------ |
| `.github/README.md`                         | GitHub automation overview   | `.github/workflows/**`, `scripts/check-docs-impact.sh`, `scripts/check-docs-truth.mjs`                   | `CODEOWNERS` |
| `.github/AGENT_README.md`                   | Directory index              | Files under `.github/`                                                                                   | `CODEOWNERS` |
| `.github/SECURITY_CHECKLIST.md`             | Developer security checklist | `docs/runbooks/SECURITY.md`, `proxy.ts`, `shared/http/csrf.ts`, `shared/http/ratelimit.ts`, `app/api/**` | `CODEOWNERS` |
| `.github/SECURITY_QUICK_REFERENCE.md`       | Security quick reference     | `docs/runbooks/SECURITY.md`, security workflows                                                          | `CODEOWNERS` |
| `.github/INCIDENT_RESPONSE_AGENT.md`        | Incident response playbook   | `docs/runbooks/SECURITY.md`, security workflows                                                          | `CODEOWNERS` |
| `.github/copilot-instructions.md`           | Copilot configuration        | `CLAUDE.md`, repo conventions, security docs                                                             | `CODEOWNERS` |
| `.github/pull_request_template.md`          | PR contract                  | `.github/workflows/ci.yml`, `scripts/check-docs-impact.sh`                                               | `CODEOWNERS` |
| `.github/ISSUE_TEMPLATE/bug_report.md`      | Issue intake template        | GitHub issue workflow                                                                                    | `CODEOWNERS` |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Issue intake template        | GitHub issue workflow                                                                                    | `CODEOWNERS` |

## Area Index Docs (`AGENT_README.md`)

These directory-index files describe what belongs in each area and are verified against the live tree.

| Path                                    | Describes                                                                                                                                                           |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/AGENT_README.md`                   | `app/` (routes + API handlers)                                                                                                                                      |
| `app/admin/AGENT_README.md`             | `app/admin/` (admin page routes)                                                                                                                                    |
| `app/api/admin/AGENT_README.md`         | `app/api/admin/` (admin API handlers)                                                                                                                               |
| `features/AGENT_README.md`              | `features/` (domain feature folders)                                                                                                                                |
| `features/<feature>/AGENT_README.md`    | each feature (about, admin, analytics, checkout, contact, cron, glossary, invite, landing, legal, not-found, pricing, report, scoring, staging, survey, trust-zone) |
| `features/admin/ui/AGENT_README.md`     | `features/admin/ui/` (admin dashboards)                                                                                                                             |
| `features/admin/server/AGENT_README.md` | `features/admin/server/` (admin logic)                                                                                                                              |
| `shared/AGENT_README.md`                | `shared/` (cross-cutting infrastructure)                                                                                                                            |
| `shared/<area>/AGENT_README.md`         | each shared area (auth, emails, format, http, observability, url)                                                                                                   |
| `data/AGENT_README.md`                  | `data/` (static + generated data)                                                                                                                                   |
| `scripts/AGENT_README.md`               | `scripts/` (build/data scripts)                                                                                                                                     |
| `supabase/AGENT_README.md`              | `supabase/` (migrations + config)                                                                                                                                   |
| `public/AGENT_README.md`                | `public/` (static assets)                                                                                                                                           |
| `e2e/AGENT_README.md`                   | `e2e/` (Playwright specs)                                                                                                                                           |
| `load-tests/AGENT_README.md`            | `load-tests/` (k6 scripts)                                                                                                                                          |
| `__tests__/AGENT_README.md`             | `__tests__/` (cross-cutting tests)                                                                                                                                  |
