# Contributing to LoveIQ

> Owner: CODEOWNERS default
> Last verified: 2026-04-05
> Verified against: `package.json`, `.github/workflows/ci.yml`, `.github/pull_request_template.md`, `scripts/check-docs-impact.sh`

## Getting Started

```bash
npm run setup
npm run dev
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for env vars, troubleshooting, and local validation details.

## Branch and Review Workflow

1. Branch from `main`.
2. Make the smallest coherent change set you can.
3. Run `npm run check`.
4. Run `npm run docs:truth` when your change touches docs, API routes, env vars, scripts, or workflows.
5. Open a PR against `main`.
6. Complete the PR checklist truthfully. If high-risk code changed without markdown updates, check `No doc impact` explicitly.

The CI docs-impact gate blocks PRs that change `app/api`, `app/admin`, `components/admin`, `lib/admin`, `proxy.ts`, package/env files, or workflow/docs scripts without either markdown changes or a checked `No doc impact` box.

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add new admin benchmark filter
fix: correct survey cooldown handling
docs: update admin api reference
test: add route coverage for survey status
ci: tighten docs truth workflow
```

## Code Standards

- TypeScript strict mode stays enabled.
- Use the `@/` alias for cross-directory imports.
- Keep changes aligned with existing file and component patterns.
- Prefer `rg` for code and file search.
- Do not introduce secrets into tracked files.

## Testing Expectations

- Add or update tests when route behavior, validation, auth, or admin workflows change.
- Write route tests under `__tests__/api/`.
- Write shared utility tests under `__tests__/lib/`.
- Keep `npm run build` green for PR-ready changes.

## Documentation Expectations

Documentation is part of the change, not follow-up work.

Update markdown in the same PR when you change:

- public or admin API behavior
- env vars or operational prerequisites
- scripts or workflow behavior
- security controls, headers, CSRF, or rate limiting
- onboarding or contributor workflow

Canonical documentation targets:

- [README.md](README.md)
- [DEVELOPMENT.md](DEVELOPMENT.md)
- [SECURITY.md](SECURITY.md)
- [docs/api.md](docs/api.md)
- [docs/admin-api.md](docs/admin-api.md)
- [docs/versions.md](docs/versions.md)

## Security Expectations

- All mutating API routes must enforce CSRF.
- Rate limiting stays in place on write-heavy endpoints.
- Input validation remains explicit.
- Error messages stay generic unless the route intentionally exposes user-safe detail.
- If you touch `proxy.ts`, validate both development and production behavior.

See [SECURITY.md](SECURITY.md) and [.github/SECURITY_CHECKLIST.md](.github/SECURITY_CHECKLIST.md).
