# GitHub Configuration

> Owner: CODEOWNERS default
> Last verified: 2026-05-31
> Verified against: `.github/workflows/**`, `.github/pull_request_template.md`, `scripts/check-docs-impact.sh`, `scripts/check-docs-truth.mjs`

This directory contains GitHub-specific configuration files for CI/CD, security, and automation.

## Files

### `workflows/`

GitHub Actions workflow definitions.

#### `docs-truth.yml`

Source-driven documentation validation.

- Verifies markdown links across the canonical doc set (including `../../`- and absolute-prefixed targets, which are no longer skipped)
- Flags references to removed directory trees (`lib/`, `components/`, `.planning/`) and the dead `@/lib` / `@/components` import aliases
- Flags inline-link display text whose path no longer matches its target
- Verifies documented npm scripts and env vars against repo truth
- Verifies `docs/versions.md` against `package.json` and CI
- Verifies `docs/api.md` and `docs/admin-api.md` cover the live route inventory
- Runs markdownlint (`markdownlint-cli2`, config `.markdownlint-cli2.jsonc`) for structural correctness (code-fence languages, table integrity, bare URLs)
- Runs spellcheck (`cspell`, dictionary `.cspell/project-words.txt`) over documentation prose
- Runs Prettier against markdown files

> Historical snapshots under `docs/plans/` are exempt from the dead-tree/display-text checks (their prose intentionally records the repo state at creation time); their links are still validated. A single line can opt out with a `docs-truth-allow` marker.

#### `security.yml`

**Comprehensive security scanning workflow** that runs on push, PR, and weekly schedule.

Includes:

- **Secret Scanning** (TruffleHog) - Detects leaked credentials
- **SAST** (Semgrep + CodeQL) - Static analysis for vulnerabilities
- **Dependency Scanning** - npm audit + SBOM generation
- **Custom Security Rules** - Next.js/API route security patterns
- **Enhanced Linting** - Security-focused ESLint rules

**Duration:** ~10-15 minutes
**Schedule:** Every push, PR, and Monday 9am UTC

#### `codeql.yml`

**Advanced CodeQL analysis** for deep semantic code scanning.

- Detects complex security issues (injection, XSS, auth flaws)
- Uses `security-and-quality` query suite
- Runs on push, PR, and Tuesday 2:30am UTC

### `dependabot.yml`

**Automated dependency updates** via GitHub Dependabot.

- Weekly npm dependency updates (Mondays 9am UTC)
- Monthly GitHub Actions updates
- Groups minor/patch updates together
- Fails on high/critical vulnerabilities

### `SECURITY_CHECKLIST.md`

Developer checklist for security compliance when making changes.

### `pull_request_template.md`

Pull request contract for:

- summary and change list
- test declarations
- documentation impact declarations

## Security Results

View security findings in:

- **GitHub Security Tab** → Code scanning alerts
- **Pull Request Checks** → Security & Quality workflow
- **Actions Tab** → Workflow runs and artifacts (SBOM)

## Configuration Requirements

Enable these in **Settings → Code security and analysis**:

- ✅ GitHub Advanced Security (required for Security tab results)
- ✅ Dependabot alerts
- ✅ Dependabot security updates
- ✅ Code scanning (CodeQL)
- ✅ Secret scanning

## Maintenance

### Weekly

- Review security scan results from scheduled workflows
- Triage and address findings
- Merge Dependabot PRs after review
- Review docs truth failures or drift warnings if any fired during the week

### Monthly

- Update security rules if new patterns emerge
- Review ignored/suppressed findings
- Check for new Semgrep/CodeQL queries

### Quarterly

- Audit all security configurations
- Update this documentation
- Review and rotate secrets per `docs/runbooks/SECURITY.md`

## Documentation

- `../docs/runbooks/SECURITY.md` - Main security guide and incident response
- `../docs/runbooks/DEVELOPMENT.md` - Local setup, env vars, and validation
- `../docs/api.md` - Public API reference
- `../docs/admin-api.md` - Admin API reference
- `../docs/versions.md` - Pinned versions
- `SECURITY_CHECKLIST.md` - Developer security checklist

## Support

For issues with GitHub workflows:

1. Check workflow logs in Actions tab
2. Verify repository security settings are enabled
3. Review `SECURITY_CHECKLIST.md` for troubleshooting
4. Route unresolved issues to the repo owners in `.github/CODEOWNERS`
