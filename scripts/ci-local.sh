#!/usr/bin/env bash
# Run every CI check locally before pushing.
#
# Mirrors:
#   - .github/workflows/ci.yml          (lint, prettier, tsc, test:coverage, build)
#   - .github/workflows/security.yml    (custom rules: CSRF/rate-limit/Zod/dangerouslySetInnerHTML)
#   - .github/workflows/docs-truth.yml  (docs:truth)
#
# Skipped (GitHub-only or external services):
#   - TruffleHog secret scan (needs git history + GH action)
#   - Semgrep, CodeQL (containerized GH actions)
#   - OSV scanner (downloads a binary in CI; run manually if needed)
#
# Usage:
#   bash scripts/ci-local.sh
#
# Exits non-zero on the first failure so you find issues fast.

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

step() {
  echo
  echo "──────────────────────────────────────────"
  echo " $1"
  echo "──────────────────────────────────────────"
}

step "1/7  ESLint"
npm run lint

step "2/7  Prettier (check)"
npx prettier --check .

step "3/7  TypeScript (tsc --noEmit)"
npx tsc --noEmit

step "4/7  Unit tests with coverage"
npm run test:coverage

step "5/7  Production build"
npm run build

step "6/7  Documentation truth check"
npm run docs:truth

step "7/7  Custom security rules (mirrors security.yml)"

echo "  → CSRF verification on mutating routes"
for file in $(find app/api -name 'route.ts' \
    -not -path "*/staging-*" \
    -not -path "*/stripe/webhook/*" \
    2>/dev/null); do
  if [ -f "$file" ] && grep -q "export.*POST\|export.*PUT\|export.*DELETE\|export.*PATCH" "$file"; then
    if ! grep -q "verifyCsrfToken" "$file"; then
      echo "    ⚠  $file: POST/PUT/DELETE/PATCH route missing CSRF verification"
      exit 1
    fi
  fi
done

echo "  → Rate limiting on POST routes"
for file in $(find app/api -name 'route.ts' \
    -not -path "*/staging-*" \
    -not -path "*/stripe/webhook/*" \
    2>/dev/null); do
  if [ -f "$file" ] && grep -q "export.*POST" "$file"; then
    if ! grep -q "checkRateLimit" "$file"; then
      echo "    ⚠  $file: POST route missing rate limiting"
      exit 1
    fi
  fi
done

echo "  → Zod validation on POST/PUT routes"
for file in $(find app/api -name 'route.ts' \
    -not -path "*/staging-*" \
    -not -path "*/stripe/webhook/*" \
    -not -path "*/admin/logout/*" \
    2>/dev/null); do
  if [ -f "$file" ] && grep -q "export.*POST\|export.*PUT" "$file"; then
    if ! grep -q "z\.object\|zod" "$file"; then
      echo "    ⚠  $file: Route missing Zod schema validation"
      exit 1
    fi
  fi
done

echo "  → dangerouslySetInnerHTML scan"
if grep -r "dangerouslySetInnerHTML" app/ components/ --include="*.tsx" --include="*.jsx" \
    | grep -v "JSON\.stringify" \
    | grep -vE "components/report/(sections/|ReportPage\.tsx)"; then
  echo "    ⚠  Unauthorized dangerouslySetInnerHTML usage"
  exit 1
fi

echo "  → eval() scan"
if grep -r "\beval\(" app/ lib/ components/ --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" 2>/dev/null; then
  echo "    ⚠  eval() usage detected"
  exit 1
fi

echo "  → Hardcoded secret pattern scan"
if grep -rE "(api[_-]?key|api[_-]?secret|password|secret[_-]?key|private[_-]?key|token)\s*=\s*['\"][^'\"]{20,}" app/ lib/ --include="*.ts" --include="*.tsx" --include="*.js" 2>/dev/null; then
  echo "    ⚠  Possible hardcoded secret"
  exit 1
fi

echo
echo "──────────────────────────────────────────"
echo " ✅  All CI checks passed locally"
echo "──────────────────────────────────────────"
