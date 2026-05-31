# docs/

Human-readable developer documentation. Architecture references live in `architecture/`, operational runbooks in `runbooks/`, decision records in `adr/`, compliance docs in `compliance/`, and historical handoffs in `plans/`.

## Files

| File                     | Purpose                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| `api.md`                 | Public API reference for `/api/*` routes.                                                           |
| `survey.md`              | Survey runtime, persistence, autosave, and recovery reference.                                      |
| `admin-api.md`           | Admin API catalog for `/api/admin/*` routes.                                                        |
| `admin-dashboard.md`     | Admin shell, command center, and stats dashboard reference.                                         |
| `admin/AGENT_README.md`  | Admin-local documentation router for cross-root code lookup.                                        |
| `versions.md`            | Single source of truth for pinned toolchain and framework versions.                                 |
| `doc-inventory.md`       | Inventory of the canonical project documentation set.                                               |
| `knowledge-ledger.md`    | Record of verified documentation updates and why they mattered.                                     |
| `AI_ASSISTANT_CONFIG.md` | Multi-assistant configuration guide for repo-local AI tools.                                        |
| `architecture/`          | System architecture, stack, conventions, structure, testing, concerns, sub-agents.                  |
| `runbooks/`              | Operational runbooks: development, security, security audit, disaster recovery, migration rollback. |
| `compliance/`            | DPIA, lawful basis, and ROPA records.                                                               |
| `adr/`                   | Architecture Decision Records.                                                                      |
| `admin/`                 | Admin domain router + per-domain maps.                                                              |
| `plans/`                 | Historical implementation handoffs (snapshots).                                                     |
