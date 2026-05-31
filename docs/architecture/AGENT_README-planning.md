# docs/architecture/

Architecture documentation and planning artifacts. Not shipped; for developers and AI agents.
(Previously the planning tree; moved here during the docs consolidation.)

## What belongs here

- Architecture overview and decision context
- Codebase documentation (conventions, stack, integrations, structure, testing, concerns)
- Sub-agent system definitions and historical optimization notes

## What does NOT belong here

- Executable code → use `app/`, `shared/`, `features/`, `scripts/`
- CI/CD configuration → use `.github/`
- Runbooks (setup, security, recovery) → use `docs/runbooks/`
- Architecture Decision Records → use `docs/adr/`

## File map

| File                        | Contents                                                           |
| --------------------------- | ------------------------------------------------------------------ |
| `ARCHITECTURE.md`           | System architecture overview (start here for system understanding) |
| `CONVENTIONS.md`            | Coding conventions and patterns                                    |
| `STACK.md`                  | Technology stack reference                                         |
| `INTEGRATIONS.md`           | Third-party integration details                                    |
| `TESTING.md`                | Full E2E and unit test reference                                   |
| `STRUCTURE.md`              | Directory structure documentation                                  |
| `CONCERNS.md`               | Known concerns and trade-offs                                      |
| `AGENTS.md`                 | Sub-agent system definitions (7 agents with prompts and tools)     |
| `AI_OPTIMIZATION_PROMPT.md` | Original AI repository optimization prompt                         |
