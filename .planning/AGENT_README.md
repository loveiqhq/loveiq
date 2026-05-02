# .planning/

Architecture documentation and planning artifacts. Not shipped; for developers and AI agents.

## What belongs here

- Architecture decision records
- Codebase documentation (conventions, stack, integrations)
- Historical planning prompts and optimization notes

## What does NOT belong here

- Executable code → use `app/`, `lib/`, `scripts/`
- CI/CD configuration → use `.github/`

## Subdirectory map

| Directory/File              | Contents                                                           |
| --------------------------- | ------------------------------------------------------------------ |
| `codebase/ARCHITECTURE.md`  | System architecture overview (start here for system understanding) |
| `codebase/CONVENTIONS.md`   | Coding conventions and patterns                                    |
| `codebase/STACK.md`         | Technology stack reference                                         |
| `codebase/INTEGRATIONS.md`  | Third-party integration details                                    |
| `codebase/TESTING.md`       | Full E2E and unit test reference                                   |
| `codebase/STRUCTURE.md`     | Directory structure documentation                                  |
| `codebase/CONCERNS.md`      | Known concerns and trade-offs                                      |
| `AGENTS.md`                 | Sub-agent system definitions (7 agents with prompts and tools)     |
| `AI_OPTIMIZATION_PROMPT.md` | Original AI repository optimization prompt                         |
