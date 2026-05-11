#!/usr/bin/env bash
# Run every CI check locally before pushing.
#
# Mirrors all 10 GitHub workflows in .github/workflows/:
#   - ci.yml                 → lint, format, typecheck, test+coverage, integration, build, docs-impact
#   - security.yml           → secret scan, SAST, deps audit, SBOM, OSV, security-lint, custom rules
#   - codeql.yml             → CodeQL (GH-only — skipped with note)
#   - docs-truth.yml         → docs:truth
#   - lighthouse.yml         → @lhci/cli autorun (requires booted server — skipped by default)
#   - health-monitor.yml     → /api/health curl (requires running server — skipped by default)
#   - visual-regression.yml  → Playwright snapshot diff (heavy — opt-in via FULL=1)
#   - load-test.yml          → k6 smoke (requires running server — opt-in via FULL=1)
#   - release.yml            → GH-only tag pipeline — not mirrored
#   - slack-commits.yml      → GH-only Slack post — not mirrored
#
# Binary-dependent tools (trufflehog, semgrep, osv-scanner, k6, lhci, codeql) are
# detected; when missing, the step is SKIPPED with an install hint and the run
# continues. Required failures (lint/typecheck/test/build/docs/security-grep)
# always block.
#
# Usage:
#   bash scripts/ci-local.sh           # default — runs everything that's quick + safe
#   FULL=1 bash scripts/ci-local.sh    # also runs lighthouse, k6, visual regression (slow, needs running server)
#   QUICK=1 bash scripts/ci-local.sh   # only the always-required gates: lint, typecheck, test, build
#
# Exit codes:
#   0  → every required gate passed
#   1+ → first required failure; binary-skipped steps never cause failures

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ─── helpers ───────────────────────────────────────────────────────────────
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
SKIP_REASONS=()
FAIL_STEPS=()

step() {
  echo
  echo "──────────────────────────────────────────"
  echo " $1"
  echo "──────────────────────────────────────────"
}

run_required() {
  local label="$1"; shift
  step "$label"
  if "$@"; then
    PASS_COUNT=$((PASS_COUNT+1))
  else
    FAIL_COUNT=$((FAIL_COUNT+1))
    FAIL_STEPS+=("$label")
    echo
    echo "❌ Required step failed: $label"
    echo "   Stopping run. Fix this before continuing."
    summarize
    exit 1
  fi
}

skip_with_reason() {
  local label="$1"
  local reason="$2"
  echo
  echo "──────────────────────────────────────────"
  echo " $label"
  echo "──────────────────────────────────────────"
  echo "⏭  SKIPPED — $reason"
  SKIP_COUNT=$((SKIP_COUNT+1))
  SKIP_REASONS+=("$label: $reason")
}

has_cmd() { command -v "$1" >/dev/null 2>&1; }

summarize() {
  echo
  echo "══════════════════════════════════════════"
  echo " CI-LOCAL SUMMARY"
  echo "══════════════════════════════════════════"
  echo " ✅ Passed:  $PASS_COUNT"
  echo " ❌ Failed:  $FAIL_COUNT"
  echo " ⏭  Skipped: $SKIP_COUNT"
  if [ "$SKIP_COUNT" -gt 0 ]; then
    echo
    echo " Skipped steps:"
    for r in "${SKIP_REASONS[@]}"; do echo "   • $r"; done
  fi
  if [ "$FAIL_COUNT" -gt 0 ]; then
    echo
    echo " Failed steps:"
    for f in "${FAIL_STEPS[@]}"; do echo "   • $f"; done
  fi
  echo "══════════════════════════════════════════"
}

QUICK="${QUICK:-0}"
FULL="${FULL:-0}"

# ─── ci.yml ────────────────────────────────────────────────────────────────
run_required "ci.yml › ESLint"                       npm run lint
run_required "ci.yml › Prettier (check)"             npx prettier --check .
run_required "ci.yml › TypeScript (tsc --noEmit)"    npx tsc --noEmit

if [ "$QUICK" = "1" ]; then
  run_required "ci.yml › Unit tests"                 npm test
else
  run_required "ci.yml › Unit tests with coverage"   npm run test:coverage
fi

# Integration test — skips silently inside vitest when SUPABASE_TEST_URL absent.
run_required "ci.yml › Integration tests (skip if no test DB)" npm run test:integration

run_required "ci.yml › Production build" bash -c '
  NEXT_PUBLIC_SITE_URL=https://www.loveiq.org \
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY=dummy \
  npm run build
'

# ─── docs-truth.yml ────────────────────────────────────────────────────────
run_required "docs-truth.yml › Docs truth"           npm run docs:truth
run_required "docs-truth.yml › Markdown prettier"    bash -c 'npx prettier --check "**/*.md"'

# ─── security.yml › dependency-scan ────────────────────────────────────────
step "security.yml › npm audit (high+)"
if npm audit --audit-level=high; then
  PASS_COUNT=$((PASS_COUNT+1))
else
  echo "❌ Required step failed: npm audit"
  FAIL_COUNT=$((FAIL_COUNT+1))
  FAIL_STEPS+=("security.yml › npm audit")
  summarize
  exit 1
fi

step "security.yml › SBOM (CycloneDX)"
# --ignore-npm-errors tolerates lockfile/node_modules drift on dev machines.
# In CI, fresh `npm ci` makes this unnecessary, but the flag is safe either way.
if npx --yes @cyclonedx/cyclonedx-npm --ignore-npm-errors --output-file sbom.json; then
  echo "✅ sbom.json generated"
  PASS_COUNT=$((PASS_COUNT+1))
else
  echo "⚠  CycloneDX failed (non-blocking — re-run after \`npm ci\` if it persists)"
  SKIP_COUNT=$((SKIP_COUNT+1))
  SKIP_REASONS+=("security.yml › SBOM: cyclonedx exited non-zero")
fi

if has_cmd osv-scanner; then
  run_required "security.yml › OSV scanner" osv-scanner --config=.osv-scanner.toml --lockfile=package-lock.json
else
  skip_with_reason "security.yml › OSV scanner" "osv-scanner not in PATH. Install: https://github.com/google/osv-scanner/releases"
fi

# ─── security.yml › secret-scan ────────────────────────────────────────────
if has_cmd trufflehog; then
  run_required "security.yml › TruffleHog" bash -c 'trufflehog filesystem . --only-verified --no-update'
else
  skip_with_reason "security.yml › TruffleHog" "trufflehog not in PATH. Install: https://github.com/trufflesecurity/trufflehog#installation"
fi

# ─── security.yml › sast-semgrep ───────────────────────────────────────────
if has_cmd semgrep; then
  # Match CI behaviour (security.yml › sast-semgrep): scanner runs and reports
  # findings, but is advisory-only (no --error). SARIF upload is gated behind
  # GitHub Advanced Security and currently disabled. Findings are visible in
  # the output below but never block.
  step "security.yml › Semgrep (advisory)"
  if semgrep scan \
      --config p/security-audit \
      --config p/owasp-top-ten \
      --config p/nodejs \
      --config p/typescript \
      --config p/nextjs \
      --no-rewrite-rule-ids 2>&1; then
    PASS_COUNT=$((PASS_COUNT+1))
    echo "✅ Semgrep run completed (review findings above; advisory-only)"
  else
    SKIP_COUNT=$((SKIP_COUNT+1))
    SKIP_REASONS+=("security.yml › Semgrep: findings reported (advisory-only; review output)")
  fi
elif has_cmd docker; then
  skip_with_reason "security.yml › Semgrep" "semgrep CLI not in PATH. To run via Docker: docker run --rm -v \"$(pwd):/src\" semgrep/semgrep:1.116.0 semgrep scan --config auto --error"
else
  skip_with_reason "security.yml › Semgrep" "semgrep + docker both absent. Install: pip install semgrep"
fi

# ─── codeql.yml ────────────────────────────────────────────────────────────
skip_with_reason "codeql.yml › CodeQL Analysis" "GitHub-only — runs on Tuesdays 02:30 UTC. CodeQL CLI is heavy; rely on the scheduled GH job."

# ─── security.yml › nextjs-security ────────────────────────────────────────
step "security.yml › dangerouslySetInnerHTML scan"
if grep -r "dangerouslySetInnerHTML" app/ components/ --include="*.tsx" --include="*.jsx" \
    | grep -v "JSON\.stringify" \
    | grep -vE "components/report/(sections/|ReportPage\.tsx)"; then
  echo "❌ Unauthorized dangerouslySetInnerHTML usage"
  FAIL_COUNT=$((FAIL_COUNT+1))
  FAIL_STEPS+=("security.yml › dangerouslySetInnerHTML")
  summarize
  exit 1
fi
echo "✅ Clean"
PASS_COUNT=$((PASS_COUNT+1))

step "security.yml › eval() scan"
if grep -r "\beval\(" app/ lib/ components/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null; then
  echo "❌ eval() usage detected"
  FAIL_COUNT=$((FAIL_COUNT+1))
  FAIL_STEPS+=("security.yml › eval()")
  summarize
  exit 1
fi
echo "✅ Clean"
PASS_COUNT=$((PASS_COUNT+1))

step "security.yml › hardcoded secret pattern scan"
if grep -rE "(api[_-]?key|api[_-]?secret|password|secret[_-]?key|private[_-]?key|token)\s*=\s*['\"][^'\"]{20,}" app/ lib/ --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null; then
  echo "❌ Possible hardcoded secret"
  FAIL_COUNT=$((FAIL_COUNT+1))
  FAIL_STEPS+=("security.yml › hardcoded secret")
  summarize
  exit 1
fi
echo "✅ Clean"
PASS_COUNT=$((PASS_COUNT+1))

step "security.yml › build output secret leak scan (.next/)"
if [ -d ".next" ]; then
  if grep -rE "(SUPABASE_SERVICE_ROLE_KEY|RESEND_API_KEY|RECAPTCHA_SECRET_KEY)\s*[:=]\s*['\"]?[a-zA-Z0-9_-]{20,}" .next/ 2>/dev/null | grep -v "process.env" | grep -v "undefined"; then
    echo "❌ Actual secrets found in .next/"
    FAIL_COUNT=$((FAIL_COUNT+1))
    FAIL_STEPS+=("security.yml › build output secret leak")
    summarize
    exit 1
  fi
  echo "✅ Clean"
  PASS_COUNT=$((PASS_COUNT+1))
else
  skip_with_reason "security.yml › build output secret leak" ".next/ missing — build above must succeed first"
fi

# ─── security.yml › custom-security-rules ──────────────────────────────────
step "security.yml › CSRF on mutating routes"
for file in $(find app/api -name 'route.ts' \
    -not -path "*/staging-*" \
    -not -path "*/stripe/webhook/*" \
    -not -path "*/resend/webhook/*" \
    -not -path "*/unsubscribe/*" \
    2>/dev/null); do
  if [ -f "$file" ] && grep -q "export.*POST\|export.*PUT\|export.*DELETE\|export.*PATCH" "$file"; then
    if ! grep -q "verifyCsrfToken" "$file"; then
      echo "❌ $file missing CSRF verification"
      FAIL_COUNT=$((FAIL_COUNT+1))
      FAIL_STEPS+=("security.yml › CSRF: $file")
      summarize
      exit 1
    fi
  fi
done
echo "✅ All mutating routes verify CSRF"
PASS_COUNT=$((PASS_COUNT+1))

step "security.yml › Rate limiting on POST routes"
for file in $(find app/api -name 'route.ts' \
    -not -path "*/staging-*" \
    -not -path "*/stripe/webhook/*" \
    -not -path "*/resend/webhook/*" \
    -not -path "*/unsubscribe/*" \
    2>/dev/null); do
  if [ -f "$file" ] && grep -q "export.*POST" "$file"; then
    if ! grep -q "checkRateLimit" "$file"; then
      echo "❌ $file missing rate limiting"
      FAIL_COUNT=$((FAIL_COUNT+1))
      FAIL_STEPS+=("security.yml › Rate limit: $file")
      summarize
      exit 1
    fi
  fi
done
echo "✅ All POST routes rate-limited"
PASS_COUNT=$((PASS_COUNT+1))

step "security.yml › Zod validation on POST/PUT routes"
for file in $(find app/api -name 'route.ts' \
    -not -path "*/staging-*" \
    -not -path "*/stripe/webhook/*" \
    -not -path "*/resend/webhook/*" \
    -not -path "*/unsubscribe/*" \
    -not -path "*/admin/logout/*" \
    2>/dev/null); do
  if [ -f "$file" ] && grep -q "export.*POST\|export.*PUT" "$file"; then
    if ! grep -q "z\.object\|zod" "$file"; then
      echo "❌ $file missing Zod validation"
      FAIL_COUNT=$((FAIL_COUNT+1))
      FAIL_STEPS+=("security.yml › Zod: $file")
      summarize
      exit 1
    fi
  fi
done
echo "✅ All POST/PUT routes validate with Zod"
PASS_COUNT=$((PASS_COUNT+1))

step "security.yml › process.env in client components"
if grep -r "process\.env\." app/ components/ --include="*.tsx" --include="*.jsx" | grep -v "NEXT_PUBLIC_" | grep -v "^Binary"; then
  echo "⚠  Direct process.env in client components (non-NEXT_PUBLIC) — review above"
  # Workflow only warns, doesn't fail. Mirror that.
  SKIP_COUNT=$((SKIP_COUNT+1))
  SKIP_REASONS+=("security.yml › client process.env: warning only — see output above")
else
  echo "✅ Clean"
  PASS_COUNT=$((PASS_COUNT+1))
fi

step "security.yml › Required security headers in proxy.ts"
if [ ! -f "proxy.ts" ]; then
  echo "❌ proxy.ts not found!"
  FAIL_COUNT=$((FAIL_COUNT+1))
  FAIL_STEPS+=("security.yml › proxy.ts missing")
  summarize
  exit 1
fi
for header in "Content-Security-Policy" "X-Frame-Options" "X-Content-Type-Options" "Strict-Transport-Security"; do
  if ! grep -q "$header" proxy.ts; then
    echo "❌ Missing security header: $header"
    FAIL_COUNT=$((FAIL_COUNT+1))
    FAIL_STEPS+=("security.yml › missing $header")
    summarize
    exit 1
  fi
done
echo "✅ All required headers present"
PASS_COUNT=$((PASS_COUNT+1))

# ─── lighthouse.yml ────────────────────────────────────────────────────────
if [ "$FULL" = "1" ] || has_cmd lhci; then
  if has_cmd lhci || npx --no-install lhci --version >/dev/null 2>&1; then
    step "lighthouse.yml › @lhci/cli autorun"
    echo "ℹ  Requires a running server on :3000 (npm run dev or npm start)"
    if npx @lhci/cli@latest autorun --config=lighthouserc.json; then
      PASS_COUNT=$((PASS_COUNT+1))
    else
      echo "⚠  Lighthouse failed (non-blocking locally)"
      SKIP_COUNT=$((SKIP_COUNT+1))
      SKIP_REASONS+=("lighthouse.yml: assertions failed — see logs above")
    fi
  fi
else
  skip_with_reason "lighthouse.yml › @lhci/cli" "set FULL=1 to run; needs a booted server on :3000"
fi

# ─── load-test.yml ─────────────────────────────────────────────────────────
if [ "$FULL" = "1" ]; then
  if has_cmd k6; then
    BASE_URL="${BASE_URL:-http://localhost:3000}"
    step "load-test.yml › k6 smoke against $BASE_URL"
    if k6 run -e BASE_URL="$BASE_URL" load-tests/smoke.js; then
      PASS_COUNT=$((PASS_COUNT+1))
    else
      echo "⚠  k6 thresholds failed"
      SKIP_COUNT=$((SKIP_COUNT+1))
      SKIP_REASONS+=("load-test.yml: k6 thresholds breached")
    fi
  else
    skip_with_reason "load-test.yml › k6 smoke" "k6 not in PATH. Install: https://k6.io/docs/getting-started/installation"
  fi
else
  skip_with_reason "load-test.yml › k6 smoke" "set FULL=1 to run; needs k6 + booted server (defaults to localhost:3000, override with BASE_URL=)"
fi

# ─── visual-regression.yml ─────────────────────────────────────────────────
if [ "$FULL" = "1" ]; then
  step "visual-regression.yml › Playwright snapshot diff"
  if npx playwright test --project="Desktop Chrome" e2e/visual-regression.spec.ts; then
    PASS_COUNT=$((PASS_COUNT+1))
  else
    echo "❌ Visual regression diffs detected"
    FAIL_COUNT=$((FAIL_COUNT+1))
    FAIL_STEPS+=("visual-regression.yml")
    summarize
    exit 1
  fi
else
  skip_with_reason "visual-regression.yml › Playwright" "set FULL=1 to run; takes ~30s + needs browsers installed (npx playwright install chromium)"
fi

# ─── health-monitor.yml ────────────────────────────────────────────────────
if [ "$FULL" = "1" ]; then
  HEALTH_URL="${HEALTH_URL:-http://localhost:3000/api/health}"
  step "health-monitor.yml › health check $HEALTH_URL"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
  if [ "$STATUS" = "200" ]; then
    echo "✅ HTTP 200"
    PASS_COUNT=$((PASS_COUNT+1))
  else
    echo "❌ HTTP $STATUS — server not running?"
    SKIP_COUNT=$((SKIP_COUNT+1))
    SKIP_REASONS+=("health-monitor.yml: HTTP $STATUS — start server with npm run dev")
  fi
else
  skip_with_reason "health-monitor.yml › /api/health" "set FULL=1 to run; needs a booted server (defaults to localhost:3000, override with HEALTH_URL=)"
fi

# ─── Done ──────────────────────────────────────────────────────────────────
summarize
echo
echo "══════════════════════════════════════════"
echo " ✅  All required CI checks passed locally"
echo "══════════════════════════════════════════"
